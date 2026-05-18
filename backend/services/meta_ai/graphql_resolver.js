/**
 * meta_ai/graphql_resolver.js
 * Resolver truy vấn GraphQL của Meta AI để lấy URL CDN .mp4 thật của video từ fbid.
 */

'use strict';

const { META_COOKIE } = require('./config');

/**
 * Truy vấn GraphQL của Meta AI để giải mã FBID thành đường dẫn video .mp4 CDN thực tế.
 * 
 * @param {string} videoFbid - ID của video (ví dụ: 1084217054779625)
 * @returns {Promise<{videoUrl: string|null, thumbnailUrl: string|null}>}
 */
async function resolveVideoUrl(videoFbid) {
  if (!videoFbid) return { videoUrl: null, thumbnailUrl: null };

  const cookieStr = META_COOKIE;
  if (!cookieStr) {
    console.log('[GraphQL Resolver] META_COOKIE không được thiết lập. Bỏ qua giải mã video CDN URL.');
    return { videoUrl: null, thumbnailUrl: null };
  }

  console.log(`[GraphQL Resolver] Đang gửi yêu cầu giải mã video URL cho FBID: ${videoFbid}...`);

  try {
    const res = await fetch('https://meta.ai/api/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'multipart/mixed, application/json',
        'Cookie': cookieStr,
        'origin': 'https://meta.ai',
        'referer': 'https://meta.ai',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        doc_id: '344570a4b8110dd9848829731d35c74a',
        variables: {
          cardId: videoFbid,
          cardType: 'VIDEO_CARD'
        }
      })
    });

    if (!res.ok) {
      console.warn(`[GraphQL Resolver] Lỗi HTTP status: ${res.status}`);
      return { videoUrl: null, thumbnailUrl: null };
    }

    const text = await res.text();
    const data = JSON.parse(text);

    if (data.errors && data.errors.length > 0) {
      console.warn(`[GraphQL Resolver] Meta AI GraphQL trả về lỗi:`, data.errors[0].message);
      return { videoUrl: null, thumbnailUrl: null };
    }

    const media = data.data?.imagineCardMedia;
    if (media && media.videos && media.videos.length > 0) {
      const videoInfo = media.videos[0];
      const videoUrl = videoInfo.url || null;
      const thumbnailUrl = videoInfo.thumbnail || null;
      console.log(`[GraphQL Resolver] Giải mã thành công!`);
      console.log(`  - Video URL: ${videoUrl ? videoUrl.substring(0, 80) + '...' : 'null'}`);
      console.log(`  - Thumbnail: ${thumbnailUrl ? thumbnailUrl.substring(0, 80) + '...' : 'null'}`);
      return { videoUrl, thumbnailUrl };
    }

    console.warn(`[GraphQL Resolver] Không tìm thấy video trong kết quả GraphQL trả về.`);
    return { videoUrl: null, thumbnailUrl: null };
  } catch (err) {
    console.error(`[GraphQL Resolver] Lỗi kết nối GraphQL: ${err.message}`);
    return { videoUrl: null, thumbnailUrl: null };
  }
}

/**
 * Truy vấn trạng thái sinh video qua GraphQL status stream mới (doc_id: 9928a9b87ec492a16326f18925191c0f).
 * 
 * @param {string} mediaId - ID của media (ví dụ: 1084433011424696)
 * @returns {Promise<{videoUrl: string|null, thumbnailUrl: string|null, status: string}>}
 */
async function resolveVideoStatus(mediaId, conversationId) {
  if (!mediaId) return { videoUrl: null, thumbnailUrl: null, status: 'FAILED' };

  const cookieStr = META_COOKIE;
  if (!cookieStr) {
    console.log('[GraphQL Resolver] META_COOKIE không được thiết lập. Bỏ qua giải mã status stream.');
    return { videoUrl: null, thumbnailUrl: null, status: 'FAILED' };
  }

  const convId = conversationId || '';
  console.log(`[GraphQL Resolver] Đang mở status stream cho media ID: ${mediaId}${convId ? ' (conv: ' + convId.substring(0, 8) + '...)' : ''}...`);

  try {
    const res = await fetch('https://meta.ai/api/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'text/event-stream',
        'Cookie': cookieStr,
        'origin': 'https://meta.ai',
        'referer': `https://meta.ai/create/${mediaId}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        doc_id: '9928a9b87ec492a16326f18925191c0f',
        variables: {
          mediaIds: [mediaId],
          conversationId: convId
        }
      })
    });

    if (!res.ok) {
      console.warn(`[GraphQL Resolver] Lỗi HTTP status: ${res.status}`);
      return { videoUrl: null, thumbnailUrl: null, status: 'FAILED' };
    }

    let buffer = '';
    const decoder = new TextDecoder();

    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const result = parseStatusStreamBuffer(buffer);
        if (result && result.videoUrl) {
          return result;
        }
      }
    } else if (res.body && typeof res.body[Symbol.asyncIterator] === 'function') {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const result = parseStatusStreamBuffer(buffer);
        if (result && result.videoUrl) {
          return result;
        }
      }
    }

    const finalResult = parseStatusStreamBuffer(buffer);
    if (finalResult) return finalResult;

    return { videoUrl: null, thumbnailUrl: null, status: 'IN_PROGRESS' };
  } catch (err) {
    console.error(`[GraphQL Resolver] Lỗi kết nối GraphQL status stream: ${err.message}`);
    return { videoUrl: null, thumbnailUrl: null, status: 'FAILED' };
  }
}

/**
 * Trợ giúp phân tích buffer stream để tìm kết quả sinh video hoàn thành.
 * @private
 */
function parseStatusStreamBuffer(buffer) {
  const lines = buffer.split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const jsonStartIndex = line.indexOf('{');
    if (jsonStartIndex !== -1) {
      const jsonStr = line.substring(jsonStartIndex);
      try {
        const parsed = JSON.parse(jsonStr);
        const data = parsed.data || parsed;
        const streamData = data?.batchedGenerationStatusStream;
        if (streamData) {
          if (streamData.status === 'COMPLETED' || streamData.generatedVideo) {
            const videoObj = streamData.generatedVideo;
            if (videoObj) {
              let videoUrl = null;
              let thumbnailUrl = null;
              
              const findUrls = (obj) => {
                if (!obj) return;
                if (typeof obj === 'string') {
                  if (obj.startsWith('http') && obj.includes('.mp4')) {
                    videoUrl = obj;
                  } else if (obj.startsWith('http') && (obj.includes('.jpg') || obj.includes('.png') || obj.includes('fna'))) {
                    thumbnailUrl = obj;
                  }
                  return;
                }
                if (typeof obj === 'object') {
                  for (const key in obj) {
                    findUrls(obj[key]);
                  }
                }
              };
              
              findUrls(videoObj);
              if (videoUrl) {
                console.log(`[GraphQL Resolver] Lấy được Video URL từ status stream!`);
                console.log(`  - Video: ${videoUrl.substring(0, 80)}...`);
                return { videoUrl, thumbnailUrl, status: 'COMPLETED' };
              }
            }
          }
        }
      } catch (_) {
        // Line bị cắt hoặc không phải JSON, bỏ qua
      }
    }
  }
  return null;
}

module.exports = { resolveVideoUrl, resolveVideoStatus };
