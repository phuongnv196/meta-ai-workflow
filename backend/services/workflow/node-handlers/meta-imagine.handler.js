'use strict';

const { resolveAttachmentsFromEdges } = require('../attachment-resolver');
const { resolveReferencePlaceholders } = require('../prompt-template');

async function handle(node, inputs, context) {
  const { client, incomingEdges, results, globalRefMap, nodes } = context;

  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText)?.promptText || '').trim();
  let prompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n') || 'Generate an image';

  // Replace {{reference_xx}} placeholders with real Meta media ids
  const { prompt: resolvedPrompt, replacements } = resolveReferencePlaceholders(prompt, {
    globalRefMap, results, platform: 'meta',
  });
  prompt = resolvedPrompt;
  if (replacements.length) {
    context.log(`  Resolved ${replacements.length} reference placeholder(s): ${replacements.map(r => `{{${r.name}}}→${r.value}`).join(', ')}`);
  }

  // Only use attachments from file_input nodes (real uploads), not intermediate mediaIds
  const attachments = resolveAttachmentsFromEdges(
    incomingEdges, results, globalRefMap,
    { filterFn: (sourceId) => {
        const sourceNode = nodes.find(n => n.id === sourceId);
        return sourceNode && sourceNode.type === 'file_input';
      }
    }
  );

  // If there are reference images, append outpaint instruction for padded borders
  if (attachments.length > 0) {
    prompt += `\n\n[CRITICAL DIRECTIVE]: If the reference image contains solid white/blank padding bars (added to extend the canvas), you MUST outpaint and naturally extend the real scene/background into those padding areas so the final image is fully filled edge-to-edge.`;
  }

  context.log(`  Calling Meta AI Imagine with prompt: "${prompt}" and ${attachments.length} attachments`);
  const imagineResult = await client.generateImage({ promptText: prompt, attachments });
  return { ...imagineResult, generatedImageUrl: imagineResult.videoUrl };
}

module.exports = { handle };
