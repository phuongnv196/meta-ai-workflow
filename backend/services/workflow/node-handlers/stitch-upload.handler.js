'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const { downloadFile } = require('../../meta_ai/uploader');
const { uploadImage } = require('../../google-stitch/client');
const { createTempPath, cleanupFiles, ensureTempDir } = require('../../temp-file.service');

async function handle(node, inputs, context) {
  const { log } = context;

  ensureTempDir();
  const tempFiles = [];

  try {
    let tempImagePath;

    // Priority 1: base64 data from node UI upload
    if (node.data.base64Data) {
      log(`  Stitch Upload: using uploaded file "${node.data.fileName || 'image'}"`);
      const ext = (node.data.mimeType || 'image/jpeg').includes('png') ? '.png' : '.jpg';
      const { filePath } = createTempPath('stitch_upload', ext);
      tempFiles.push(filePath);
      const b64Str = node.data.base64Data.includes(',') ? node.data.base64Data.split(',')[1] : node.data.base64Data;
      fs.writeFileSync(filePath, Buffer.from(b64Str, 'base64'));
      tempImagePath = filePath;
    }

    // Priority 2: image URL from upstream node
    if (!tempImagePath) {
      const imageInput = inputs.find(i => {
        const url = i.generatedImageUrl || i.resultUrl || i.previewUrl || '';
        return url && url.startsWith('http');
      });
      if (imageInput) {
        const url = imageInput.generatedImageUrl || imageInput.resultUrl || imageInput.previewUrl;
        log(`  Stitch Upload: downloading from upstream URL: ${url.slice(0, 100)}`);
        const { filePath } = createTempPath('stitch_upload', '.jpg');
        tempFiles.push(filePath);
        await downloadFile(url, filePath);
        tempImagePath = filePath;
      }
    }

    // Priority 3: base64 data from upstream node
    if (!tempImagePath) {
      const b64Input = inputs.find(i => i.base64Data);
      if (b64Input) {
        log(`  Stitch Upload: using base64 data from upstream node`);
        const { filePath } = createTempPath('stitch_upload', '.jpg');
        tempFiles.push(filePath);
        const b64Str = b64Input.base64Data.includes(',') ? b64Input.base64Data.split(',')[1] : b64Input.base64Data;
        fs.writeFileSync(filePath, Buffer.from(b64Str, 'base64'));
        tempImagePath = filePath;
      }
    }

    if (!tempImagePath) {
      throw new Error('Stitch Upload requires an image. Upload a file or connect an upstream image node.');
    }

    // Rescale if image exceeds Stitch API's dimension limit (~2048px max)
    try {
      const probeOut = execFileSync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
        tempImagePath,
      ], { encoding: 'utf-8', timeout: 15000 }).trim();
      const [imgW, imgH] = probeOut.split(',').map(Number);
      const MAX_DIM = 2048;
      if (imgW > MAX_DIM || imgH > MAX_DIM) {
        const scale = MAX_DIM / Math.max(imgW, imgH);
        const newW = Math.floor(imgW * scale / 2) * 2;
        const newH = Math.floor(imgH * scale / 2) * 2;
        log(`  Stitch: image ${imgW}x${imgH} exceeds limit, rescaling to ${newW}x${newH}`);
        const { filePath: scaledPath } = createTempPath('stitch_scaled', '.jpg');
        tempFiles.push(scaledPath);
        execFileSync('ffmpeg', [
          '-y', '-i', tempImagePath,
          '-vf', `scale=${newW}:${newH}`,
          '-q:v', '3',
          scaledPath,
        ], { timeout: 30000 });
        tempImagePath = scaledPath;
      }
    } catch (scaleErr) {
      log(`  Stitch: rescale probe failed (${scaleErr.message}), uploading original`);
    }

    // Upload to Stitch
    log(`  Uploading image to Google Stitch...`);
    const result = await uploadImage(tempImagePath, context.stitchProjectId || null);
    log(`  Stitch Upload completed → screenId=${result.screenId} projectId=${result.projectId}`);

    // Read back as base64 for downstream non-Stitch nodes
    const fileBuffer = fs.readFileSync(tempImagePath);
    const base64Data = fileBuffer.toString('base64');
    const mimeType = node.data.mimeType || 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${base64Data}`;

    return {
      screenId: result.screenId,
      projectId: result.projectId,
      base64Data,
      previewUrl: node.data.previewUrl || dataUri,
      sourceType: 'stitch',
    };
  } finally {
    cleanupFiles(tempFiles, { info: log, warn: log });
  }
}

module.exports = { handle };
