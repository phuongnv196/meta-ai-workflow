'use strict';

/**
 * Node handler registry — maps node types to their handler modules.
 * Each handler exports: async handle(node, inputs, context) => result
 */

const handlers = {
  text_input:     require('./text-input.handler'),
  file_input:     require('./file-input.handler'),
  meta_chat:      require('./meta-chat.handler'),
  meta_imagine:   require('./meta-imagine.handler'),
  meta_video_gen: require('./meta-video-gen.handler'),
  meta_video:     require('./meta-video.handler'),
  meta_track:     require('./meta-track.handler'),
  extract_frame:  require('./extract-frame.handler'),
  merge_videos:   require('./merge-videos.handler'),
};

function getHandler(nodeType) {
  return handlers[nodeType] || null;
}

module.exports = { getHandler };
