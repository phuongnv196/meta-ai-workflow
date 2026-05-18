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
    '-c', 'copy',
    outputPath,
  ], { timeout: 120000 });
}

module.exports = { getVideoDuration, extractFrame, concatVideos };
