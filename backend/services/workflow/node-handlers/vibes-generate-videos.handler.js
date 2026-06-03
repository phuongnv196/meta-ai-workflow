'use strict';

const { pollBatch } = require('./vibes-poll-batch');

async function handle(node, inputs, context) {
  const { vibeClient, log } = context;

  const prompt =
    node.data.prompt ||
    (inputs.find(i => i.promptText)?.promptText) ||
    (inputs.find(i => i.text)?.text) ||
    'A cinematic video';

  const videoModel = node.data.videoModel || 'midjen-short';
  const config     = { videoModel, ...(node.data.config || {}) };
  
  const mediaEntIds = inputs.filter(i => i.mediaEntId).map(i => i.mediaEntId);
  const startFrameId = mediaEntIds[0];
  const endFrameId = mediaEntIds[1];

  // Step 1: create video batch record
  const batchId = `batch-${Date.now()}`;
  log(`  Vibes generateVideos: prompt="${prompt.slice(0, 60)}" model=${videoModel} startFrame=${startFrameId || 'none'} endFrame=${endFrameId || 'none'} batchId=${batchId}`);

  let projectId = node.data.projectId;
  if (!projectId && (startFrameId || endFrameId)) {
    try {
      const projData = await vibeClient.getListProject(1);
      if (projData?.projects?.[0]?.id) {
        projectId = projData.projects[0].id;
      }
    } catch (err) {}
  }

  const batchConfig = {
    ...config,
    ...(startFrameId ? { directPromptImageHandle: { image_ent_id: startFrameId, source: 'asset' } } : {}),
    ...(endFrameId ? { lastFrameImageEntId: endFrameId } : {})
  };

  await vibeClient.generateBatches({
    id:         batchId,
    type:       'videos',
    prompt,
    timestamp:  Date.now(),
    isComplete: false,
    config:     batchConfig,
    projectId,
    content:    [{
      id:        `${batchId}-content-0`,
      type:      'video',
      isLoading: true,
    }],
  });

  // Step 2: trigger generation
  const videoInput = {
    type:            startFrameId ? 'image' : 'prompt',
    prompt:          prompt,
    value:           prompt, // Keep for fallback, but API seems to use prompt for 'image' type
    originalPrompt:  prompt,
    original_prompt: prompt,
    config:          { ...batchConfig },
  };

  if (startFrameId) {
    videoInput.imageEntId = startFrameId;
  }

  const genPayload = { 
    batchId, 
    inputs: [videoInput], 
    config: batchConfig,
    ...(projectId ? { projectId } : {})
  };
  
  log(`  generateVideos payload: ${JSON.stringify(genPayload).slice(0, 300)}`);
  const genResult = await vibeClient.generateVideos(genPayload);
  log(`  generateVideos response: ${JSON.stringify(genResult).slice(0, 300)}`);

  // Step 3: poll until complete
  const items = await pollBatch(vibeClient, batchId, log, node.data.timeoutMs || 180_000);

  const videoUrls = items.map(it => it.videoUrl ?? it.url).filter(Boolean);
  log(`  Vibes generateVideos done → ${videoUrls.length} video(s)`);

  return {
    batchId,
    videoUrls,
    videoUrl:  videoUrls[0] ?? null,
    resultUrl: videoUrls[0] ?? null,
    items,
  };
}

module.exports = { handle };
