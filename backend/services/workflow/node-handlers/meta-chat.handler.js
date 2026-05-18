'use strict';

const { resolveAttachmentsFromEdges } = require('../attachment-resolver');

async function handle(node, inputs, context) {
  const { client, incomingEdges, results, globalRefMap } = context;

  const prompt = node.data.prompt
    || (inputs.find(i => i.promptText)?.promptText)
    || 'Hello';

  const attachments = resolveAttachmentsFromEdges(incomingEdges, results, globalRefMap);

  context.log(`  Calling Meta AI Chat with prompt: "${prompt}" and ${attachments.length} attachments`);
  return await client.chat({ promptText: prompt, attachments });
}

module.exports = { handle };
