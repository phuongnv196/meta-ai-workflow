'use strict';

const { resolveTrackInfo } = require('../../meta_ai');

async function handle(node, inputs, context) {
  const { log } = context;

  const trackId = node.data.trackId
    || (inputs.find(i => i.promptText)?.promptText)
    || '609632436429286';

  log(`  Calling Meta AI Track Resolver for Track ID: ${trackId}`);
  const tracks = await resolveTrackInfo(trackId);

  if (tracks && tracks.length > 0) {
    const track = tracks[0];
    return {
      videoUrl: track.audioUrl,
      audioUrl: track.audioUrl,
      largeImageUrl: track.largeImageUrl,
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs,
      trackData: track,
    };
  }

  throw new Error(`Could not resolve track info for ID ${trackId}`);
}

module.exports = { handle };
