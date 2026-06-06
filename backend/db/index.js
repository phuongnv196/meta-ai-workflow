'use strict';

const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const defaultData = {
  workflows: [],
  customNodes: [],
  settings: {
    providers: {
      openai:    { apiKey: '', baseUrl: 'https://api.openai.com/v1' },
      gemini:    { apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com' },
      anthropic: { apiKey: '', baseUrl: 'https://api.anthropic.com' },
      ollama:    { apiKey: '', baseUrl: 'http://localhost:11434' },
    }
  }
};

let _db = null;

/**
 * Returns a singleton Lowdb instance.
 * Uses dynamic import() because lowdb v7 is ESM-only.
 */
async function getDb() {
  if (_db) return _db;

  const fs = require('fs');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const { JSONFilePreset } = await import('lowdb/node');
  _db = await JSONFilePreset(DB_PATH, defaultData);

  return _db;
}

module.exports = { getDb };
