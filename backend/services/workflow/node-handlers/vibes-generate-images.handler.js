'use strict';

const { pollBatch } = require('./vibes-poll-batch');
const { ensureVibesMediaEntId } = require('./vibes-utils');

async function handle(node, inputs, context) {
  const { vibeClient, projectId: sharedProjectId, log } = context;

  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText)?.promptText || inputs.find(i => i.text)?.text || '').trim();
  let prompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n') || 'A beautiful image';

  const count = Number(node.data.count) || 2;
  const projectId = node.data.projectId || sharedProjectId;

  // Find image inputs (exclude audio inputs and text-only sources like meta_chat)
  const imageInputs = inputs.filter(i => !i.audioUrl && !i.cdnUrl && i.sourceType !== 'text');
  const mediaEntId = await (async () => {
    for (const inp of imageInputs) {
      const id = await ensureVibesMediaEntId(inp, vibeClient, projectId, log);
      if (id) return id;
    }
    return null;
  })();

  if (mediaEntId) {
    prompt += `\n\n[CRITICAL DIRECTIVE]: If the reference image contains solid white/blank padding bars (added to extend the canvas), you MUST outpaint and naturally extend the real scene/background into those padding areas so the final image is fully filled edge-to-edge.`;
    log(`  Vibes generateImageEdit: prompt="${prompt.slice(0, 60)}" sourceImageEntId=${mediaEntId}`);

    const payload = {
      sourceImageEntId: mediaEntId,
      editPrompt: prompt,
      ...(projectId ? { projectId } : {})
    };
    
    log(`  generateImageEdit payload: ${JSON.stringify(payload).slice(0, 300)}`);
    const genResult = await vibeClient.generateImageEdit(payload);
    log(`  generateImageEdit response: ${JSON.stringify(genResult).slice(0, 300)}`);
    
    const batchId = genResult.batchId || genResult.id || (genResult.data && genResult.data.batchId);
    if (!batchId) {
      log(`  Warning: generateImageEdit did not return a clear batchId, using result directly.`);
      return { batchId: null, items: [], imageUrls: [], generatedImageUrl: null, resultUrl: null };
    }

    const items = await pollBatch(vibeClient, batchId, log, node.data.timeoutMs || 180_000);
    const imageUrls = items.map(it => it.imageUrl ?? it.url ?? it.videoUrl).filter(Boolean);
    log(`  Vibes generateImageEdit done → ${imageUrls.length} image(s)`);

    return {
      batchId,
      imageUrls,
      generatedImageUrl: imageUrls[0] ?? null,
      resultUrl:         imageUrls[0] ?? null,
      items,
    };
  }

  // Step 1: create batch record
  const batchId = `batch-${Date.now()}`;
  
  if (mediaEntId) {
    prompt += `\n\n[CRITICAL DIRECTIVE]: If the reference image contains solid white/blank padding bars (added to extend the canvas), you MUST outpaint and naturally extend the real scene/background into those padding areas so the final image is fully filled edge-to-edge.`;
  }
  log(`  Vibes generateImages: prompt="${prompt.slice(0, 60)}" count=${count} mediaEntId=${mediaEntId || 'none'} batchId=${batchId}`);

  await vibeClient.generateBatches({
    id:         batchId,
    type:       'images',
    prompt,
    timestamp:  Date.now(),
    isComplete: false,
    config:     node.data.config || {},
    projectId:  projectId || undefined,
    content:    Array.from({ length: count }, (_, i) => ({
      id:        `${batchId}-content-${i}`,
      type:      'image',
      isLoading: true,
    })),
  });

  // Step 2: trigger generation
  const genPayload = {
    batchId,
    inputs: Array.from({ length: count }, () => ({
      type:            'variation',
      image_prompt:    mediaEntId ?? prompt,
      original_prompt: prompt,
      config:          node.data.config || {},
    })),
    config: node.data.config || {},
  };
  log(`  generateImages payload: ${JSON.stringify(genPayload).slice(0, 300)}`);
  const genResult = await vibeClient.generateImages(genPayload);
  log(`  generateImages response: ${JSON.stringify(genResult).slice(0, 300)}`);

  // Step 3: poll until complete
  const items = await pollBatch(vibeClient, batchId, log, node.data.timeoutMs || 180_000);

  const imageUrls = items.map(it => it.imageUrl ?? it.url ?? it.videoUrl).filter(Boolean);
  log(`  Vibes generateImages done → ${imageUrls.length} image(s)`);

  return {
    batchId,
    imageUrls,
    generatedImageUrl: imageUrls[0] ?? null,
    resultUrl:         imageUrls[0] ?? null,
    items,
  };
}

module.exports = { handle };
