/**
 * meta_ai/uploader.js
 * Upload file media lên Meta AI rupload server.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AUTH_TOKEN, UPLOAD_BASE_URL } = require('./config');

/**
 * Upload một file ảnh/video lên Meta AI và trả về media_id.
 *
 * @param {string} filePath   - Đường dẫn tuyệt đối đến file cần upload
 * @param {string} [mimeType] - MIME type (mặc định 'image/jpeg')
 * @returns {Promise<string>} - media_id trả về từ server
 * @throws {Error} Nếu upload thất bại hoặc server không trả về media_id
 */
async function uploadFile(filePath, mimeType = 'image/jpeg') {
  const stats = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  const headers = {
    desired_upload_handler: 'genai_document',
    ecto_auth_token: 'true',
    is_abra_user: 'true',
    offset: '0',
    'x-entity-name': filename,
    'x-entity-type': mimeType,
    'x-entity-length': String(stats.size),
    Authorization: `OAuth ${AUTH_TOKEN}`,
    'Content-Type': mimeType,
  };

  const tenantUuid = crypto.randomUUID();
  const uploadUrl = `${UPLOAD_BASE_URL}/${tenantUuid}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers,
    body: fileBuffer,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Upload failed: HTTP ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const mediaId = result.media_id || result.h || result.id || result.handle;

  if (!mediaId) {
    throw new Error(`Upload OK nhưng không tìm thấy media_id. Response: ${JSON.stringify(result)}`);
  }

  return String(mediaId);
}

/**
 * Tải file từ một URL và lưu vào đĩa.
 *
 * @param {string} url - URL CDN
 * @param {string} destPath - Đường dẫn đích để lưu file
 * @returns {Promise<string>} - Đường dẫn file đã lưu
 */
async function downloadFile(url, destPath) {
  const dir = require('path').dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
  return destPath;
}

module.exports = { uploadFile, downloadFile };
