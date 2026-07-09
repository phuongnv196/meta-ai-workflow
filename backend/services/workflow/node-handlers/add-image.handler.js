'use strict';

/**
 * Add Image node handler — loads an image uploaded via the UI as base64.
 * No external API calls. Output is compatible with image_resize, gemini_upload_image,
 * vibes_upload_image, stitch_upload, and any other node that accepts base64/previewUrl.
 */
async function handle(node, _inputs, context) {
  const { log } = context;

  if (!node.data.base64Data) {
    throw new Error('Add Image: No image found. Please upload an image file in the node.');
  }

  const mimeType = node.data.mimeType || 'image/jpeg';
  const fileName = node.data.fileName || 'image.jpg';
  const b64 = node.data.base64Data.includes(',')
    ? node.data.base64Data.split(',')[1]
    : node.data.base64Data;

  const previewUrl = `data:${mimeType};base64,${b64}`;

  log(`  Add Image: "${fileName}" (${mimeType}), ${Math.round(b64.length * 0.75 / 1024)} KB`);

  return {
    base64Data: b64,
    mimeType,
    filename: fileName,
    fileName,
    previewUrl,
    generatedImageUrl: previewUrl,
    resultUrl: previewUrl,
  };
}

module.exports = { handle };
