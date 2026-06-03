'use strict';

const { MetaAIClient } = require('../meta_ai');
const VibeAI = require('../vibe_ai/client');
const { topologicalSort } = require('./topological-sort');
const { getHandler } = require('./node-handlers');
const { log } = require('../../utils/logger');

const REFERENCE_NODE_TYPES = [
  'file_input',
  'meta_imagine',
  'meta_video_gen',
  'meta_video',
  'meta_track',
  'extract_frame',
  'merge_videos',
  // Vibes AI nodes that produce referenceable output
  'vibes_upload_image',
  'vibes_upload_audio',
  'vibes_generate_images',
  'vibes_generate_videos',
  'vibes_tts',
  'vibes_animate',
];

/**
 * Builds the global reference map for attachment name resolution.
 */
function buildGlobalRefMap(nodes) {
  const globalRefMap = {};
  const refNodes = nodes.filter(pn =>
    REFERENCE_NODE_TYPES.includes(pn.type)
    || pn.data?.refName
    || pn.data?.mediaId
    || (pn.data?.attachments && pn.data.attachments.length > 0)
  );

  let fallbackCount = 1;
  refNodes.forEach(pn => {
    let refName = pn.data?.refName;
    if (!refName) {
      refName = `reference_${String(fallbackCount++).padStart(2, '0')}`;
    }
    globalRefMap[pn.id] = refName;
  });

  return globalRefMap;
}

/**
 * Pre-populates results from node data (configured params, prior runs).
 */
function preloadResults(nodes) {
  const results = {};

  nodes.forEach(n => {
    if (!n.data) return;

    let promptText = n.data.prompt || n.data.promptText || '';
    let attachments = n.data.attachments || [];
    let videoUrl = n.data.resultUrl || n.data.videoUrl || '';
    let generatedImageUrl = n.data.generatedImageUrl || n.data.resultUrl || '';

    if (n.type === 'file_input' && n.data.mediaId && attachments.length === 0) {
      attachments = [{
        id: n.data.mediaId,
        mimeType: n.data.mimeType || 'image/jpeg',
        filename: n.data.filename || 'reference.jpg',
      }];
    }
    if (n.type === 'text_input' && n.data.prompt && !promptText) {
      promptText = n.data.prompt;
    }

    results[n.id] = {
      ...n.data,
      promptText,
      videoUrl,
      generatedImageUrl,
      attachments,
      mediaEntId: n.data.mediaEntId || null,
    };
  });

  return results;
}

/**
 * Executes a workflow graph, streaming progress via SSE sendEvent callback.
 *
 * @param {Object} params
 * @param {Array}  params.nodes
 * @param {Array}  params.edges
 * @param {string} [params.targetNodeId]
 * @param {Function} sendEvent - (eventName, data) => void
 */
async function executeWorkflow({ nodes, edges, targetNodeId }, sendEvent) {
  log(`Starting execution for ${nodes.length} nodes and ${edges.length} edges.`);
  sendEvent('workflow_started', { totalNodes: targetNodeId ? 1 : nodes.length });

  const client = new MetaAIClient();
  const vibeClient = VibeAI();
  const globalRefMap = buildGlobalRefMap(nodes);
  const results = preloadResults(nodes);
  const executionOrder = targetNodeId ? [targetNodeId] : topologicalSort(nodes, edges);

  for (const nodeId of executionOrder) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      log(`  Skipping unknown nodeId: ${nodeId}`);
      continue;
    }

    log(`Executing node: ${node.data.label} (${node.type})`);
    sendEvent('node_started', { nodeId, label: node.data.label, type: node.type });

    // Resolve sorted inputs
    const incomingEdges = edges.filter(e => e.target === nodeId);
    incomingEdges.sort((edgeA, edgeB) => {
      const nodeA = nodes.find(n => n.id === edgeA.source);
      const nodeB = nodes.find(n => n.id === edgeB.source);
      if (nodeA && nodeB) {
        if (Math.abs(nodeA.position.y - nodeB.position.y) > 20) {
          return nodeA.position.y - nodeB.position.y;
        }
        return nodeA.position.x - nodeB.position.x;
      }
      return 0;
    });
    const inputs = incomingEdges.map(e => results[e.source]).filter(Boolean);

    // Build execution context for handlers
    const context = {
      client,
      vibeClient,
      nodes,
      edges,
      incomingEdges,
      results,
      globalRefMap,
      log,
    };

    const handler = getHandler(node.type);
    let result;

    if (handler) {
      result = await handler.handle(node, inputs, context);
    } else {
      log(`  Skipping unknown node type: ${node.type}`);
      result = inputs[0] || {};
    }

    results[nodeId] = result;
    log(`  Node ${nodeId} finished successfully.`);
    sendEvent('node_completed', { nodeId, label: node.data.label, type: node.type, result });
  }

  log('Workflow execution completed successfully.');
  sendEvent('workflow_completed', { results });

  return results;
}

module.exports = { executeWorkflow };
