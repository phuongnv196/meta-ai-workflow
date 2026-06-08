'use strict';

const fs = require('fs');
const { downloadFile } = require('../../meta_ai/uploader');
const { generateFromText, uploadImage, editScreens, downloadToBase64 } = require('../../google-stitch/client');
const { createTempPath, cleanupFiles, ensureTempDir } = require('../../temp-file.service');

async function handle(node, inputs, context) {
  const { log } = context;

  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText)?.promptText || inputs.find(i => i.text)?.text || '').trim();
  const prompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n') || 'Generate a modern UI screen';

  const deviceType = node.data.deviceType || 'DESKTOP';

  // Collect reference images from upstream nodes
  const stitchScreenIds = [];
  let stitchProjectId = null;
  const nonStitchInputs = []; // { url?, base64? }

  for (const inp of inputs) {
    // Upstream Stitch node → reuse screenId directly
    if (inp.sourceType === 'stitch' && inp.screenId) {
      stitchScreenIds.push(inp.screenId);
      if (inp.projectId) stitchProjectId = inp.projectId;
      continue;
    }
    // Skip text-only inputs
    if (!inp.generatedImageUrl && !inp.resultUrl && !inp.previewUrl && !inp.base64Data) continue;

    const url = inp.generatedImageUrl || inp.resultUrl || '';
    if (url && url.startsWith('http')) {
      nonStitchInputs.push({ url });
    } else if (inp.base64Data) {
      nonStitchInputs.push({ base64: inp.base64Data });
    }
  }

  const hasReferences = stitchScreenIds.length > 0 || nonStitchInputs.length > 0;

  log(`  Stitch Generate: prompt="${prompt.slice(0, 80)}" deviceType=${deviceType} stitchRefs=${stitchScreenIds.length} otherRefs=${nonStitchInputs.length}`);

  let result;

  if (hasReferences) {
    // --- Reference mode: upload non-Stitch images, then call edit_screens ---
    ensureTempDir();
    const tempFiles = [];
    try {
      const screenIds = [...stitchScreenIds];
      let projectId = stitchProjectId;

      for (let i = 0; i < nonStitchInputs.length; i++) {
        const inp = nonStitchInputs[i];
        const { filePath: tempPath } = createTempPath('stitch_gen_ref', '.jpg');
        tempFiles.push(tempPath);

        if (inp.url) {
          log(`  Downloading reference ${i + 1}: ${inp.url.slice(0, 100)}`);
          await downloadFile(inp.url, tempPath);
        } else if (inp.base64) {
          log(`  Writing base64 reference ${i + 1} to temp file`);
          const b64Str = inp.base64.includes(',') ? inp.base64.split(',')[1] : inp.base64;
          fs.writeFileSync(tempPath, Buffer.from(b64Str, 'base64'));
        }

        log(`  Uploading reference ${i + 1} to Stitch...`);
        const uploaded = await uploadImage(tempPath);
        screenIds.push(uploaded.screenId);
        if (!projectId) projectId = uploaded.projectId;
        log(`  Uploaded → screenId=${uploaded.screenId}`);
      }

      log(`  Calling edit_screens with ${screenIds.length} reference(s) + prompt`);
      const editResult = await editScreens(projectId, screenIds, prompt, deviceType);
      result = { downloadUrl: editResult.downloadUrl, screenId: editResult.screenId, projectId };
    } finally {
      cleanupFiles(tempFiles, { info: log, warn: log });
    }
  } else {
    // --- Text-only mode: generate from prompt ---
    try {
      result = await generateFromText(prompt, deviceType);
    } catch (err) {
      log(`  Stitch Generate error: ${err.message}`);
      throw err;
    }
  }

  log(`  Stitch Generate completed → downloadUrl=${(result.downloadUrl || '').slice(0, 120)}`);

  // Download screenshot to base64 for downstream nodes
  let base64Data = '';
  let dataUri = '';
  try {
    const b64 = await downloadToBase64(result.downloadUrl);
    base64Data = b64.base64Data;
    dataUri = b64.dataUri;
    log(`  Stitch Generate: base64 ready (${Math.round(base64Data.length / 1024)}KB)`);
  } catch (err) {
    log(`  Stitch Generate: base64 download skipped: ${err.message}`);
  }

  return {
    resultUrl: result.downloadUrl,
    generatedImageUrl: result.downloadUrl,
    previewUrl: dataUri || result.downloadUrl,
    screenId: result.screenId,
    projectId: result.projectId,
    base64Data,
    sourceType: 'stitch',
  };
}

module.exports = { handle };
