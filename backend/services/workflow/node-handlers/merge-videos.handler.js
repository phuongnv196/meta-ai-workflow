'use strict';

const fs = require('fs');
const { downloadFile } = require('../../meta_ai/uploader');
const { concatVideos } = require('../../ffmpeg.service');
const { createTempPath, cleanupFile, cleanupFiles, ensureTempDir } = require('../../temp-file.service');
const config = require('../../../config/env');

async function handle(node, _inputs, context) {
  const { edges, nodes, results, log } = context;
  const nodeId = node.id;

  const parentEdges = edges.filter(e => e.target === nodeId);

  const sortedParents = parentEdges
    .map(edge => nodes.find(n => n.id === edge.source))
    .filter(Boolean)
    .sort((a, b) => a.position.x - b.position.x);

  const videoInputs = sortedParents
    .map(n => ({ id: n.id, data: results[n.id] }))
    .filter(x => x.data && x.data.videoUrl && x.data.videoUrl.startsWith('http'));

  if (videoInputs.length === 0) {
    throw new Error('Không tìm thấy bất kỳ video đầu vào nào để ghép.');
  }

  log(`  Merging ${videoInputs.length} videos sequentially (Timeline ordered Left-to-Right)...`);

  ensureTempDir();
  const localFiles = [];
  let concatTxtPath = null;
  const { filename: outputFilename, filePath: outputFilePath } = createTempPath('merged', '.mp4');

  try {
    // Step 1: Download all CDN videos locally
    for (let i = 0; i < videoInputs.length; i++) {
      const video = videoInputs[i];
      const { filePath: tempFilePath } = createTempPath(`input_${i}`, '.mp4');

      log(`  Downloading video segment ${i + 1}/${videoInputs.length}: ${video.data.videoUrl}`);
      await downloadFile(video.data.videoUrl, tempFilePath);
      localFiles.push(tempFilePath);
    }

    // Step 2: Create FFmpeg concat listing
    const { filePath: txtPath } = createTempPath('concat', '.txt');
    concatTxtPath = txtPath;

    const fileListContent = localFiles
      .map(filepath => `file '${filepath.replace(/\\/g, '/')}'`)
      .join('\n');

    fs.writeFileSync(concatTxtPath, fileListContent);
    log(`  Created FFmpeg concat listing file:\n${fileListContent}`);

    // Step 3: Run FFmpeg concat
    log(`  Executing FFmpeg stream-copy merge to ${outputFilePath}...`);
    concatVideos(concatTxtPath, outputFilePath);
    log(`  FFmpeg merge completed successfully.`);
  } finally {
    cleanupFile(concatTxtPath, { info: log, warn: log });
    cleanupFiles(localFiles, { info: log, warn: log });
    log(`  Cleaned up temporary input files successfully.`);
  }

  const publicUrl = `${config.baseUrl}/temp/${outputFilename}`;
  return {
    videoUrl: publicUrl,
    filename: outputFilename,
    mimeType: 'video/mp4',
  };
}

module.exports = { handle };
