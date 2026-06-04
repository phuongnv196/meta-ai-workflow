'use strict';

const { pollBatch } = require('./vibes-poll-batch');
const { ensureVibesMediaEntId } = require('./vibes-utils');

async function handle(node, inputs, context) {
  const { vibeClient, projectId: sharedProjectId, log } = context;

  const projectId = node.data.projectId || sharedProjectId;

  // audioUrl: from upstream vibes_upload_audio or vibes_tts output
  const audioUrl =
    node.data.audioUrl ||
    (inputs.find(i => i.audioUrl)?.audioUrl) ||
    (inputs.find(i => i.cdnUrl)?.cdnUrl) ||
    null;

  if (!audioUrl) {
    throw new Error('vibes_animate: no audioUrl found in node config or inputs');
  }

  // Avatar image: first non-audio input, auto-upload to get mediaEntId + imageUrl (exclude text-only sources)
  const imageInput = inputs.find(i => !i.audioUrl && !i.cdnUrl && i.sourceType !== 'text' && (i.mediaEntId || i.base64Data || i.generatedImageUrl || i.url || i.previewUrl));
  const imageMediaEntId = imageInput ? await ensureVibesMediaEntId(imageInput, vibeClient, projectId, log) : null;
  const imageUrl = imageInput ? (imageInput.generatedImageUrl || imageInput.url || imageInput.previewUrl || null) : null;

  const script =
    node.data.script ||
    node.data.prompt ||
    (inputs.find(i => i.text)?.text) ||
    '';

  const audioDurationMs = Number(node.data.audioDurationMs) || 5000;

  log(`  Vibes animateGenerate: audioUrl=${audioUrl.slice(0, 60)} script="${script.slice(0, 40)}"`);

  const result = await vibeClient.animateGenerate({
    audioUrl,
    audioDurationMs,
    script,
    engine:     node.data.engine || 'midjen',
    ...(projectId ? { projectId } : {}),
    ...(imageMediaEntId ? { 
      imageUrl,
      sourceContentItemIds: [{ id: `start-${Date.now()}`, source: 'start_frame' }]
    } : {}),
  });

  const batchId = result?.data?.batchId ?? null;

  if (!batchId) {
    log(`  Vibes animateGenerate: no batchId in response, returning raw result`);
    return { ...result, audioUrl };
  }

  // Poll until video is ready
  const items = await pollBatch(vibeClient, batchId, log, node.data.timeoutMs || 180_000);

  const videoUrls = items.map(it => it.videoUrl ?? it.url).filter(Boolean);
  log(`  Vibes animateGenerate done → ${videoUrls.length} video(s)`);

  return {
    batchId,
    videoUrls,
    videoUrl:  videoUrls[0] ?? null,
    resultUrl: videoUrls[0] ?? null,
    items,
  };
}

module.exports = { handle };
