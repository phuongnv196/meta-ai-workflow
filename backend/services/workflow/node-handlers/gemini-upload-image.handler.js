'use strict';

async function handle(node, inputs, context) {
  const { log } = context;

  // Priority 1: direct upload from UI (base64Data + mimeType stored in node.data)
  if (node.data.base64Data) {
    const mimeType = node.data.mimeType || 'image/jpeg';
    const base64Data = node.data.base64Data.includes(',')
      ? node.data.base64Data.split(',')[1]
      : node.data.base64Data;
    const previewUrl = node.data.previewUrl || `data:${mimeType};base64,${base64Data}`;
    log(`  Gemini Upload: using uploaded file "${node.data.fileName || 'image'}" (${mimeType})`);
    return { base64Data, mimeType, previewUrl, geminiInlineData: true };
  }

  // Priority 2: upstream node passed a base64 data URI (previewUrl or generatedImageUrl)
  for (const inp of inputs) {
    const dataUri = inp.previewUrl || inp.generatedImageUrl || inp.resultUrl || '';
    if (dataUri.startsWith('data:')) {
      const [meta, data] = dataUri.split(',');
      const mimeType = meta.split(':')[1].split(';')[0];
      log(`  Gemini Upload: using base64 data URI from upstream node`);
      return { base64Data: data, mimeType, previewUrl: dataUri, geminiInlineData: true };
    }
    if (inp.base64Data) {
      const mimeType = inp.mimeType || 'image/jpeg';
      const previewUrl = `data:${mimeType};base64,${inp.base64Data}`;
      log(`  Gemini Upload: using base64Data from upstream node`);
      return { base64Data: inp.base64Data, mimeType, previewUrl, geminiInlineData: true };
    }
  }

  throw new Error('Gemini Upload Image: No image found. Upload a file or connect an upstream image node.');
}

module.exports = { handle };
