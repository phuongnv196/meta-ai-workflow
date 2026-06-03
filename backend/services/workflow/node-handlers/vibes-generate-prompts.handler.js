'use strict';

async function handle(node, inputs, context) {
  const { vibeClient, results, log } = context;

  const seedPrompt =
    node.data.prompt ||
    (inputs.find(i => i.promptText)?.promptText) ||
    (inputs.find(i => i.text)?.text) ||
    'A cinematic scene';

  const batchType = node.data.batchType || 'images';

  // Use batchId from upstream generate-images/videos node if available, else omit
  const batchId =
    node.data.batchId ||
    (inputs.find(i => i.batchId)?.batchId) ||
    undefined;

  log(`  Vibes generatePrompts: seed="${seedPrompt.slice(0, 60)}" batchType=${batchType}`);

  const result = await vibeClient.generatePrompts({
    prompt:    seedPrompt,
    batchId,
    config:    node.data.config || {},
    batchType,
    projectId: node.data.projectId || undefined,
  });

  // API may return { prompts: [...] } or { data: { variations: [...] } } or { variations: [...] }
  const rawVariations =
    result?.data?.variations ??
    result?.variations ??
    null;

  const rawPrompts = result?.prompts ?? null;

  let variations;
  if (rawVariations) {
    variations = rawVariations.map(v =>
      typeof v === 'string' ? { image: v, video: v } : v
    );
  } else if (rawPrompts) {
    variations = rawPrompts.map(p =>
      typeof p === 'string' ? { image: p, video: p } : p
    );
  } else {
    variations = [];
  }

  const firstPrompt = variations[0]?.image ?? variations[0]?.video ?? seedPrompt;

  log(`  Vibes generatePrompts done → ${variations.length} variation(s)`);
  return { variations, promptText: firstPrompt, text: firstPrompt };
}

module.exports = { handle };
