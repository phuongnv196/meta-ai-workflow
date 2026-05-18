'use strict';

/**
 * config/env.js
 * Validates and exports all environment variables at startup.
 * Fails fast if required variables are missing.
 */

const path = require('path');

// Load .env from backend directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const required = ['META_AUTH_TOKEN', 'META_COOKIE'];

const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`[Config] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[Config] Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3001,
  host: process.env.HOST || 'localhost',
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:5173'],
  metaAuthToken: process.env.META_AUTH_TOKEN,
  metaCookie: process.env.META_COOKIE,

  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  },
};

module.exports = config;
