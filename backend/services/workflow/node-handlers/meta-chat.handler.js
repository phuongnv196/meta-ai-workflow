'use strict';

const { resolveAttachmentsFromEdges } = require('../attachment-resolver');

async function handle(node, inputs, context) {
  const { client, incomingEdges, results, globalRefMap } = context;

  const prompt = node.data.prompt
    || (inputs.find(i => i.promptText)?.promptText)
    || 'Hello';

  const attachments = resolveAttachmentsFromEdges(incomingEdges, results, globalRefMap);

  context.log(`  Calling Meta AI Chat with prompt: "${prompt}" and ${attachments.length} attachments`);
  const result = await client.chat({ promptText: prompt, attachments });

  // Map accumulatedText to text for frontend consistency
  const mappedResult = {
    ...result,
    text: result.accumulatedText || result.text || ''
  };

  // If text response was received, log it
  if (mappedResult.text && mappedResult.text.trim()) {
    context.log(`  Meta AI text response: "${mappedResult.text.trim()}"`);
  }

  return mappedResult;
}

module.exports = { handle };
