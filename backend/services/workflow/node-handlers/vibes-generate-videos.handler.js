'use strict';

const { pollBatch } = require('./vibes-poll-batch');
const { ensureVibesMediaEntId } = require('./vibes-utils');

async function handle(node, inputs, context) {
  const { vibeClient, projectId: sharedProjectId, log } = context;

  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText)?.promptText || inputs.find(i => i.text)?.text || '').trim();
  const prompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n') || 'A cinematic video';

  const videoModel = node.data.videoModel || 'midjen-short';
  const config     = { videoModel, ...(node.data.config || {}) };
  const projectId  = node.data.projectId || sharedProjectId;

  // Preserve the exact connection order (edge order) to match user intent:
  // "Hình nối trước sẽ là Start Frame, hình nối sau sẽ là End Frame"
  // The context.edges array preserves the order of connections made in the UI.
  const parentEdges = context.edges.filter(e => e.target === node.id);
  const sortedParents = parentEdges
    .map(edge => context.nodes.find(n => n.id === edge.source))
    .filter(Boolean);

  const imageInputs = sortedParents
    .map(n => context.results[n.id])
    .filter(i => i && !i.audioUrl && !i.cdnUrl && i.sourceType !== 'text');

  // Resolve mediaEntIds for image inputs (auto-upload if needed)
  const resolvedIds = [];
  for (const inp of imageInputs) {
    const id = await ensureVibesMediaEntId(inp, vibeClient, projectId, log);
    if (id) resolvedIds.push(id);
  }
  const startFrameId = resolvedIds[0];
  const endFrameId = resolvedIds[1];

  // Step 1: create video batch record
  const batchId = `batch-${Date.now()}`;
  log(`  Vibes generateVideos: prompt="${prompt.slice(0, 60)}" model=${videoModel} startFrame=${startFrameId || 'none'} endFrame=${endFrameId || 'none'} batchId=${batchId}`);

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
