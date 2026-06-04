'use strict';

const { uploadFile } = require('../../meta_ai');
const { getVideoDuration, extractFrame } = require('../../ffmpeg.service');
const { createTempPath } = require('../../temp-file.service');
const config = require('../../../config/env');

async function handle(node, inputs, context) {
  const { log } = context;

  const videoInput = inputs.find(i => i.videoUrl && i.videoUrl.startsWith('http'));
  if (!videoInput) {
    throw new Error('Không tìm thấy link video đầu vào hợp lệ. Hãy nối node này với một node trả về video.');
  }

  const remoteVideoUrl = videoInput.videoUrl;
  const frameType = node.data.frameType || 'last';
  const timeOffset = node.data.timeOffset || 0;

  let extractTime = 0;
  if (frameType === 'last') {
    log(`  Detecting duration of video for last frame extraction: ${remoteVideoUrl}`);
    const duration = getVideoDuration(remoteVideoUrl);
    if (duration) {
      extractTime = Math.max(0, duration - 0.05);
      log(`  Detected video duration: ${duration}s, seeking to: ${extractTime}s`);
    } else {
      extractTime = 4.9;
      log(`  Failed to detect duration. Falling back to 4.9s`);
    }
  } else if (frameType === 'first') {
    extractTime = 0;
    log(`  Extracting first frame (0s)`);
  } else {
    extractTime = Math.max(0, timeOffset);
    log(`  Extracting frame at custom offset: ${extractTime}s`);
  }

  const { filename: tempFilename, filePath: tempFilePath } = createTempPath('frame', '.jpg');

  log(`  Extracting frame using FFmpeg at ${extractTime}s to ${tempFilePath}`);
  extractFrame(remoteVideoUrl, extractTime, tempFilePath);
  log(`  Frame extracted successfully.`);

  log(`  Uploading extracted frame to Meta AI...`);
  const uploadedMediaId = await uploadFile(tempFilePath, 'image/jpeg');
  log(`  Uploaded successfully. Meta AI Media ID: ${uploadedMediaId}`);

  let base64Data = null;
  try {
    const fs = require('fs');
    base64Data = fs.readFileSync(tempFilePath, { encoding: 'base64' });
  } catch (e) {
    log(`  Warning: failed to read frame as base64: ${e.message}`);
  }

  const publicUrl = `${config.baseUrl}/temp/${tempFilename}`;
  return {
    videoUrl: publicUrl,
    generatedImageUrl: publicUrl,
    mediaId: uploadedMediaId,
    filename: tempFilename,
    mimeType: 'image/jpeg',
    base64Data,
    attachments: [{
      id: uploadedMediaId,
      mimeType: 'image/jpeg',
      filename: tempFilename,
    }],
  };
}

module.exports = { handle };
