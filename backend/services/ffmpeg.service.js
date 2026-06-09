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

/**
 * Concatenate videos with xfade transitions between segments.
 * @param {string[]} inputFiles - array of local video file paths
 * @param {string} outputPath - output file path
 * @param {string} transition - xfade transition name (e.g. 'fade', 'dissolve', 'wipeleft')
 * @param {number} [duration=0.5] - transition duration in seconds
 */
function concatVideosWithTransition(inputFiles, outputPath, transition, duration = 0.5) {
  if (inputFiles.length < 2) {
    throw new Error('Need at least 2 videos for transition merge');
  }

  // Get durations of each input
  const durations = inputFiles.map(f => {
    const d = getVideoDuration(f);
    if (!d) throw new Error(`Cannot determine duration of ${f}`);
    return d;
  });

  // Build complex filter graph with xfade between consecutive pairs
  // and acrossfade for audio
  const inputs = [];
  for (const f of inputFiles) {
    inputs.push('-i', f);
  }

  const n = inputFiles.length;
  const filterParts = [];

  // First, label each input stream
  // xfade chain: [0][1] -> [v01], [v01][2] -> [v012], etc.
  let prevVideoLabel = '[0:v]';
  let prevAudioLabel = '[0:a]';
  let offset = durations[0] - duration;

  for (let i = 1; i < n; i++) {
    const outV = i < n - 1 ? `[v${i}]` : '[vout]';
    const outA = i < n - 1 ? `[a${i}]` : '[aout]';

    filterParts.push(
      `${prevVideoLabel}[${i}:v]xfade=transition=${transition}:duration=${duration}:offset=${Math.max(0, offset)}${outV}`
    );
    filterParts.push(
      `${prevAudioLabel}[${i}:a]acrossfade=d=${duration}${outA}`
    );

    prevVideoLabel = outV;
    prevAudioLabel = outA;
    offset += durations[i] - duration;
  }

  const filterComplex = filterParts.join(';');

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-ac', '2',
    '-ar', '44100',
    outputPath,
  ];

  execFileSync('ffmpeg', args, { timeout: 300000 });
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

module.exports = { getVideoDuration, extractFrame, concatVideos, concatVideosWithTransition, hasAudio, addSilentAudio, addAudioToVideo };
