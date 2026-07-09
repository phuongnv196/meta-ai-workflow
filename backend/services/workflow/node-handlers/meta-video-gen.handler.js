'use strict';

const { uploadFile } = require('../../meta_ai');
const { downloadFile } = require('../../meta_ai/uploader');
const { createTempPath, cleanupFile } = require('../../temp-file.service');
const { resolveReferencePlaceholders } = require('../prompt-template');

async function handle(node, inputs, context) {
  const { client, incomingEdges, results, globalRefMap, log } = context;

  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText)?.promptText || '').trim();
  let prompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n') || 'Generate a video';

  // Replace {{reference_xx}} placeholders with real Meta media ids
  const { prompt: resolvedPrompt, replacements } = resolveReferencePlaceholders(prompt, {
    globalRefMap, results, platform: 'meta',
  });
  prompt = resolvedPrompt;
  if (replacements.length) {
    log(`  Resolved ${replacements.length} reference placeholder(s): ${replacements.map(r => `{{${r.name}}}→${r.value}`).join(', ')}`);
  }

  let attachments = [];

  for (const edge of incomingEdges) {
    const sourceId = edge.source;
    const input = results[sourceId];
    if (!input) continue;

    const globalName = globalRefMap[sourceId];
    if (!globalName) continue;

    if (input.generatedImageUrl && input.generatedImageUrl.startsWith('http')) {
      log(`  Downloading generated image for re-upload: ${input.generatedImageUrl.substring(0, 80)}...`);
      const { filePath: tempFile } = createTempPath('gen', '.jpg');
      try {
        await downloadFile(input.generatedImageUrl, tempFile);
        const reUploadedId = await uploadFile(tempFile, 'image/jpeg');
        log(`  Re-uploaded generated image → mediaId: ${reUploadedId}`);
        attachments.push({
          id: reUploadedId,
          mimeType: 'image/jpeg',
          filename: `${globalName}.jpg`,
        });
      } catch (uploadErr) {
        log(`  WARNING: Could not re-upload generated image: ${uploadErr.message}`);
      } finally {
        cleanupFile(tempFile, { info: log, warn: log });
      }
    } else if (input.attachments) {
      input.attachments.forEach(att => {
        const ext = att.filename ? att.filename.split('.').pop() : 'jpg';
        attachments.push({ ...att, filename: `${globalName}.${ext}` });
      });
    }
  }

  // Optimize prompt
  if (attachments.length > 0) {
    if (!prompt.toLowerCase().includes('animate') && !prompt.toLowerCase().includes('video')) {
      prompt = `animate this image: ${prompt}`;
    }
    // Instruction to outpaint white borders if padded image is used
    prompt += `\n\n[CRITICAL DIRECTIVE]: If the reference image contains solid white/blank padding bars (added to extend the canvas), you MUST outpaint and naturally extend the real scene/background into those padding areas so the final video is fully filled edge-to-edge without white borders.`;
  } else {
    if (!prompt.toLowerCase().includes('video') && !prompt.toLowerCase().includes('animate')) {
      prompt = `generate a video of ${prompt}`;
    }
  }

  log(`  Calling Meta AI Video Gen with prompt: "${prompt}" and ${attachments.length} attachments`);
  return await client.chat({ promptText: prompt, attachments, newConversation: true, expectVideo: true });
}

module.exports = { handle };
