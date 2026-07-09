'use strict';

const { execFileSync } = require('child_process');
const { log } = require('../utils/logger');

/**
 * Safe FFmpeg/FFprobe wrappers using execFileSync (array args, no shell injection).
 */

function getVideoResolution(videoPath) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      videoPath,
    ], { encoding: 'utf-8', timeout: 30000 });
    const parts = output.trim().split('x').map(Number);
    return { width: parts[0] || 0, height: parts[1] || 0 };
  } catch (err) {
    log(`FFprobe resolution detection failed: ${err.message}`);
    return null;
  }
}

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
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-ac', '2',
    '-ar', '44100',
    outputPath,
  ], { timeout: 300000 });
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

  // Normalize all inputs to the first video's resolution so xfade doesn't fail on size mismatch
  const baseRes = getVideoResolution(inputFiles[0]);
  const targetW = baseRes ? baseRes.width : 0;
  const targetH = baseRes ? baseRes.height : 0;

  for (let i = 0; i < n; i++) {
    if (targetW && targetH) {
      filterParts.push(`[${i}:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=disable,setsar=1[vs${i}]`);
    } else {
      filterParts.push(`[${i}:v]setsar=1[vs${i}]`);
    }
  }

  // xfade chain over the scaled streams
  let prevVideoLabel = '[vs0]';
  let prevAudioLabel = '[0:a]';
  let offset = durations[0] - duration;

  for (let i = 1; i < n; i++) {
    const outV = i < n - 1 ? `[v${i}]` : '[vout]';
    const outA = i < n - 1 ? `[a${i}]` : '[aout]';

    filterParts.push(
      `${prevVideoLabel}[vs${i}]xfade=transition=${transition}:duration=${duration}:offset=${Math.max(0, offset)}${outV}`
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
    '-pix_fmt', 'yuv420p',
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
