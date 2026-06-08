'use strict';

const { downloadFile } = require('../../meta_ai/uploader');
const { uploadImage, editScreens, downloadToBase64 } = require('../../google-stitch/client');
const { createTempPath, cleanupFiles, ensureTempDir } = require('../../temp-file.service');

async function handle(node, inputs, context) {
  const { log } = context;

  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText)?.promptText || inputs.find(i => i.text)?.text || '').trim();
  const prompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n') || 'Edit this design';

  const deviceType = node.data.deviceType || 'DESKTOP';

  // 1. Collect existing screenIds from upstream Stitch nodes (skip re-upload)
  const existingScreenIds = [];
  let existingProjectId = null;

  // 2. Collect image URLs from non-Stitch upstream nodes (need download + upload)
  const imageUrls = [];

  for (const inp of inputs) {
    // If upstream is a Stitch node, reuse its screenId directly
    if (inp.sourceType === 'stitch' && inp.screenId) {
      existingScreenIds.push(inp.screenId);
      if (inp.projectId) existingProjectId = inp.projectId;
      continue;
    }

    const url = inp.generatedImageUrl || inp.resultUrl || inp.videoUrl || inp.previewUrl || '';
    if (url && url.startsWith('http')) {
      imageUrls.push(url);
    }
    if (inp.imageUrls && Array.isArray(inp.imageUrls)) {
      for (const u of inp.imageUrls) {
        if (u && u.startsWith('http')) imageUrls.push(u);
      }
    }
  }

  if (existingScreenIds.length === 0 && imageUrls.length === 0) {
    throw new Error('Stitch Edit requires at least one image input. Connect upstream Stitch or image nodes.');
  }

  log(`  Stitch Edit: prompt="${prompt.slice(0, 80)}" deviceType=${deviceType} stitchScreens=${existingScreenIds.length} imageUrls=${imageUrls.length}`);

  ensureTempDir();
  const tempFiles = [];

  try {
    const screenIds = [...existingScreenIds];
    let projectId = existingProjectId;

    // Download & upload non-Stitch images
    for (let i = 0; i < imageUrls.length; i++) {
      const { filePath: tempPath } = createTempPath('stitch_edit_input', '.jpg');
      tempFiles.push(tempPath);

      log(`  Downloading image ${i + 1}/${imageUrls.length}: ${imageUrls[i].slice(0, 100)}`);
      await downloadFile(imageUrls[i], tempPath);

      log(`  Uploading image ${i + 1} to Stitch...`);
      const uploaded = await uploadImage(tempPath);
      screenIds.push(uploaded.screenId);
      if (!projectId) projectId = uploaded.projectId;
      log(`  Uploaded → screenId=${uploaded.screenId}`);
    }

    // Call edit_screens with all screen IDs
    log(`  Calling Stitch edit_screens with ${screenIds.length} screen(s)...`);
    const result = await editScreens(projectId, screenIds, prompt, deviceType);
    log(`  Stitch Edit completed → downloadUrl=${result.downloadUrl?.slice(0, 100)}`);

    // Convert to base64 for downstream
    let base64Data = '';
    let dataUri = '';
    try {
      const b64 = await downloadToBase64(result.downloadUrl);
      base64Data = b64.base64Data;
      dataUri = b64.dataUri;
      log(`  Stitch Edit: base64 ready (${Math.round(base64Data.length / 1024)}KB)`);
    } catch (err) {
      log(`  Stitch Edit: base64 download skipped: ${err.message}`);
    }

    return {
      resultUrl: result.downloadUrl,
      generatedImageUrl: result.downloadUrl,
      previewUrl: dataUri || result.downloadUrl,
      screenId: result.screenId,
      projectId,
      base64Data,
      sourceType: 'stitch',
    };
  } finally {
    cleanupFiles(tempFiles, { info: log, warn: log });
  }
}

module.exports = { handle };
