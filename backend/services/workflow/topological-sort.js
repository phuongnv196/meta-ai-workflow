'use strict';

/**
 * Topological sort (Kahn's algorithm) for DAG node execution ordering.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Array<{source: string, target: string}>} edges
 * @returns {string[]} Sorted node IDs, or original order if cycle detected
 */
function topologicalSort(nodes, edges) {
  const adj = {};
  const inDegree = {};
  const nodeIds = nodes.map(n => n.id);

  nodeIds.forEach(id => {
    adj[id] = [];
    inDegree[id] = 0;
  });

  edges.forEach(edge => {
    if (adj[edge.source]) {
      adj[edge.source].push(edge.target);
      inDegree[edge.target]++;
    }
  });

  const queue = nodeIds.filter(id => inDegree[id] === 0);
  const result = [];

  while (queue.length > 0) {
    const u = queue.shift();
    result.push(u);

    adj[u].forEach(v => {
      inDegree[v]--;
      if (inDegree[v] === 0) queue.push(v);
    });
  }

  return result.length === nodes.length ? result : nodeIds;
}

module.exports = { topologicalSort };
