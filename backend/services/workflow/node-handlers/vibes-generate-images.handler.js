'use strict';

const { pollBatch } = require('./vibes-poll-batch');

async function handle(node, inputs, context) {
  const { vibeClient, log } = context;

  const prompt =
    node.data.prompt ||
    (inputs.find(i => i.promptText)?.promptText) ||
    (inputs.find(i => i.text)?.text) ||
    'A beautiful image';

  const count = Number(node.data.count) || 2;
  const mediaEntId = inputs.find(i => i.mediaEntId)?.mediaEntId;

  if (mediaEntId) {
    log(`  Vibes generateImageEdit: prompt="${prompt.slice(0, 60)}" sourceImageEntId=${mediaEntId}`);
    
    let projectId = node.data.projectId;
    if (!projectId) {
      try {
        const projData = await vibeClient.getListProject(1);
        if (projData?.projects?.[0]?.id) {
          projectId = projData.projects[0].id;
        }
      } catch (err) {
        log(`  Warning: failed to get project list for image-edit: ${err.message}`);
      }
    }

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
  log(`  Vibes generateImages: prompt="${prompt.slice(0, 60)}" count=${count} mediaEntId=${mediaEntId || 'none'} batchId=${batchId}`);

  await vibeClient.generateBatches({
    id:         batchId,
    type:       'images',
    prompt,
    timestamp:  Date.now(),
    isComplete: false,
    config:     node.data.config || {},
    projectId:  node.data.projectId || undefined,
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
