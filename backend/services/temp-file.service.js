'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEMP_DIR = path.join(__dirname, '..', 'temp');

/**
 * Centralized temporary file management.
 * Ensures temp directory exists and provides safe create/cleanup utilities.
 */

function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  return TEMP_DIR;
}

function createTempPath(prefix = 'tmp', ext = '.jpg') {
  ensureTempDir();
  const filename = `${prefix}_${crypto.randomUUID()}${ext}`;
  return {
    filename,
    filePath: path.join(TEMP_DIR, filename),
  };
}

function cleanupFile(filePath, logger) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
    if (logger) logger.info(`Cleaned up temp file: ${filePath}`);
  } catch (err) {
    if (logger) logger.warn(`Failed to clean up temp file: ${err.message}`);
  }
}

function cleanupFiles(filePaths, logger) {
  for (const fp of filePaths) {
    cleanupFile(fp, logger);
  }
}

module.exports = { TEMP_DIR: TEMP_DIR, ensureTempDir, createTempPath, cleanupFile, cleanupFiles };
