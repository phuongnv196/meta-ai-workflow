'use strict';

/**
 * Google Stitch SDK client wrapper (CommonJS).
 * Uses the SDK's global singleton `stitch` which handles auth via
 * STITCH_API_KEY env var automatically — same pattern as docs/index.js.
 */

const fs = require('fs');
const envConfig = require('../../config/env');

let _stitchModule = null;

// In-memory cache: projectId → project object (avoids re-fetching just-created projects)
const _projectCache = new Map();

// Per-project serialization queue: limits concurrent upload/edit_screens calls
// against the SAME Stitch project. We set this to 2 to speed up execution,
// but keep it constrained to avoid severe race conditions on Google's side.
class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release() {
    this.active--;
    if (this.queue.length > 0) {
      this.active++;
      const next = this.queue.shift();
      next();
    }
  }
}

const _projectSemaphores = new Map();

async function queueForProject(projectId, task) {
  const key = projectId || '__no_project__';
  let sem = _projectSemaphores.get(key);
  if (!sem) {
    sem = new Semaphore(3); // Allow 3 nodes to run concurrently per project
    _projectSemaphores.set(key, sem);
  }

  await sem.acquire();
  try {
    return await task();
  } finally {
    sem.release();
  }
}

async function getStitchModule() {
  if (!_projectCache.get('STITCH_API_KEY')) {
    const apiKey = await getStitchAPIKey();
    if (apiKey) {
      process.env.STITCH_API_KEY = apiKey;
      _projectCache.set('STITCH_API_KEY', apiKey);
    }
  }
  
  if (!_stitchModule) {
    _stitchModule = await import('@google/stitch-sdk');
  }
  return _stitchModule;
}

/**
 * Return the pre-configured global `stitch` singleton from the SDK.
 * It reads STITCH_API_KEY from process.env automatically.
 */
async function getStitch() {
  const mod = await getStitchModule();
  return mod.stitch;
}

/**
 * Get or create a Stitch project by title.
 */
async function getOrCreateProject(title = 'Vibes AI Workflow') {
  const stitch = await getStitch();
  const projects = await stitch.projects();
  let project = projects.find(p => p.data?.title === title);
  if (!project) {
    project = await stitch.createProject(title);
  }
  return project;
}

/**
 * Always create a brand-new Stitch project (never reuse an existing one).
 * Caches the project object so getProjectById can resolve it instantly.
 */
async function createFreshProject(title) {
  const stitch = await getStitch();
  const project = await stitch.createProject(title);
  _projectCache.set(project.id, project);
  return project;
}

/**
 * Get an existing Stitch project by ID.
 * Uses in-memory cache first to avoid API round-trips for just-created projects.
 */
async function getProjectById(projectId) {
  if (_projectCache.has(projectId)) return _projectCache.get(projectId);
  const stitch = await getStitch();
  const projects = await stitch.projects();
  const found = projects.find(p => p.id === projectId) || null;
  if (found) _projectCache.set(projectId, found);
  return found;
}

/**
 * Generate a UI screen from text prompt (no image input required).
 * Uses the SDK's project.generate() which has built-in auth.
 * Falls back to edit_screens with no input if generate parsing fails.
 * @param {string} prompt
 * @param {string} [deviceType='DESKTOP'] - MOBILE | DESKTOP | TABLET | AGNOSTIC
 * @returns {Promise<{downloadUrl: string, screenId: string, projectId: string}>}
 */
async function generateFromText(prompt, deviceType = 'DESKTOP', existingProjectId = null) {
  return queueForProject(existingProjectId, () => _generateFromTextInternal(prompt, deviceType, existingProjectId));
}

async function _generateFromTextInternal(prompt, deviceType, existingProjectId) {
  const project = existingProjectId
    ? (await getProjectById(existingProjectId)) || await getOrCreateProject()
    : await getOrCreateProject();
  const projectId = project.id;

  // Attempt 1: SDK's high-level generate method
  try {
    const screen = await project.generate(prompt, deviceType);
    const imageUrl = await screen.getImage();
    return { downloadUrl: imageUrl, screenId: screen.id, projectId };
  } catch (err) {
    console.log(`[Stitch] project.generate() failed: ${err.message}`);

    // Attempt 2: use edit_screens with empty screen list as fallback
    // edit_screens is proven to work via docs/index.js
    try {
      const stitch = await getStitch();
      const rawResult = await stitch.callTool('edit_screens', {
        projectId,
        selectedScreenIds: [],
        prompt: `[CRITICAL DIRECTIVE: ABSOLUTE SOURCE FIDELITY]
- PRIMARY SOURCE: Use ONLY the first reference image as the absolute, non-negotiable base. 
- ASPECT RATIO: Strictly maintain the exact aspect ratio of the first reference image. Do not crop or stretch.
- DESIGN PRESERVATION: Preserve 100% of the original character features, product design, clothing, textures, and structural layout. Zero creative deviation or hallucination allowed.
- BLANK PADDING FILL: If the reference image contains solid white/blank padding bars (added purely to extend the canvas to the target aspect ratio), you MUST outpaint and naturally extend the real scene/background into those padding areas so the final image is fully filled edge-to-edge with no visible white/blank regions. This is the one exception to "zero creative deviation" — only the blank padding areas may be extended, never the original subject content.
- ZERO ADDITIONS: Do not introduce any new characters, objects, or themes outside of what is explicitly visible in the first reference image.
- TASK: Perform the edit specified below, treating the first reference image as the immutable ground truth for all visual identities: ${prompt}`,
        deviceType,
        modelId: 'GEMINI_3_1_PRO'
      });

      const screen = rawResult?.outputComponents?.[0]?.design?.screens?.[0];
      const downloadUrl = screen?.screenshot?.downloadUrl || '';
      if (downloadUrl) {
        return { downloadUrl, screenId: screen?.id || '', projectId };
      }
    } catch (fallbackErr) {
      console.log(`[Stitch] edit_screens fallback failed: ${fallbackErr.message}`);
    }

    // Attempt 3: try generate_screen tool name variants
    try {
      const stitch = await getStitch();
      for (const toolName of ['generate_screen', 'generate_screen_from_text']) {
        try {
          const rawResult = await stitch.callTool(toolName, {
            projectId, prompt, deviceType,
          });
          const screen = rawResult?.outputComponents?.[0]?.design?.screens?.[0]
            || rawResult?.screens?.[0] || rawResult;
          const downloadUrl = screen?.screenshot?.downloadUrl
            || screen?.downloadUrl || screen?.imageUrl || '';
          if (downloadUrl) {
            return { downloadUrl: `${downloadUrl}=s1600`, screenId: screen?.id || '', projectId };
          }
        } catch (toolErr) {
          console.log(`[Stitch] callTool(${toolName}) failed: ${toolErr.message}`);
        }
      }
    } catch (_) {}

    // All attempts failed — rethrow original error
    throw err;
  }
}

/**
 * Upload a local image file to a Stitch project.
 * @param {string} filePath - absolute path to the image file
 * @param {string} [projectTitle]
 * @returns {Promise<{screenId: string, projectId: string}>}
 */
async function uploadImage(filePath, existingProjectId = null) {
  return queueForProject(existingProjectId, async () => {
    const project = existingProjectId
      ? (await getProjectById(existingProjectId)) || await getOrCreateProject()
      : await getOrCreateProject();
    const screens = await project.upload(filePath);
    const screen = screens[0];
    return {
      screenId: screen.id,
      projectId: project.id,
    };
  });
}

/**
 * Edit/combine screens using reference images + prompt.
 * Mirrors the pattern from docs/index.js using stitch.callTool("edit_screens").
 * @param {string} projectId
 * @param {string[]} screenIds - IDs of uploaded reference screens
 * @param {string} prompt
 * @param {string} [deviceType='DESKTOP']
 * @returns {Promise<{downloadUrl: string, screenId: string}>}
 */
async function editScreens(projectId, screenIds, prompt, deviceType = 'DESKTOP') {
  return queueForProject(projectId, async () => {
    const stitch = await getStitch();

    const callArgs = {
      projectId,
      selectedScreenIds: screenIds,
      prompt: `[CRITICAL DIRECTIVE: ABSOLUTE SOURCE FIDELITY]
- PRIMARY SOURCE: Use ONLY the first reference image as the absolute, non-negotiable base. 
- ASPECT RATIO: Strictly maintain the exact aspect ratio of the first reference image. Do not crop or stretch.
- DESIGN PRESERVATION: Preserve 100% of the original character features, product design, clothing, textures, and structural layout. Zero creative deviation or hallucination allowed.
- BLANK PADDING FILL: If the reference image contains solid white/blank padding bars (added purely to extend the canvas to the target aspect ratio), you MUST outpaint and naturally extend the real scene/background into those padding areas so the final image is fully filled edge-to-edge with no visible white/blank regions. This is the one exception to "zero creative deviation" — only the blank padding areas may be extended, never the original subject content.
- ZERO ADDITIONS: Do not introduce any new characters, objects, or themes outside of what is explicitly visible in the first reference image.
- TASK: Perform the edit specified below, treating the first reference image as the immutable ground truth for all visual identities: ${prompt}`,
      deviceType,
      modelId: 'GEMINI_3_1_PRO'
    };
    console.log(`[Stitch] edit_screens args: ${JSON.stringify(callArgs)}`);

    const rawResult = await stitch.callTool('edit_screens', callArgs);
    console.log(`[Stitch] edit_screens raw result: ${JSON.stringify(rawResult).slice(0, 1000)}`);

    const screen = rawResult?.outputComponents?.[0]?.design?.screens?.[0];
    if (!screen || !screen.screenshot?.downloadUrl) {
      throw new Error('Stitch edit_screens did not return a valid screenshot. Raw: ' + JSON.stringify(rawResult).slice(0, 500));
    }

    return {
      downloadUrl: `${screen.screenshot.downloadUrl}=s1600`,
      screenId: screen.id,
    };
  });
}

/**
 * Download a URL and return its base64 data + data URI.
 * @param {string} url
 * @returns {Promise<{base64Data: string, dataUri: string}>}
 */
async function downloadToBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'image/png';
  const base64Data = buffer.toString('base64');
  return {
    base64Data,
    dataUri: `data:${contentType};base64,${base64Data}`,
  };
}

async function getAt() {
    const res = await fetch('https://stitch.withgoogle.com', {
        method: 'GET',
        headers: {
            'Cookie': envConfig.stitchCookie
        }
    });
    var data = await res.text();
    const regex = /"SNlM0e":"(.+?)"/gm;
    var m = regex.exec(data);
    if (m && m[1]) {
        var atEncode = encodeURIComponent(m[1]);
        return atEncode;
    }
    return null;
}

async function deleteProject(projectId) {
    const at = await getAt();
    if (!at) {
      throw new Error('deleteProject: could not obtain "at" CSRF token (check STITCH_COOKIE validity).');
    }

    const raw = `f.req=%5B%5B%5B%22hxYVdb%22%2C%22%5B%5C%22projects%2F${projectId}%5C%22%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&at=${at}&`;

    const res = await fetch(`https://stitch.withgoogle.com/_/Nemo/data/batchexecute?rpcids=hxYVdb&source-path=%2Fprojects%2F${projectId}`, {
      method: "POST",
      headers: {
        'Cookie': envConfig.stitchCookie,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: raw,
      redirect: "follow"
    });

    const bodyText = await res.text();

    if (!res.ok) {
      throw new Error(`deleteProject: HTTP ${res.status} ${res.statusText} — ${bodyText.slice(0, 300)}`);
    }

    // batchexecute always returns HTTP 200 even for RPC-level errors; detect them explicitly.
    if (bodyText.includes('"er"') || bodyText.includes('EXCEPTION')) {
      throw new Error(`deleteProject: RPC returned an error — ${bodyText.slice(0, 300)}`);
    }

    console.log(`[Stitch] deleteProject(${projectId}) succeeded.`);
    return true;
}

async function getStitchAPIKey() {
  const at = await getAt();
  const raw = `f.req=%5B%5B%5B%22QvqTSb%22%2C%22%5B%5D%22%2Cnull%2C%223%22%5D%5D%5D&at=${at}&`;
  
  const res = await fetch(`https://stitch.withgoogle.com/_/Nemo/data/batchexecute?rpcids=QvqTSb&source-path=%2Fsettings`, {
    method: "POST",
    headers: {
      'Cookie': envConfig.stitchCookie,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: raw,
    redirect: "follow"
  });

  if (res.ok) {
    var data = await res.text();
    if (data.indexOf('Auto-generated Stitch API Key') !== -1) {
      // TODO: parse the API key from the response
      const regex = /Auto-generated Stitch API Key\\",\\"(.+?)\\"/gm;
      const m = regex.exec(data);
      if (m && m[1]) {
        return m[1];
      }
    }
  }

  return null;
}

async function getListProjects() {
  const stitch = await getStitch();
  const projects = await stitch.projects();
  return projects;
}

module.exports = {
  getOrCreateProject,
  createFreshProject,
  generateFromText,
  uploadImage,
  editScreens,
  downloadToBase64,
  deleteProject,
  getStitchAPIKey,
  getListProjects
};
