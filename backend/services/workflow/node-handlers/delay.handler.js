'use strict';

/**
 * Delay node handler — pauses execution for a specified number of seconds.
 */
async function handle(node, inputs, context) {
  const seconds = node.data.seconds || 1;
  const ms = seconds * 1000;

  context.log(`  Delaying for ${seconds} second(s)...`);
  await new Promise(r => setTimeout(r, ms));
  context.log(`  Delay completed.`);

  return inputs[0] || {};
}

module.exports = { handle };
