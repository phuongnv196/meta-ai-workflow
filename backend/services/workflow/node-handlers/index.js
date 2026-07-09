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
  add_audio:      require('./add-audio.handler'),
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
  // Custom composite node
  custom_node:             require('./custom-node.handler'),
  // Phase 2: Universal LLM
  universal_llm:           require('./universal-llm.handler'),
  // Phase 3: Condition (If/Else)
  condition:               require('./condition.handler'),
  // Phase 4: Utility nodes
  delay:                   require('./delay.handler'),
  http_request:            require('./http-request.handler'),
  json_extractor:          require('./json-extractor.handler'),
  text_transform:          require('./text-transform.handler'),
  loop_node:               require('./loop-node.handler'),
  // Google Stitch AI nodes
  stitch_upload:           require('./stitch-upload.handler'),
  stitch_generate:         require('./stitch-generate.handler'),
  stitch_edit:             require('./stitch-edit.handler'),
  // Gemini AI Nodes
  gemini_upload_image:     require('./gemini-upload-image.handler'),
  gemini_image_gen:        require('./gemini-image-gen.handler'),
  // Image utilities
  add_image:               require('./add-image.handler'),
  image_resize:            require('./image-resize.handler'),
};

function getHandler(nodeType) {
  return handlers[nodeType] || null;
}

module.exports = { getHandler };
