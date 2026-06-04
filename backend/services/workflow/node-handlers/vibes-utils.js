'use strict';

/**
 * Ensures we have a Vibes mediaEntId for an input.
 * If the input already has mediaEntId, returns it directly.
 * Otherwise downloads the image URL or uses base64Data, uploads to the
 * Vibes project, and returns the resulting mediaEntId.
 *
 * @param {object} input       - upstream node result object
 * @param {object} vibeClient  - VibeAI client instance
 * @param {string} projectId   - shared Vibes project ID
 * @param {Function} log
 * @returns {string|null}      mediaEntId or null on failure
 */
async function ensureVibesMediaEntId(input, vibeClient, projectId, log) {
  if (input.mediaEntId) return input.mediaEntId;

  const mimeType = input.mimeType || 'image/jpeg';
  const fileName = input.filename || input.fileName || 'image.jpg';

  let buffer = null;

  if (input.base64Data) {
    const b64 = input.base64Data.includes(',') ? input.base64Data.split(',')[1] : input.base64Data;
    buffer = Buffer.from(b64, 'base64');
  } else {
    const imageUrl = input.generatedImageUrl || input.url || input.previewUrl || null;
    if (!imageUrl) return null;

    log(`  Auto-uploading image to Vibes project: ${imageUrl.slice(0, 80)}`);
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      log(`  Warning: could not download image for auto-upload: ${e.message}`);
      return null;
    }
  }

  try {
    const blob = new Blob([buffer], { type: mimeType });
    if (projectId) {
      const result = await vibeClient.projectUploadMedia(projectId, blob, fileName);
      const mediaEntId = result.mediaEntId || result.id;
      log(`  Auto-upload to project successful: mediaEntId=${mediaEntId}`);
      return mediaEntId;
    } else {
      const imageUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
      const result = await vibeClient.uploadImage(imageUri);
      const mediaEntId = result.mediaEntId;
      log(`  Auto-upload (no project) successful: mediaEntId=${mediaEntId}`);
      return mediaEntId;
    }
  } catch (e) {
    log(`  Warning: auto-upload to Vibes failed: ${e.message}`);
    return null;
  }
}

module.exports = { ensureVibesMediaEntId };
