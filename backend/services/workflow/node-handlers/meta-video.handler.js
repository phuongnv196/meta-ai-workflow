'use strict';

async function handle(node, inputs, context) {
  const { client, log } = context;

  const videoData = inputs.find(i => i.videoFbid);
  if (!videoData) {
    log(`  Warning: Meta Video Extend node has no video input!`);
    throw new Error('No video input for extend node');
  }

  const prompt = node.data.prompt || 'Extend';
  log(`  Calling Meta AI Video Extend for FBID: ${videoData.videoFbid}`);
  return await client.extendVideo(videoData, prompt);
}

module.exports = { handle };
