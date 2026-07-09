'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const { createTempPath } = require('../../temp-file.service');
const config = require('../../../config/env');

/**
 * Image Resize node handler — center-crops an image to the selected aspect ratio.
 * Supports 16:9, 9:16, 1:1, 4:3, 3:4, or custom W:H.
 */
async function handle(node, inputs, context) {
  const { log } = context;

  const ratio = node.data.ratio || '16:9';
  let rW, rH;

  if (ratio === 'custom') {
    rW = parseInt(node.data.customW) || 16;
    rH = parseInt(node.data.customH) || 9;
  } else {
    const parts = ratio.split(':');
    rW = parseInt(parts[0]);
    rH = parseInt(parts[1]);
  }

  log(`  Image Resize: target ratio ${rW}:${rH}`);

  let inputPath = null;
  let tempInputPath = null;

  // Always source from upstream nodes — node.data fields are stale result data from previous runs
  for (const inp of inputs) {
    // data URI (base64 embedded)
    const dataUri = inp.previewUrl || inp.generatedImageUrl || inp.resultUrl || '';
    if (dataUri.startsWith('data:image')) {
      const [meta, data] = dataUri.split(',');
      const mimeType = meta.split(':')[1].split(';')[0];
      const ext = mimeType.includes('png') ? '.png' : '.jpg';
      const { filePath } = createTempPath('resize_in', ext);
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      inputPath = filePath;
      tempInputPath = filePath;
      log(`  Using base64 data URI from upstream node`);
      break;
    }

    if (inp.base64Data) {
      const mimeType = inp.mimeType || 'image/jpeg';
      const ext = mimeType.includes('png') ? '.png' : '.jpg';
      const { filePath } = createTempPath('resize_in', ext);
      const b64 = inp.base64Data.includes(',') ? inp.base64Data.split(',')[1] : inp.base64Data;
      fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
      inputPath = filePath;
      tempInputPath = filePath;
      log(`  Using base64Data from upstream node`);
      break;
    }

    // HTTP URL (remote or local temp server)
    const imgUrl = inp.generatedImageUrl || inp.resultUrl || inp.videoUrl || '';
    if (imgUrl && imgUrl.startsWith('http')) {
      inputPath = imgUrl;
      log(`  Using image URL: ${imgUrl}`);
      break;
    }
  }

  if (!inputPath) {
    throw new Error('Image Resize: No image found. Upload an image or connect an upstream image node.');
  }

  // Get source dimensions via ffprobe
  log(`  Probing image dimensions...`);
  const probeOutput = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0',
    inputPath,
  ], { encoding: 'utf-8', timeout: 30000 });

  const parts = probeOutput.trim().split(',');
  const srcW = parseInt(parts[0]);
  const srcH = parseInt(parts[1]);

  if (!srcW || !srcH) {
    throw new Error(`Image Resize: Could not determine image dimensions from source.`);
  }

  log(`  Source: ${srcW}x${srcH}, target ratio: ${rW}:${rH}`);

  // Pad-only algorithm: never shrink the source, only add white padding
  // - source wider than target → keep width, pad height
  // - source taller than target → keep height, pad width
  // - same ratio                → no padding (copy as-is)
  const targetRatio = rW / rH;
  const sourceRatio = srcW / srcH;

  let outW, outH;
  if (sourceRatio > targetRatio) {
    // Source is wider → keep width, extend height downward
    outW = srcW;
    outH = Math.ceil(srcW * rH / rW);
  } else {
    // Source is taller (or same) → keep height, extend width sideways
    outH = srcH;
    outW = Math.ceil(srcH * rW / rH);
  }

  // Ensure even dimensions (required by encoders)
  if (outW % 2 !== 0) outW++;
  if (outH % 2 !== 0) outH++;

  const padX = Math.max(0, Math.floor((outW - srcW) / 2));
  const padY = Math.max(0, Math.floor((outH - srcH) / 2));

  log(`  Output canvas: ${outW}x${outH}, padding: left/right=${padX}px  top/bottom=${padY}px`);

  const { filename: outFilename, filePath: outFilePath } = createTempPath('resized', '.jpg');

  // Pad source to exact canvas size with white — source pixels are never scaled
  execFileSync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', `pad=${outW}:${outH}:${padX}:${padY}:color=white`,
    '-frames:v', '1',
    '-q:v', '2',
    outFilePath,
  ], { timeout: 60000 });

  log(`  Resized successfully → ${outFilename}`);

  // Cleanup temp input if we created one
  if (tempInputPath) {
    try { fs.unlinkSync(tempInputPath); } catch (_) {}
  }

  let base64Data = null;
  try {
    base64Data = fs.readFileSync(outFilePath, { encoding: 'base64' });
  } catch (e) {
    log(`  Warning: could not read resized image as base64: ${e.message}`);
  }

  const publicUrl = `${config.baseUrl}/temp/${outFilename}`;
  const dataUri = base64Data ? `data:image/jpeg;base64,${base64Data}` : publicUrl;
  return {
    generatedImageUrl: publicUrl,   // HTTP URL — used by stitch_upload, gemini, etc.
    resultUrl: dataUri,             // base64 data URI — renders inline in Node.jsx <img>
    previewUrl: dataUri,
    base64Data,
    mimeType: 'image/jpeg',
    filename: outFilename,
    ratio: `${rW}:${rH}`,
    attachments: [],
  };
}

module.exports = { handle };
