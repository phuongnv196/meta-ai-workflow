'use strict';

const { topologicalSort } = require('../topological-sort');

/**
 * Custom Node handler — executes an embedded sub-graph (subNodes + subEdges).
 *
 * 1. Clones subNodes & subEdges from the node's data
 * 2. Maps external inputs into the exposed input nodes
 * 3. Builds a sub-graph reference map so attachment resolution works
 * 4. Runs sub-graph in topological order using existing handlers
 * 5. Returns the result from the exposed output node(s)
 */

// Node types that produce referenceable output (mirrors workflow.service.js)
const SUB_REFERENCE_NODE_TYPES = [
  'file_input', 'meta_imagine', 'meta_video_gen', 'meta_video', 'meta_track',
  'extract_frame', 'merge_videos', 'vibes_upload_image', 'vibes_upload_audio',
  'vibes_generate_images', 'vibes_generate_videos', 'vibes_tts', 'vibes_animate',
];

async function handle(node, inputs, context) {
  const { log } = context;
  const { subNodes: rawSubNodes, subEdges: rawSubEdges, exposedInputs = [], exposedOutputs = [], label } = node.data;

  if (!rawSubNodes || rawSubNodes.length === 0) {
    throw new Error(`Custom node "${label}" has no sub-nodes defined.`);
  }

  // Deep-clone to avoid mutating the original template
  const subNodes = JSON.parse(JSON.stringify(rawSubNodes));
  const subEdges = JSON.parse(JSON.stringify(rawSubEdges || []));

  log(`[CustomNode] Executing "${label}" with ${subNodes.length} sub-nodes, ${exposedInputs.length} exposed inputs, ${exposedOutputs.length} exposed outputs`);

  // ── Build a reference map scoped to the sub-graph ──
  // This is critical: without it, resolveAttachmentsFromEdges inside sub-node
  // handlers (e.g. meta_chat, meta_imagine) will fail because the main
  // workflow's globalRefMap does not contain sub-node IDs.
  const subRefMap = {};
  let subRefCount = 1;
  subNodes.forEach(sn => {
    if (
      SUB_REFERENCE_NODE_TYPES.includes(sn.type) ||
      sn.data?.refName ||
      sn.data?.mediaId ||
      (sn.data?.attachments && sn.data.attachments.length > 0)
    ) {
      const refName = sn.data?.refName || `sub_ref_${String(subRefCount++).padStart(2, '0')}`;
      subRefMap[sn.id] = refName;
    }
  });
  log(`[CustomNode] Sub-graph refMap: ${JSON.stringify(subRefMap)}`);

  // ── Pre-populate results for sub-nodes from their saved data ──
  const subResults = {};
  subNodes.forEach(sn => {
    if (sn.data) {
      subResults[sn.id] = { ...sn.data };

      // Ensure file_input nodes have attachments array like preloadResults does
      if (sn.type === 'file_input' && sn.data.mediaId && (!sn.data.attachments || sn.data.attachments.length === 0)) {
        subResults[sn.id].attachments = [{
          id: sn.data.mediaId,
          mimeType: sn.data.mimeType || 'image/jpeg',
          filename: sn.data.filename || 'reference.jpg',
        }];
      }
    }
  });

  // ── Map external inputs into exposed input nodes ──
  const externalIncomingEdges = context.incomingEdges || [];
  const overriddenNodes = new Set();
  const usedExposedInputs = new Set();

  // Pass 1: map edges that have an explicit targetHandle matching an exposed input
  externalIncomingEdges.forEach((edge) => {
    const targetHandle = edge.targetHandle;
    const inputResult = context.results[edge.source];
    if (!inputResult) {
      log(`[CustomNode] No result for external source ${edge.source}, skipping`);
      return;
    }
    if (targetHandle && exposedInputs.includes(targetHandle)) {
      log(`[CustomNode] Override (handle): external ${edge.source} → sub-node ${targetHandle}`);
      // FULL REPLACE — do not merge with old saved data
      subResults[targetHandle] = { ...inputResult };
      overriddenNodes.add(targetHandle);
      usedExposedInputs.add(targetHandle);

      // Also update cloned subNode.data so handlers that read node.data get fresh values
      const sn = subNodes.find(n => n.id === targetHandle);
      if (sn) sn.data = { ...sn.data, ...inputResult };
    }
  });

  // Pass 2: edges without valid targetHandle → assign to remaining exposed inputs in order
  let nextIdx = 0;
  externalIncomingEdges.forEach((edge) => {
    const targetHandle = edge.targetHandle;
    if (targetHandle && exposedInputs.includes(targetHandle)) return; // handled in pass 1

    const inputResult = context.results[edge.source];
    if (!inputResult) return;

    while (nextIdx < exposedInputs.length && usedExposedInputs.has(exposedInputs[nextIdx])) {
      nextIdx++;
    }
    if (nextIdx >= exposedInputs.length) {
      log(`[CustomNode] Warning: extra external input from ${edge.source} has no available exposed input slot`);
      return;
    }

    const exposedNodeId = exposedInputs[nextIdx];
    log(`[CustomNode] Override (positional idx=${nextIdx}): external ${edge.source} → sub-node ${exposedNodeId}`);
    subResults[exposedNodeId] = { ...inputResult };
    overriddenNodes.add(exposedNodeId);
    usedExposedInputs.add(exposedNodeId);

    const sn = subNodes.find(n => n.id === exposedNodeId);
    if (sn) sn.data = { ...sn.data, ...inputResult };

    nextIdx++;
  });

  log(`[CustomNode] Overridden sub-nodes: [${[...overriddenNodes].join(', ')}]`);

  // Lazy-require to avoid circular dependency (index.js → custom-node.handler → index.js)
  const { getHandler } = require('./index');

  // Execute sub-graph in topological order
  const executionOrder = topologicalSort(subNodes, subEdges);

  for (const subNodeId of executionOrder) {
    if (overriddenNodes.has(subNodeId)) {
      log(`[CustomNode] Skipping overridden sub-node ${subNodeId} — using external input directly`);
      continue;
    }

    const subNode = subNodes.find(sn => sn.id === subNodeId);
    if (!subNode) continue;

    const incomingSubEdges = subEdges.filter(e => e.target === subNodeId);
    const subInputs = incomingSubEdges.map(e => subResults[e.source]).filter(Boolean);

    // Build sub-context scoped to the sub-graph
    const subContext = {
      client: context.client,
      vibeClient: context.vibeClient,
      nodes: subNodes,
      edges: subEdges,
      incomingEdges: incomingSubEdges,
      results: subResults,
      globalRefMap: subRefMap,   // ← use sub-graph ref map, NOT the main workflow's
      projectId: context.projectId,
      log: (msg) => context.log(`[CustomNode:${label}] ${msg}`),
    };

    const handler = getHandler(subNode.type);
    if (!handler) {
      log(`[CustomNode] Skipping unknown sub-node type: ${subNode.type}`);
      subResults[subNodeId] = subInputs[0] || {};
      continue;
    }

    try {
      log(`[CustomNode] Executing sub-node: ${subNode.data?.label || subNode.type} (${subNode.type})`);
      const result = await handler.handle(subNode, subInputs, subContext);
      subResults[subNodeId] = result;
    } catch (error) {
      log(`[CustomNode] Sub-node ${subNodeId} (${subNode.type}) failed: ${error.message}`);
      throw error;
    }
  }

  // Collect output from exposed output nodes
  if (exposedOutputs.length === 1) {
    return subResults[exposedOutputs[0]] || {};
  }

  // Multiple outputs: merge all results
  const merged = {};
  exposedOutputs.forEach(outId => {
    if (subResults[outId]) {
      Object.assign(merged, subResults[outId]);
    }
  });
  return merged;
}

module.exports = { handle };
