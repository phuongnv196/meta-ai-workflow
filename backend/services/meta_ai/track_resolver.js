/**
 * meta_ai/track_resolver.js
 * Giải mã thông tin Track (audio/video track) của Meta AI từ ID sử dụng Next.js Server Action.
 */

'use strict';

const { META_COOKIE } = require('./config');

/**
 * Lấy thông tin track (bao gồm audioUrl, largeImageUrl, title, artist,...) từ danh sách track ID.
 * 
 * @param {string|string[]} trackIds - Một ID đơn lẻ hoặc mảng các track ID (ví dụ: "609632436429286")
 * @param {object} [options] - Cấu hình tùy chọn
 * @param {string} [options.cookie] - Cookie đăng nhập (mặc định lấy từ config/env)
 * @param {string} [options.nextAction] - Next-Action hash (mặc định '40515f97f4773b647b8da190bdd6471f22cec5da94')
 * @returns {Promise<Array<{id: string, title: string, artist: string, thumbnailUrl: string, largeImageUrl: string, durationMs: number, audioUrl: string, highlightStartTimeMs: number}>>}
 */
async function resolveTrackInfo(trackIds, options = {}) {
  const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
  if (ids.length === 0) return [];

  const cookieStr = options.cookie || META_COOKIE;
  if (!cookieStr) {
    console.log('[Track Resolver] META_COOKIE không được thiết lập. Bỏ qua yêu cầu lấy thông tin track.');
    return [];
  }

  const nextAction = options.nextAction || '40515f97f4773b647b8da190bdd6471f22cec5da94';

  console.log(`[Track Resolver] Đang lấy thông tin cho ${ids.length} track(s): [${ids.join(', ')}]...`);

  // Xây dựng request body (Next.js Server Action nhận JSON stringified)
  const rawBody = JSON.stringify([{
    searchText: null,
    savedIds: ids,
    recommendationPrompt: 'trending'
  }]);

  try {
    const res = await fetch('https://meta.ai/create', {
      method: 'POST',
      headers: {
        'accept': 'text/x-component',
        'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
        'cache-control': 'no-cache',
        'content-type': 'text/plain;charset=UTF-8',
        'next-action': nextAction,
        'next-router-state-tree': '%5B%22%22%2C%7B%22children%22%3A%5B%22create%22%2C%7B%22children%22%3A%5B%5B%22id%22%2C%221084419128092751%22%2C%22d%22%2Cnull%5D%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C4%5D%2C%22devtools%22%3A%5B%22__DEFAULT__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%2C%22modal%22%3A%5B%22__DEFAULT__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%2C%22sidebar%22%3A%5B%22__DEFAULT__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C24%5D',
        'origin': 'https://meta.ai',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://meta.ai/create/1084419128092751',
        'sec-ch-prefers-color-scheme': 'light',
        'sec-ch-ua': '"Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0',
        'Cookie': cookieStr
      },
      body: rawBody
    });

    if (!res.ok) {
      console.warn(`[Track Resolver] Lỗi HTTP status: ${res.status}`);
      return [];
    }

    const text = await res.text();
    const tracks = parseTracksFromRscStream(text);
    console.log(`[Track Resolver] Đã lấy thành công ${tracks.length} track(s).`);
    return tracks;
  } catch (err) {
    console.error(`[Track Resolver] Lỗi khi gửi request: ${err.message}`);
    return [];
  }
}

/**
 * Trích xuất danh sách tracks từ response text của Next.js Server Action stream (x-component).
 * 
 * @param {string} responseText - Nội dung response dạng text/x-component
 * @returns {Array<object>} Danh sách tracks tìm thấy
 */
function parseTracksFromRscStream(responseText) {
  if (!responseText) return [];
  
  // Cách 1: Parse dòng theo dòng của Next.js Server Action Stream
  const lines = responseText.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const dataStr = line.slice(colonIndex + 1).trim();
      try {
        const data = JSON.parse(dataStr);
        if (data && data.success && Array.isArray(data.tracks)) {
          return data.tracks;
        }
      } catch (e) {
        // Bỏ qua dòng không parse được JSON
      }
    }
  }

  // Cách 2: Regex fallback nếu stream bị gộp dòng hoặc không tách dòng chuẩn
  try {
    const match = responseText.match(/\{"success"\s*:\s*true\s*,\s*"tracks"\s*:\s*\[[\s\S]*?\]\}/);
    if (match) {
      const data = JSON.parse(match[0]);
      if (data && data.tracks) {
        return data.tracks;
      }
    }
  } catch (e) {
    // Bỏ qua lỗi
  }

  return [];
}

module.exports = { resolveTrackInfo };
