'use strict';

/**
 * Polls getGenerationBatchStream until isComplete:true or timeout.
 * Returns the final event data (items array with videoUrl / imageUrl).
 *
 * @param {object} vibeClient
 * @param {string} batchId
 * @param {Function} log
 * @param {number} [timeoutMs=180000]  3 minutes default
 */
async function pollBatch(vibeClient, batchId, log, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastItems = [];

  log(`  Vibes pollBatch: waiting for batchId=${batchId} (timeout ${timeoutMs / 1000}s)`);

  while (Date.now() < deadline) {
    for await (const event of vibeClient.getGenerationBatchStream(batchId)) {
      lastItems = event.items ?? lastItems;
      if (event.isComplete) {
        log(`  Vibes pollBatch: complete — ${lastItems.length} item(s)`);
        return lastItems;
      }
    }
    // Stream ended without isComplete — wait a moment and re-open
    if (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  log(`  Vibes pollBatch: timeout reached for batchId=${batchId}`);
  return lastItems;
}

module.exports = { pollBatch };
