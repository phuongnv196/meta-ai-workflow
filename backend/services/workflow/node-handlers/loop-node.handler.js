'use strict';

const { topologicalSort } = require('../topological-sort');

/**
 * Loop (ForEach) node handler.
 * Iterates over an input array, executing a sub-graph for each item.
 * Reuses the custom-node execution pattern.
 */
async function handle(node, inputs, context) {
  const input = inputs[0] || {};
  const maxIterations = node.data.maxIterations || 100;

  // Determine the input array
  let items = input.items || input.imageUrls || [input];
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [input];
    }
  }
  if (!Array.isArray(items)) {
    items = [items];
  }

  // Limit iterations
  items = items.slice(0, maxIterations);

  context.log(`  Loop: processing ${items.length} items (max: ${maxIterations})`);

  const subNodes = node.data.subNodes || [];
  const subEdges = node.data.subEdges || [];

  if (subNodes.length === 0) {
    context.log(`  Loop: No sub-nodes, passing through items.`);
    return { items, count: items.length };
  }

  const collectedResults = [];
  const isParallel = !!node.data.parallel;

  const processItem = async (item, index) => {
    context.log(`  Loop iteration ${index + 1}/${items.length}`);

    // Clone sub-graph results
    const subResults = {};
    subNodes.forEach(sn => {
      subResults[sn.id] = { ...sn.data };
    });

    // Find entry node (no incoming edges) and inject current item
    const targetIds = new Set(subEdges.map(e => e.target));
    const entryNodes = subNodes.filter(sn => !targetIds.has(sn.id));
    entryNodes.forEach(en => {
      subResults[en.id] = { ...subResults[en.id], ...item, promptText: item.text || item.promptText || JSON.stringify(item) };
    });

    // Execute sub-graph in topological order
    const order = topologicalSort(subNodes, subEdges);
    for (const subNodeId of order) {
      const subNode = subNodes.find(sn => sn.id === subNodeId);
      if (!subNode) continue;

      const subIncoming = subEdges.filter(e => e.target === subNodeId);
      const subInputs = subIncoming.map(e => subResults[e.source]).filter(Boolean);
      
      const { getHandler } = require('./index');
      const handler = getHandler(subNode.type);
      if (handler) {
        try {
          subResults[subNodeId] = await handler.handle(subNode, subInputs, context);
        } catch (err) {
          context.log(`  Loop: Error in sub-node ${subNodeId}: ${err.message}`);
          subResults[subNodeId] = { error: err.message };
        }
      } else {
        subResults[subNodeId] = subInputs[0] || {};
      }
    }

    // Get output from exit node (no outgoing edges)
    const sourceIds = new Set(subEdges.map(e => e.source));
    const exitNodes = subNodes.filter(sn => !sourceIds.has(sn.id));
    const exitResult = exitNodes.length > 0 ? subResults[exitNodes[exitNodes.length - 1].id] : {};
    
    return exitResult;
  };

  if (isParallel) {
    const results = await Promise.all(items.map((item, i) => processItem(item, i)));
    collectedResults.push(...results);
  } else {
    for (let i = 0; i < items.length; i++) {
      const result = await processItem(items[i], i);
      collectedResults.push(result);
    }
  }

  context.log(`  Loop completed: ${collectedResults.length} results`);

  return { items: collectedResults, count: collectedResults.length };
}

module.exports = { handle };
