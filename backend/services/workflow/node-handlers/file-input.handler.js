'use strict';

async function handle(node, _inputs, _context) {
  return {
    attachments: node.data.mediaId
      ? [{
          id: node.data.mediaId,
          mimeType: node.data.mimeType || 'image/jpeg',
          filename: node.data.filename || 'reference.jpg',
        }]
      : [],
  };
}

module.exports = { handle };
