/**
 * meta_ai/client.js
 * MetaAIClient — lớp bao bọc toàn bộ logic WebSocket với Meta AI Gateway.
 *
 * Sử dụng:
 *   const client = new MetaAIClient();
 *   const result = await client.chat({ promptText, attachments });
 *   await client.extendVideo(result);
 */

'use strict';

const crypto = require('crypto');
const WebSocket = require('ws');
const { buildClippyProtobufPayload, buildExtendVideoPayload } = require('./meta_proto_builder');
const { WS_URL, WS_HEADERS } = require('./config');
const { buildInitStreamFrame, buildPayloadFrame } = require('./dgw_frames');
const { extractImagineData, printStreamText, printRawChunk } = require('./stream_parser');
const { resolveVideoUrl, resolveVideoStatus } = require('./graphql_resolver');

/** Thời gian chờ tối đa cho mỗi session (ms) */

const SESSION_TIMEOUT_MS = 90_000;

class MetaAIClient {
  /**
   * Gửi một chat request lên Meta AI Gateway và nhận stream response.
   *
   * @param {object} options
   * @param {string}   options.promptText      - Nội dung prompt
   * @param {string}   [options.conversationId] - ID hội thoại cũ (nếu có)
   * @param {Function} [options.onChunk]       - Callback tùy chỉnh cho mỗi chunk nhận được
   * @returns {Promise<{requestId: string|null, mediaId: string|null, videoFbid: string|null, videoUrl: string|null, conversationId: string, text: string}>}
   */
  chat(options = {}) {
    const {
      promptText,
      timezone = 'Asia/Ho_Chi_Minh',
      newConversation = true,
      attachments = [],
      conversationId: existingConversationId = null,
      onChunk = null,
      expectVideo = false,
    } = options;

    const inputMediaIds = attachments.map(a => a.id).filter(Boolean);

    return this._openSession(async (ws, { conversationId, reqId }) => {
      const protobufBase64 = await buildClippyProtobufPayload({
        conversationId,
        turnId: crypto.randomUUID(),
        requestId: reqId,
        promptText,
        timezone,
        newConversation: existingConversationId ? false : newConversation,
        attachments,
      });
      ws.send(buildPayloadFrame(reqId, protobufBase64));
      console.log(`[Client] Chat payload gửi thành công (${protobufBase64.length} chars)`);
    }, existingConversationId, onChunk, expectVideo, inputMediaIds);
  }

  /**
   * Sinh ảnh từ văn bản (có thể kèm ảnh tham chiếu).
   *
   * @param {object} options
   * @param {string} options.promptText    - Mô tả ảnh muốn sinh
   * @param {Array}  [options.attachments] - Danh sách ảnh tham chiếu
   * @returns {Promise<object>} streamState
   */
  generateImage(options = {}) {
    const { promptText, attachments = [] } = options;
    let finalPrompt = promptText || 'Generate an image';
    if (!finalPrompt.toLowerCase().includes('imagine') && !finalPrompt.toLowerCase().includes('vẽ')) {
      finalPrompt = `imagine ${finalPrompt}`;
    }
    return this.chat({
      promptText: finalPrompt,
      attachments,
      newConversation: true
    });
  }

  /**
   * Kéo dài (extend) một video đã sinh từ Meta AI.
   *
   * @param {object} videoData
   * @param {string}      videoData.requestId  - response_id từ session sinh video gốc (imagineRequestId)
   * @param {string}      videoData.videoFbid  - FBID của video đã sinh (sourceMediaEntId)
   * @param {string|null} videoData.videoUrl   - URL mp4 CDN nếu có (sourceMediaUrl), bỏ qua nếu chỉ có fbid://
   * @param {string} [promptText]              - Lệnh mở rộng (mặc định "Extend")
   * @param {Function} [onChunk]               - Callback tùy chỉnh
   * @returns {Promise<{requestId: string|null, mediaId: string|null, videoFbid: string|null, videoUrl: string|null}>}
   */
  extendVideo(videoData, promptText = 'Extend', onChunk = null) {
    const { requestId, videoFbid, videoUrl, conversationId: existingConversationId } = videoData;

    // sourceMediaUrl chỉ dùng nếu là URL thật (https://...), không dùng fbid:// scheme
    const sourceMediaUrl = (videoUrl && videoUrl.startsWith('https://')) ? videoUrl : null;

    return this._openSession(async (ws, { conversationId, reqId }) => {
      const extendPayload = await buildExtendVideoPayload({
        conversationId,
        requestId: reqId,
        imagineRequestId: requestId,  // response_id từ session gốc
        videoUrl: sourceMediaUrl,     // URL mp4 CDN (hoặc null)
        videoEntId: videoFbid,        // FBID của video đã sinh
        promptText,
      });
      ws.send(buildPayloadFrame(reqId, extendPayload));
      console.log(`[Client] Extend Video payload gửi thành công`);
      console.log(`  conversationId: ${conversationId}`);
      console.log(`  imagineRequestId: ${requestId}`);
      console.log(`  videoEntId (fbid): ${videoFbid}`);
      console.log(`  sourceMediaUrl: ${sourceMediaUrl || '(null)'}`);
    }, existingConversationId, onChunk, true, [videoFbid], true);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Mở một WebSocket session, gửi Init Frame, chạy `payloadFn`, lắng nghe stream.
   * Resolve với `streamState` khi connection đóng.
   *
   * @private
   * @param {Function} payloadFn - async (ws, {conversationId, reqId}) => void
   * @param {string|null} existingConversationId - ID hội thoại cũ nếu muốn nối thread
   * @param {Function|null} onChunk - optional callback(chunk, streamState)
   * @returns {Promise<object>} streamState
   */
  _openSession(payloadFn, existingConversationId = null, onChunk = null, expectVideo = false, inputMediaIds = [], isExtendVideo = false) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL, { headers: WS_HEADERS });

      const state = {
        requestId: null,
        mediaId: null,
        videoFbid: null,
        videoUrl: null,
        isVideoUrlResolved: false, // Cờ đánh dấu đã giải mã được video URL thực tế từ GraphQL
        conversationId: existingConversationId,
        accumulatedText: '',
        error: null,
        inputMediaIds
      };

      let inactivityTimer = null;
      let pollingInterval = null;

      const timer = setTimeout(() => {
        console.warn('\n[Client] Timeout — đóng kết nối.');
        ws.close();
      }, SESSION_TIMEOUT_MS);

      ws.on('open', async () => {
        console.log('[Client] WebSocket connected');
        const conversationId = existingConversationId || crypto.randomUUID();
        const reqId = crypto.randomUUID();

        state.conversationId = conversationId;

        // Gửi Init Frame
        ws.send(buildInitStreamFrame(conversationId));

        try {
          await payloadFn(ws, { conversationId, reqId });
        } catch (err) {
          clearTimeout(timer);
          ws.close();
          reject(err);
        }
      });

      ws.on('message', (data) => {
        try {
          const chunk = data.toString('utf-8');

          // Trích xuất metadata Imagine
          extractImagineData(chunk, state);

          // Nếu phát hiện videoFbid (non-input) và chưa bắt đầu polling giải mã video URL
          if (state.videoFbid && !pollingInterval) {
            console.log(`\n[Client] Phát hiện videoFbid: ${state.videoFbid}. Khởi chạy giải mã qua GraphQL Status Stream...`);
            
            // Cài đặt một timeout tối đa cho background polling (45 giây) để trả về kết quả dự phòng
            const pollTimeout = setTimeout(() => {
              if (pollingInterval) {
                console.warn('\n[Client] Đã đạt timeout tối đa cho GraphQL Status Stream (45s). Trả về kết quả fallback fbid://');
                clearInterval(pollingInterval);
                pollingInterval = null;
                resolve(state);
              }
            }, 45000);

            const poll = async () => {
              try {
                // 1. Thử giải mã bằng GraphQL status stream mới qua videoFbid (Meta AI nhận diện videoFbid là mediaId trong status stream!)
                const result = await resolveVideoStatus(state.videoFbid);
                if (result && result.videoUrl && result.videoUrl.startsWith('http')) {
                  state.videoUrl = result.videoUrl;
                  state.isVideoUrlResolved = true; // Đánh dấu đã giải mã thành công!
                  console.log(`\n[Client] [GraphQL Status Stream] Đã lấy được video CDN URL thực tế!`);
                  
                  if (pollingInterval) {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                  }
                  clearTimeout(pollTimeout);
                  
                  console.log('\n[Client] Kết thúc phiên và giải quyết Promise thành công.');
                  resolve(state);
                  return;
                }

                // 2. Dự phòng: Chạy thêm giải mã cũ bằng cardId làm phương án song hành
                const oldResult = await resolveVideoUrl(state.videoFbid);
                if (oldResult && oldResult.videoUrl && oldResult.videoUrl.startsWith('http')) {
                  state.videoUrl = oldResult.videoUrl;
                  state.isVideoUrlResolved = true; // Đánh dấu đã giải mã thành công!
                  console.log(`\n[Client] [GraphQL Old Resolver Fallback] Đã lấy được video CDN URL thực tế!`);
                  
                  if (pollingInterval) {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                  }
                  clearTimeout(pollTimeout);
                  
                  console.log('\n[Client] Kết thúc phiên và giải quyết Promise thành công.');
                  resolve(state);
                  return;
                }
              } catch (err) {
                console.error(`[Client] Lỗi giải mã GraphQL: ${err.message}`);
              }
            };

            poll(); // Chạy ngay lập tức phát đầu
            pollingInterval = setInterval(poll, 4000); // Lặp lại mỗi 4 giây
          }

          // Phát hiện từ chối an toàn của Meta AI (Safety policy refusal)
          if (chunk.includes("Sorry, I can't answer") || chunk.includes("can't answer that question") || chunk.includes("I can't do that")) {
            console.warn('\n[Client] Meta AI từ chối xử lý yêu cầu (Safety Refusal).');
            state.error = "Meta AI từ chối xử lý hình ảnh này do chính sách nội dung bảo mật (Safety Policy).";
            ws.close();
            return;
          }

          // Nếu đã nhận đủ kết quả đích (ảnh CDN hoặc video CDN hoàn chỉnh), đóng sớm sau 2s im lặng
          const isVideoRequest = expectVideo || !!state.videoFbid;
          // Nếu là sinh video (isVideoRequest), bắt buộc phải giải mã được link CDN video thật và có videoFbid
          const isRealVideo = !!state.videoFbid && state.isVideoUrlResolved;
          const hasFinishedResult = isVideoRequest ? isRealVideo : !!state.videoUrl;

          // For text-only requests (no attachments, not expecting video), close after receiving text
          const isTextOnlyRequest = !expectVideo && inputMediaIds.length === 0 && !state.videoFbid;
          const hasTextResponse = state.accumulatedText && state.accumulatedText.length > 10;

          if (hasFinishedResult) {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
              console.log('\n[Client] Đã nhận đủ CDN URL & im lặng 2s. Resolve sớm...');
              ws.close();
            }, 2000);
          } else if (isTextOnlyRequest && hasTextResponse) {
            // For text-only requests, close after 3 seconds of receiving text
            if (inactivityTimer) clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
              console.log('\n[Client] Đã nhận text response cho text-only request. Đóng kết nối...');
              ws.close();
            }, 3000);
          }

          // Nếu có callback tùy chỉnh thì dùng, ngược lại dùng default renderer
          if (onChunk) {
            onChunk(chunk, state);
          } else {
            const hasText = printStreamText(chunk, state);
            if (!hasText) printRawChunk(chunk, '[Raw]');
          }
        } catch (err) {
          process.stderr.write(`\n[Client] Lỗi xử lý message: ${err.message}\n`);
        }
      });

      ws.on('close', () => {
        clearTimeout(timer);
        if (inactivityTimer) clearTimeout(inactivityTimer);
        
        // Nếu có videoFbid nhưng chưa có videoUrl thật, tiếp tục chạy polling giải mã ở background
        if (state.videoFbid && !state.isVideoUrlResolved && pollingInterval) {
          console.log('[Client] WebSocket đã đóng, nhưng video vẫn đang render. Tiếp tục poll GraphQL ngầm...');
          return;
        }

        // Nếu là Extend Video (isExtendVideo flag) và chưa resolve được videoUrl
        // → bắt đầu poll GraphQL với FBID gốc + conversationId của session extend
        if (isExtendVideo && !state.isVideoUrlResolved && !pollingInterval) {
          const extFbid = inputMediaIds[0]; // FBID của video gốc (input Extend)
          const extConvId = state.conversationId;
          console.log(`[Client] [Extend] WS đóng, bắt đầu post-close poll GraphQL: FBID=${extFbid}, conv=${extConvId ? extConvId.substring(0, 8) + '...' : 'none'}`);

          const pollTimeout = setTimeout(() => {
            if (pollingInterval) {
              console.warn('[Client] [Extend] Timeout 120s — giải quyết với state hiện tại.');
              clearInterval(pollingInterval);
              pollingInterval = null;
              if (!state.videoUrl && !state.error) {
                state.error = 'Extend Video timeout: Meta AI không trả về video mới sau 120 giây.';
              }
              resolve(state);
            }
          }, 120000);

          const poll = async () => {
            try {
              const result = await resolveVideoStatus(extFbid, extConvId);
              if (result && result.videoUrl && result.videoUrl.startsWith('http')) {
                // Kiểm tra xem đây có phải URL mới (extended) không
                // bằng cách so sánh nếu khác với videoUrl từ video gốc
                if (!state.videoUrl || result.videoUrl !== state.videoUrl) {
                  state.videoUrl = result.videoUrl;
                  state.isVideoUrlResolved = true;
                  console.log(`[Client] [Extend GraphQL] Đã lấy được video CDN URL MỚI (extended)!`);
                  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
                  clearTimeout(pollTimeout);
                  console.log('[Client] [Extend] Giải quyết Promise thành công với video mới!');
                  resolve(state);
                }
              }
            } catch (err) {
              console.error(`[Client] [Extend] Lỗi poll GraphQL: ${err.message}`);
            }
          };

          poll();
          pollingInterval = setInterval(poll, 5000);
          return; // Không resolve ngay, đợi polling
        }

        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        
        // Nếu không có lỗi định nghĩa trước, nhưng cũng không lấy được mediaUrl
        if (!state.videoUrl && !state.error && !state.accumulatedText) {
          state.error = "Không nhận được hình ảnh/video từ Meta AI. Mô hình có thể đã từ chối yêu cầu hoặc chỉ trả về văn bản.";
        }

        resolve(state);
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        console.error(`[Client] WS Error: ${err.message}`);
        
        // Nếu đang poll GraphQL ngầm, không hủy cuộc chơi
        if (state.videoFbid && !state.isVideoUrlResolved && pollingInterval) {
          console.log('[Client] WS gặp lỗi, nhưng video vẫn đang render. Tiếp tục poll GraphQL ngầm...');
          return;
        }

        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        state.error = `Lỗi kết nối WebSocket: ${err.message}`;
        resolve(state);
      });
    });

  }
}

module.exports = { MetaAIClient };
