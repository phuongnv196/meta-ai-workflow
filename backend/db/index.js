'use strict';

const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const defaultData = { workflows: [] };

let _db = null;

/**
 * Returns a singleton Lowdb instance.
 * Uses dynamic import() because lowdb v7 is ESM-only.
 */
async function getDb() {
  if (_db) return _db;

  const { JSONFilePreset } = await import('lowdb/node');
  _db = await JSONFilePreset(DB_PATH, defaultData);

  return _db;
}

module.exports = { getDb };
