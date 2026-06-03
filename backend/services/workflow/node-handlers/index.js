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
  // Vibes AI nodes
  vibes_upload_image:      require('./vibes-upload-image.handler'),
  vibes_upload_audio:      require('./vibes-upload-audio.handler'),
  vibes_generate_prompts:  require('./vibes-generate-prompts.handler'),
  vibes_generate_images:   require('./vibes-generate-images.handler'),
  vibes_generate_videos:   require('./vibes-generate-videos.handler'),
  vibes_tts:               require('./vibes-tts.handler'),
  vibes_animate:           require('./vibes-animate.handler'),
};

function getHandler(nodeType) {
  return handlers[nodeType] || null;
}

module.exports = { getHandler };
