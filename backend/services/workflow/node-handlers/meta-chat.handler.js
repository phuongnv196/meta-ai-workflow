'use strict';

const { resolveAttachmentsFromEdges } = require('../attachment-resolver');

async function handle(node, inputs, context) {
  const { client, incomingEdges, results, globalRefMap } = context;

  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText)?.promptText || '').trim();
  const prompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n') || 'Hello';

  const modeFast = !!node.data.modeFast;

  const attachments = resolveAttachmentsFromEdges(incomingEdges, results, globalRefMap);

  context.log(`  Calling Meta AI Chat with prompt: "${prompt}" and ${attachments.length} attachments${modeFast ? ' [MODE_FAST]' : ''}`);
  const result = await client.chat({ promptText: prompt, attachments, modeFast });

  // Map accumulatedText to text for frontend consistency
  const mappedResult = {
    ...result,
    text: result.accumulatedText || result.text || ''
  };

  // Map text output as promptText so downstream nodes can use it as prompt input
  mappedResult.promptText = mappedResult.text;

  // Mark as text source so downstream Vibes handlers don't treat this as an image input
  mappedResult.sourceType = 'text';

  // If text response was received, log it
  if (mappedResult.text && mappedResult.text.trim()) {
    context.log(`  Meta AI text response: "${mappedResult.text.trim()}"`);
  }

  return mappedResult;
}

module.exports = { handle };
