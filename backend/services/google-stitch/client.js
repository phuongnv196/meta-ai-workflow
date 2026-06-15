'use strict';

/**
 * Google Stitch SDK client wrapper (CommonJS).
 * Uses the SDK's global singleton `stitch` which handles auth via
 * STITCH_API_KEY env var automatically — same pattern as docs/index.js.
 */

const fs = require('fs');

let _stitchModule = null;

async function getStitchModule() {
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
 * Generate a UI screen from text prompt (no image input required).
 * Uses the SDK's project.generate() which has built-in auth.
 * Falls back to edit_screens with no input if generate parsing fails.
 * @param {string} prompt
 * @param {string} [deviceType='DESKTOP'] - MOBILE | DESKTOP | TABLET | AGNOSTIC
 * @returns {Promise<{downloadUrl: string, screenId: string, projectId: string}>}
 */
async function generateFromText(prompt, deviceType = 'DESKTOP') {
  const project = await getOrCreateProject();
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
        prompt,
        deviceType,
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
async function uploadImage(filePath, projectTitle) {
  const project = await getOrCreateProject(projectTitle);
  const screens = await project.upload(filePath);
  const screen = screens[0];
  return {
    screenId: screen.id,
    projectId: project.id,
  };
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
  const stitch = await getStitch();

  const callArgs = {
    projectId,
    selectedScreenIds: screenIds,
    prompt: `Require: Only use the first reference image as the base. Keep the original design, character, maintain the aspect ratio of first reference image and edit: ${prompt}`,
    deviceType,
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

module.exports = {
  getOrCreateProject,
  generateFromText,
  uploadImage,
  editScreens,
  downloadToBase64,
};
