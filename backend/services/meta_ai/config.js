const envConfig = require('../../config/env');

const AUTH_TOKEN = envConfig.metaAuthToken;
const META_COOKIE = envConfig.metaCookie;

const WS_URL =
  'wss://gateway.meta.ai/ws/clippy' +
  '?x-dgw-appid=152276385547a2543' +
  '&x-dgw-appversion=1.0.0' +
  '&x-dgw-authtype=15%3A0' +
  '&x-dgw-version=5' +
  '&x-dgw-uuid=0' +
  '&x-dgw-tier=prod' +
  '&Authorization=' + encodeURIComponent(AUTH_TOKEN) +
  '&x-dgw-app-origin=meta.ai';

const WS_HEADERS = {
  Origin: 'https://www.meta.ai',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const UPLOAD_BASE_URL = 'https://rupload.meta.ai/gen_ai_document_gen_ai_tenant';

module.exports = { AUTH_TOKEN, META_COOKIE, WS_URL, WS_HEADERS, UPLOAD_BASE_URL };