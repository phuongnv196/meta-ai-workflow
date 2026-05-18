/**
 * meta_ai/index.js
 * Public API của thư viện meta_ai.
 * Import từ đây thay vì trực tiếp từ các file nội bộ.
 */

'use strict';

const { MetaAIClient } = require('./client');
const { uploadFile, downloadFile } = require('./uploader');
const { resolveVideoUrl, resolveVideoStatus } = require('./graphql_resolver');
const { resolveTrackInfo } = require('./track_resolver');

module.exports = {
  MetaAIClient,
  uploadFile,
  downloadFile,
  resolveVideoUrl,
  resolveVideoStatus,
  resolveTrackInfo
};

