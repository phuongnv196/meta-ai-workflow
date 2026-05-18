'use strict';

/**
 * Resolves attachments from incoming edges, applying global reference name mapping.
 *
 * @param {Array} incomingEdges - Edges pointing to the current node
 * @param {Object} results - Results map keyed by node ID
 * @param {Object} globalRefMap - Node ID to reference name map
 * @param {Object} [options]
 * @param {Function} [options.filterFn] - Optional filter: (sourceId) => boolean
 * @returns {Array} Resolved attachment objects
 */
function resolveAttachmentsFromEdges(incomingEdges, results, globalRefMap, options = {}) {
  const { filterFn } = options;
  const attachments = [];

  incomingEdges.forEach(edge => {
    const sourceId = edge.source;

    if (filterFn && !filterFn(sourceId)) return;

    const sourceResult = results[sourceId];
    if (!sourceResult || !sourceResult.attachments) return;

    const globalName = globalRefMap[sourceId];
    if (!globalName) return;

    sourceResult.attachments.forEach(att => {
      const ext = att.filename ? att.filename.split('.').pop() : 'jpg';
      attachments.push({
        ...att,
        filename: `${globalName}.${ext}`,
      });
    });
  });

  return attachments;
}

module.exports = { resolveAttachmentsFromEdges };
