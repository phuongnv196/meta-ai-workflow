'use strict';

const { execFileSync } = require('child_process');
const { log } = require('../utils/logger');

/**
 * Safe FFmpeg/FFprobe wrappers using execFileSync (array args, no shell injection).
 */

function getVideoDuration(videoUrl) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoUrl,
    ], { encoding: 'utf-8', timeout: 30000 });

    const duration = parseFloat(output.trim());
    if (!isNaN(duration) && duration > 0) {
      return duration;
    }
    return null;
  } catch (err) {
    log(`FFprobe duration detection failed: ${err.message}`);
    return null;
  }
}

function hasAudio(videoPath) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ], { encoding: 'utf-8', timeout: 30000 });

    return output.trim().length > 0;
  } catch (err) {
    log(`FFprobe audio detection failed: ${err.message}`);
    return false;
  }
}

function addSilentAudio(inputPath, outputPath) {
  execFileSync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest',
    outputPath,
  ], { timeout: 120000 });
}

function extractFrame(videoUrl, seekTime, outputPath) {
  execFileSync('ffmpeg', [
    '-y',
    '-ss', String(seekTime),
    '-i', videoUrl,
    '-vframes', '1',
    '-f', 'image2',
    outputPath,
  ], { timeout: 60000 });
}

function concatVideos(concatFilePath, outputPath) {
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFilePath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-ac', '2',
    '-ar', '44100',
    outputPath,
  ], { timeout: 120000 });
}

function addAudioToVideo(videoUrl, audioUrl, outputPath) {
  execFileSync('ffmpeg', [
    '-y',
    '-i', videoUrl,
    '-i', audioUrl,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    outputPath,
  ], { timeout: 120000 });
}

module.exports = { getVideoDuration, extractFrame, concatVideos, hasAudio, addSilentAudio, addAudioToVideo };
