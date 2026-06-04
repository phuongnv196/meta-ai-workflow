'use strict';

const { resolveAttachmentsFromEdges } = require('../attachment-resolver');

async function handle(node, inputs, context) {
  const { client, incomingEdges, results, globalRefMap, nodes } = context;

  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText)?.promptText || '').trim();
  const prompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n') || 'Generate an image';

  // Only use attachments from file_input nodes (real uploads), not intermediate mediaIds
  const attachments = resolveAttachmentsFromEdges(
    incomingEdges, results, globalRefMap,
    { filterFn: (sourceId) => {
        const sourceNode = nodes.find(n => n.id === sourceId);
        return sourceNode && sourceNode.type === 'file_input';
      }
    }
  );

  context.log(`  Calling Meta AI Imagine with prompt: "${prompt}" and ${attachments.length} attachments`);
  const imagineResult = await client.generateImage({ promptText: prompt, attachments });
  return { ...imagineResult, generatedImageUrl: imagineResult.videoUrl };
}

module.exports = { handle };
