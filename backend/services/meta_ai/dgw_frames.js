/**
 * meta_ai/dgw_frames.js
 * Builder cho DGW (Data Gateway) binary frames theo giao thức của Meta AI.
 *
 * Cấu trúc frame (reverse-engineered):
 *  - Init frame  : [0x0f, 0x00, 0x00, len_lo, len_mid, len_hi] + JSON payload
 *  - Payload frame: [0x0d, 0x00, 0x00, len_lo, len_mid, len_hi, 0x00, 0x80] + JSON payload
 */

'use strict';

/**
 * Tạo frame khởi tạo stream (gói tin đầu tiên).
 * @param {string} conversationId - UUID của conversation
 * @returns {Buffer}
 */
function buildInitStreamFrame(conversationId) {
  const payload = {
    'x-dgw-app-x-ecto-conversation-id': conversationId,
    'x-dgw-app-client-payload-type': 'PROTO_INSIDE_JSON',
  };
  const jsonBuf = Buffer.from(JSON.stringify(payload), 'utf-8');
  const len = jsonBuf.length;
  const header = Buffer.from([
    0x0f, 0x00, 0x00,
    len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff,
  ]);
  return Buffer.concat([header, jsonBuf]);
}

/**
 * Tạo frame chứa payload Protobuf (gói tin thứ hai).
 * @param {string} reqId       - UUID của request
 * @param {string} base64Proto - Protobuf đã encode sang Base64
 * @returns {Buffer}
 */
function buildPayloadFrame(reqId, base64Proto) {
  const payload = { 'req-id': reqId, payload: base64Proto };
  const jsonBuf = Buffer.from(JSON.stringify(payload), 'utf-8');
  const len = jsonBuf.length + 2; // +2 cho 2 byte trailing (0x00 0x80)
  const header = Buffer.from([
    0x0d, 0x00, 0x00,
    len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff,
    0x00, 0x80,
  ]);
  return Buffer.concat([header, jsonBuf]);
}

module.exports = { buildInitStreamFrame, buildPayloadFrame };
