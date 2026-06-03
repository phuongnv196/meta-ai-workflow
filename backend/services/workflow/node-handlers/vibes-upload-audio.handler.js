'use strict';

const fs = require('fs');
const path = require('path');

async function handle(node, inputs, context) {
  const { vibeClient, log } = context;

  let buf;
  let fileName;
  const mimeType = node.data.mimeType || 'audio/mpeg';

  if (node.data.base64Data) {
    // Provided as base64 (e.g. from browser file upload stored in node data)
    buf      = Buffer.from(node.data.base64Data, 'base64');
    fileName = node.data.fileName || 'audio.mp3';
  } else {
    // Provided as a file path (e.g. from server-side config or upstream node)
    const filePath =
      node.data.filePath ||
      (inputs.find(i => i.filePath)?.filePath) ||
      null;
    if (!filePath) {
      throw new Error('vibes_upload_audio: no base64Data or filePath found in node config or inputs');
    }
    buf      = fs.readFileSync(filePath);
    fileName = node.data.fileName || path.basename(filePath);
  }

  log(`  Vibes uploadAudio: "${fileName}"`);

  const blob   = new Blob([buf], { type: mimeType });
  const result = await vibeClient.uploadAudio(blob, fileName);
  const cdnUrl = result.cdnUrl ?? result.url ?? null;

  log(`  Vibes uploadAudio done → mediaEntId=${result.mediaEntId}  cdnUrl=${String(cdnUrl).slice(0, 80)}`);
  return { mediaEntId: result.mediaEntId, cdnUrl, audioUrl: cdnUrl };
}

module.exports = { handle };
