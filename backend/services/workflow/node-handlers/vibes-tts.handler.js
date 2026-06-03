'use strict';

async function handle(node, inputs, context) {
  const { vibeClient, log } = context;

  const text =
    node.data.text ||
    node.data.prompt ||
    (inputs.find(i => i.text)?.text) ||
    (inputs.find(i => i.promptText)?.promptText) ||
    'Hello from Vibes AI.';

  // voiceId can be configured in node or resolved from upstream
  let voiceId = node.data.voiceId || (inputs.find(i => i.voiceId)?.voiceId) || null;

  // Auto-fetch first available voice if none configured
  if (!voiceId) {
    log(`  Vibes TTS: no voiceId configured, fetching first available voice…`);
    const voicesData = await vibeClient.getStudioVoices(1);
    const voices = voicesData.voices ?? voicesData ?? [];
    voiceId = voices[0]?.id ?? null;
    if (!voiceId) throw new Error('vibes_tts: no voices available from Vibes AI');
  }

  log(`  Vibes TTS: text="${text.slice(0, 60)}" voiceId=${voiceId}`);
  const result = await vibeClient.ttsPlayai(text, voiceId);

  const audioBase64 = result.audioBase64 ?? null;
  const audioUrl    = result.audioUrl ?? null;

  log(`  Vibes TTS done → audioBase64=${audioBase64 ? audioBase64.length + ' bytes' : 'null'}`);
  return { audioBase64, audioUrl, resultUrl: audioUrl, text };
}

module.exports = { handle };
