'use strict';

async function handle(node, _inputs, _context) {
  return { promptText: node.data.prompt || '' };
}

module.exports = { handle };
