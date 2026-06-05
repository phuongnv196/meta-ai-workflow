'use strict';

const { downloadFile } = require('../../meta_ai/uploader');
const { addAudioToVideo } = require('../../ffmpeg.service');
const { createTempPath, cleanupFiles, ensureTempDir } = require('../../temp-file.service');
const config = require('../../../config/env');

async function handle(node, inputs, context) {
  const { log } = context;

  // 1. Find video input from previous nodes
  const videoInput = inputs.find(i => i.videoUrl && i.videoUrl.startsWith('http'));
  if (!videoInput) {
    throw new Error('Không tìm thấy video đầu vào. Hãy nối node này với một node tạo/trả về video.');
  }

  // 2. Find audio input (from node data via upload, or from previous node)
  let audioUrl = node.data.audioUrl;
  let base64Audio = node.data.base64Data; // from upload directly in the node

  if (!audioUrl && !base64Audio) {
    const audioInput = inputs.find(i => i.audioUrl || (i.audioPreview && i.audioPreview.startsWith('data:audio')));
    if (audioInput) {
      audioUrl = audioInput.audioUrl || audioInput.audioPreview;
    }
  }

  if (!audioUrl && !base64Audio) {
    throw new Error('Không tìm thấy audio đầu vào. Hãy upload file audio hoặc nối với node xuất audio.');
  }

  ensureTempDir();
  const tempFilesToClean = [];

  try {
    // 3. Download or create temp video file
    const { filePath: tempVideoPath } = createTempPath('add_audio_input', '.mp4');
    tempFilesToClean.push(tempVideoPath);
    log(`  Downloading video from: ${videoInput.videoUrl}`);
    await downloadFile(videoInput.videoUrl, tempVideoPath);

    // 4. Download or create temp audio file
    const { filePath: tempAudioPath } = createTempPath('add_audio_input', '.mp3');
    tempFilesToClean.push(tempAudioPath);

    if (base64Audio) {
      log(`  Using uploaded base64 audio data`);
      const fs = require('fs');
      const b64Str = base64Audio.includes(',') ? base64Audio.split(',')[1] : base64Audio;
      fs.writeFileSync(tempAudioPath, Buffer.from(b64Str, 'base64'));
    } else if (audioUrl && audioUrl.startsWith('data:audio')) {
      log(`  Using base64 audio data URI from previous node`);
      const fs = require('fs');
      const b64Str = audioUrl.split(',')[1];
      fs.writeFileSync(tempAudioPath, Buffer.from(b64Str, 'base64'));
    } else {
      log(`  Downloading audio from: ${audioUrl}`);
      await downloadFile(audioUrl, tempAudioPath);
    }

    // 5. Run FFmpeg to merge
    const { filename: outputFilename, filePath: outputFilePath } = createTempPath('with_audio', '.mp4');
    log(`  Merging audio into video using FFmpeg...`);
    addAudioToVideo(tempVideoPath, tempAudioPath, outputFilePath);
    log(`  FFmpeg merge completed successfully.`);

    const publicUrl = `${config.baseUrl}/temp/${outputFilename}`;
    return {
      videoUrl: publicUrl,
      resultUrl: publicUrl,
      filename: outputFilename,
      mimeType: 'video/mp4',
    };
  } finally {
    cleanupFiles(tempFilesToClean, { info: log, warn: log });
    log(`  Cleaned up temporary input files successfully.`);
  }
}

module.exports = { handle };
