'use strict';

const { MetaAIClient } = require('../meta_ai');
const VibeAI = require('../vibe_ai/client');
const { createFreshProject, deleteProject } = require('../google-stitch/client');
const { topologicalSort } = require('./topological-sort');
const { getHandler } = require('./node-handlers');
const { log } = require('../../utils/logger');

const REFERENCE_NODE_TYPES = [
  'file_input',
  'meta_imagine',
  'meta_video_gen',
  'meta_video',
  'add_audio',
  'extract_frame',
  'merge_videos',
  // Vibes AI nodes that produce referenceable output
  'vibes_upload_image',
  'vibes_upload_audio',
  'vibes_generate_images',
  'vibes_generate_videos',
  'vibes_tts',
  'vibes_animate',
  'custom_node',
  // Google Stitch AI nodes
  'stitch_upload',
  'stitch_generate',
  'stitch_edit',
  // Google Gemini nodes
  'gemini_upload_image',
  'gemini_image_gen',
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

    // For meta_chat nodes, promptText is the AI response (not the user's input prompt)
    let promptText = n.type === 'meta_chat'
      ? (n.data.text || n.data.promptText || '')
      : (n.data.prompt || n.data.promptText || '');
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
 * Collects all ancestor node IDs for a given target node by traversing edges backwards.
 */
function getAncestors(targetNodeId, edges) {
  const ancestors = new Set();
  const queue = [targetNodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    edges.forEach(e => {
      if (e.target === current && !ancestors.has(e.source)) {
        ancestors.add(e.source);
        queue.push(e.source);
      }
    });
  }
  return ancestors;
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
async function executeWorkflow({ nodes, edges, targetNodeId, signal }, sendEvent) {
  log(`Starting execution for ${nodes.length} nodes and ${edges.length} edges.`);
  sendEvent('workflow_started', { totalNodes: targetNodeId ? 1 : nodes.length });

  const client = new MetaAIClient();
  const vibeClient = VibeAI();
  const globalRefMap = buildGlobalRefMap(nodes);
  const results = preloadResults(nodes);
  // When running a single node, also execute all upstream ancestors in topological order
  // so that their results (e.g. promptText from Meta Chat) are fresh
  let executionOrder;
  if (targetNodeId) {
    const fullOrder = topologicalSort(nodes, edges);
    const ancestors = getAncestors(targetNodeId, edges);
    ancestors.add(targetNodeId);
    executionOrder = fullOrder.filter(id => ancestors.has(id));
  } else {
    executionOrder = topologicalSort(nodes, edges);
  }

  // Resolve Vibes project once for the entire workflow
  let sharedProjectId = null;
  const hasVibesNode = nodes.some(n => n.type && n.type.startsWith('vibes_'));
  if (hasVibesNode && (!signal || !signal.aborted)) {
    try {
      const projData = await vibeClient.getListProject(1);
      if (projData?.projects?.[0]?.id) {
        sharedProjectId = projData.projects[0].id;
        log(`Using shared Vibes project: ${sharedProjectId}`);
      }
    } catch (e) {
      log(`Warning: could not resolve Vibes project: ${e.message}`);
    }
  }

  // Create a fresh Stitch project for this run so screens don't pollute previous runs
  let stitchProjectId = null;
  const STITCH_NODE_TYPES = ['stitch_upload', 'stitch_generate', 'stitch_edit'];
  // Recursively scan into custom_node sub-graphs since Stitch nodes are often
  // nested there (e.g. "Generate Video Mobile" custom nodes) rather than top-level.
  function containsStitchNode(nodeList) {
    return nodeList.some(n => {
      if (STITCH_NODE_TYPES.includes(n.type)) return true;
      if (n.type === 'custom_node' && Array.isArray(n.data?.subNodes)) {
        return containsStitchNode(n.data.subNodes);
      }
      return false;
    });
  }
  const hasStitchNode = containsStitchNode(nodes);
  if (hasStitchNode && (!signal || !signal.aborted)) {
    try {
      const title = `Workflow ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      const project = await createFreshProject(title);
      stitchProjectId = project.id;
      log(`Created fresh Stitch project: ${stitchProjectId} ("${title}")`);
    } catch (e) {
      log(`Warning: could not create Stitch project: ${e.message}`);
    }
  }

  // Promise graph to hold execution state of each node
  const executionPromises = {};

  for (const nodeId of executionOrder) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      log(`  Skipping unknown nodeId: ${nodeId}`);
      continue;
    }

    const incomingEdges = edges.filter(e => e.target === nodeId);

    // Create a promise for this node that waits for its dependencies
    executionPromises[nodeId] = (async () => {
      // 1. Wait for all upstream dependencies in the current execution run
      const depPromises = incomingEdges
        .map(e => e.source)
        .filter(srcId => executionPromises[srcId])
        .map(srcId => executionPromises[srcId]);

      await Promise.all(depPromises);

      // Check for abort before starting this node
      if (signal && signal.aborted) {
        throw new Error('Workflow execution was stopped by user.');
      }

      // Check if this node was already skipped by condition branch logic
      if (results[nodeId] && results[nodeId]._skipped) {
        log(`  Skipping node ${nodeId} (${node.data.label}) — condition branch not taken.`);
        return;
      }

      // 2. Start execution
      log(`Executing node: ${node.data.label} (${node.type})`);
      sendEvent('node_started', { nodeId, label: node.data.label, type: node.type });

      // Resolve sorted inputs for the handler
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
        projectId: sharedProjectId,
        stitchProjectId,
        log,
      };

      const handler = getHandler(node.type);
      let result;

      if (handler) {
        try {
          result = await handler.handle(node, inputs, context);
        } catch (error) {
          log(`  Error in node ${nodeId} (${node.type}): ${error.message}`);
          sendEvent('node_failed', { nodeId, label: node.data.label, type: node.type, error: error.message });
          throw error; // Rethrow to halt downstream dependent nodes
        }
      } else {
        log(`  Skipping unknown node type: ${node.type}`);
        result = inputs[0] || {};
      }

      results[nodeId] = result;
      log(`  Node ${nodeId} finished successfully.`);
      sendEvent('node_completed', { nodeId, label: node.data.label, type: node.type, result });

      // ── Condition branch-skip logic ──
      // After a condition node executes, mark nodes on the non-matching branch as SKIPPED
      if (node.type === 'condition' && result && result.branchId) {
        const matchingBranch = result.branchId; // 'true' or 'false'
        const nonMatchingBranch = matchingBranch === 'true' ? 'false' : 'true';

        // Find downstream edges from this condition node
        const downstreamEdges = edges.filter(e => e.source === nodeId);

        // Edges on the non-matching branch (identified by sourceHandle)
        const skippedEdges = downstreamEdges.filter(e => e.sourceHandle === nonMatchingBranch);
        
        // Collect all nodes reachable ONLY via the non-matching branch
        const skippedNodeIds = new Set();
        const queue = skippedEdges.map(e => e.target);

        while (queue.length > 0) {
          const currentId = queue.shift();
          if (skippedNodeIds.has(currentId)) continue;

          // Check if this node also has incoming edges from the matching branch
          // If so, don't skip it (it gets data from both branches)
          const allIncoming = edges.filter(e => e.target === currentId);
          const hasMatchingBranchInput = allIncoming.some(e => {
            if (e.source === nodeId) return e.sourceHandle === matchingBranch;
            return !skippedNodeIds.has(e.source); // Has input from a non-skipped node
          });

          if (hasMatchingBranchInput && allIncoming.some(e => e.source !== nodeId || e.sourceHandle !== nonMatchingBranch)) {
            continue; // Don't skip — this node has valid inputs from the matching branch
          }

          skippedNodeIds.add(currentId);
          results[currentId] = { _skipped: true, branchId: nonMatchingBranch };
          sendEvent('node_skipped', { nodeId: currentId, label: nodes.find(n => n.id === currentId)?.data?.label, branchId: nonMatchingBranch });

          // Continue collecting downstream
          edges.filter(e => e.source === currentId).forEach(e => queue.push(e.target));
        }

        if (skippedNodeIds.size > 0) {
          log(`  Condition branch "${nonMatchingBranch}" skipped ${skippedNodeIds.size} downstream node(s).`);
        }
      }
    })();
  }

  // Wait for ALL node promises to fully settle (success or failure) before
  // proceeding to cleanup. Using Promise.all here would resolve/reject as soon
  // as the FIRST node fails, while sibling node promises keep running orphaned
  // in the background — cleanup (deleteProject) would then run while those
  // orphaned branches are still mid-flight, causing 404 "entity not found"
  // errors when they try to use the already-deleted project.
  try {
    const settled = await Promise.allSettled(Object.values(executionPromises));
    const failure = settled.find(s => s.status === 'rejected');
    if (failure) {
      throw failure.reason;
    }
    log('Workflow execution completed successfully.');
    sendEvent('workflow_completed', { results });
  } catch (error) {
    log(`Workflow execution failed: ${error.message}`);
    sendEvent('workflow_failed', { error: error.message });
  } finally {
    // Clean up temporary Stitch project if one was created
    if (stitchProjectId) {
      try {
        log(`Cleaning up temporary Stitch project: ${stitchProjectId}`);
        await deleteProject(stitchProjectId);
      } catch (err) {
        log(`Warning: Failed to delete temporary Stitch project ${stitchProjectId}: ${err.message}`);
      }
    }
  }

  return results;
}

module.exports = { executeWorkflow };
