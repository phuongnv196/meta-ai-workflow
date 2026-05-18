/**
 * meta_ai/stream_parser.js
 * Các tiện ích parse WebSocket stream từ Meta AI.
 *
 * Thiết kế:
 *  - Stateless pure functions — không giữ state nội bộ, state được truyền vào ngoài
 *  - Chạy trên từng chunk riêng lẻ, KHÔNG tích lũy toàn bộ stream vào bộ nhớ
 */

'use strict';

// ── Regex Patterns ────────────────────────────────────────────────────────

// UUID v4 pattern
const UUID_STR = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

// response_id ở top-level response của Meta AI
const RESPONSE_ID_RE = new RegExp('"response_id"\\s*:\\s*"(' + UUID_STR + ')"', 'i');

// Media ID: số ≥ 10 chữ số sau manifold hoặc upload
const MEDIA_RE = /(?:manifold|upload)(?:_media|:)?_?(\d{10,})/i;

// Media ID từ mảng image_ids
const IMAGE_IDS_RE = /image_ids[^0-9]*([0-9]{10,})/;

// Video FBID từ video_ids array.
// Dùng pattern đơn giản, bắt số sau fbid: bất kể mức escape:
//   {"video_ids":["fbid:\/\/1081456565055674"]}
//   {\"video_ids\":[\"fbid:\/\/1081456565055674\"]}
const VIDEO_IDS_RE = /video_ids[\s\S]*?fbid:[^0-9]*([0-9]{10,})/;

// Video URL: link .mp4 CDN fbcdn
const VIDEO_URL_RE = /https?:\/\/[a-z0-9.-]+\.fbcdn\.net\/[^\s"]+\.mp4[^\s"]*/i;

// Image URL: link CDN fbcdn (thường chứa /v/ /t/ hoặc lookaside)
const IMAGE_URL_RE = /https?:\/\/[a-z0-9.-]+\.(?:fbcdn\.net|fbsbx\.com)\/[^\s"]+(?:\.jpg|\.png|oe=[a-f0-9]+)[^\s"]*/i;

// "text":"..." field trong JSON stream
const TEXT_FIELD_RE = /"text":"((?:[^"\\]|\\.)*)"/g;

// ── Exports ───────────────────────────────────────────────────────────────

/**
 * Trích xuất dữ liệu Imagine từ một chunk stream, cập nhật vào `state`.
 *
 * @param {string} chunk
 * @param {{ requestId, mediaId, videoFbid, videoUrl, accumulatedText }} state
 */
function extractImagineData(chunk, state) {
  try {
    // 1. Response ID (dùng làm imagineRequestId khi extend)
    const idMatch = chunk.match(RESPONSE_ID_RE);
    if (idMatch && idMatch[1] !== state.requestId) {
      state.requestId = idMatch[1];
      process.stdout.write('\n[Stream] Response ID: ' + idMatch[1] + '\n');
    }

    // 2. Video FBID từ video_ids (kết quả cuối sau khi video được sinh)
    const fbidMatch = chunk.match(VIDEO_IDS_RE);
    if (fbidMatch && fbidMatch[1] !== state.videoFbid) {
      const isInputId = state.inputMediaIds && state.inputMediaIds.some(id => String(id) === String(fbidMatch[1]));
      if (!isInputId) {
        state.videoFbid = fbidMatch[1];
        state.videoUrl = 'fbid://' + fbidMatch[1];
        process.stdout.write('\n[Stream] Video FBID: ' + fbidMatch[1] + '\n');
      }
    }

    // 3. Media ID từ manifold/upload hoặc image_ids (ID ảnh upload hoặc preview)
    const mediaMatch = chunk.match(MEDIA_RE);
    if (mediaMatch && mediaMatch[1] !== state.mediaId) {
      const isInputId = state.inputMediaIds && state.inputMediaIds.some(id => String(id) === String(mediaMatch[1]));
      if (!isInputId) {
        state.mediaId = mediaMatch[1];
        process.stdout.write('\n[Stream] Media ID (regex): ' + mediaMatch[1] + '\n');
      }
    }

    const imageIdsMatch = chunk.match(IMAGE_IDS_RE);
    if (imageIdsMatch && imageIdsMatch[1] !== state.mediaId) {
      const isInputId = state.inputMediaIds && state.inputMediaIds.some(id => String(id) === String(imageIdsMatch[1]));
      if (!isInputId) {
        state.mediaId = imageIdsMatch[1];
        process.stdout.write('\n[Stream] Media ID (image_ids): ' + imageIdsMatch[1] + '\n');
      }
    }

    // 4. Media URL (Video hoặc Image)
    if (!state.videoUrl || state.videoUrl.startsWith('fbid://')) {
      // Bỏ qua các chunk chứa thông tin của ảnh đầu vào đã upload
      const isInputUploadChunk = chunk.includes('"content_hash":"upload:') || 
        (state.inputMediaIds && state.inputMediaIds.some(id => chunk.includes(id)));

      if (!isInputUploadChunk) {
        const mp4Match = chunk.match(VIDEO_URL_RE);
        if (mp4Match) {
          state.videoUrl = mp4Match[0];
          process.stdout.write('\n[Stream] Video URL (mp4): ' + state.videoUrl + '\n');
        } else {
          const imgMatch = chunk.match(IMAGE_URL_RE);
          if (imgMatch) {
            state.videoUrl = imgMatch[0]; // Tạm thời dùng chung field videoUrl
            process.stdout.write('\n[Stream] Image URL: ' + imgMatch[0] + '\n');
          }
        }
      }
    }
  } catch (_) { /* bỏ qua lỗi parse */ }
}

/**
 * In phần text mới từ stream response ra stdout (progressive diff).
 * @returns {boolean} true nếu chunk có text field
 */
function printStreamText(chunk, state) {
  // Reset lastIndex vì regex có flag /g
  TEXT_FIELD_RE.lastIndex = 0;
  const matches = [...chunk.matchAll(TEXT_FIELD_RE)];
  if (matches.length === 0) return false;

  for (const match of matches) {
    try {
      // Dùng JSON.parse để decode escape sequences đúng cách
      const obj = JSON.parse('{"text":' + JSON.stringify(match[1]) + '}');
      const text = obj.text || '';
      if (text.length > state.accumulatedText.length) {
        const diff = text.slice(state.accumulatedText.length);
        if (diff.trim()) process.stdout.write(diff);
        state.accumulatedText = text;
      }
    } catch (_) { /* chunk bị cắt */ }
  }
  return true;
}

/**
 * In các chuỗi printable từ chunk thô (dùng để debug).
 */
function printRawChunk(chunk, prefix) {
  prefix = prefix || '[Raw]';
  const IGNORED = ['req-id', 'response_id'];
  const printable = chunk.match(/[ -~]{10,}/g);
  if (!printable) return;
  const seen = new Set();
  for (const s of printable) {
    const trimmed = s.trim();
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    if (!IGNORED.some(function(k) { return trimmed.includes(k); })) {
      process.stdout.write('\n' + prefix + ': ' + trimmed);
    }
  }
}

module.exports = { extractImagineData, printStreamText, printRawChunk };
