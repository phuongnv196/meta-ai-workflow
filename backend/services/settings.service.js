'use strict';

const { getDb } = require('../db');

const DEFAULT_SETTINGS = {
  providers: {
    openai:    { apiKey: '', baseUrl: 'https://api.openai.com/v1' },
    gemini:    { apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com' },
    anthropic: { apiKey: '', baseUrl: 'https://api.anthropic.com' },
    ollama:    { apiKey: '', baseUrl: 'http://localhost:11434' },
  }
};

/**
 * Masks an API key for safe frontend display.
 * Shows first 4 and last 4 chars: "sk-a...xyz"
 */
function maskApiKey(key) {
  if (!key || key.length < 10) return key ? '••••••••' : '';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Returns the full settings object (internal use only — keys are NOT masked).
 */
async function getSettingsRaw() {
  const db = await getDb();
  await db.read();
  if (!db.data.settings) {
    db.data.settings = { ...DEFAULT_SETTINGS };
    await db.write();
  }
  return db.data.settings;
}

/**
 * Returns settings with API keys masked (safe for frontend).
 */
async function getSettings() {
  const raw = await getSettingsRaw();
  const masked = { providers: {} };

  for (const [name, config] of Object.entries(raw.providers || {})) {
    masked.providers[name] = {
      ...config,
      apiKey: maskApiKey(config.apiKey),
      hasKey: !!(config.apiKey && config.apiKey.trim()),
    };
  }

  return masked;
}

/**
 * Partially updates settings. Only provided fields are changed.
 * API keys that look like masked values (contain '•' or '...') are skipped.
 */
async function updateSettings(updates) {
  const db = await getDb();
  await db.read();

  if (!db.data.settings) {
    db.data.settings = { ...DEFAULT_SETTINGS };
  }

  if (updates.providers) {
    for (const [name, config] of Object.entries(updates.providers)) {
      if (!db.data.settings.providers[name]) {
        db.data.settings.providers[name] = { apiKey: '', baseUrl: '' };
      }
      // Only update apiKey if it's a real new key (not masked)
      if (config.apiKey !== undefined && !config.apiKey.includes('•') && !config.apiKey.includes('...')) {
        db.data.settings.providers[name].apiKey = config.apiKey;
      }
      if (config.baseUrl !== undefined) {
        db.data.settings.providers[name].baseUrl = config.baseUrl;
      }
    }
  }

  await db.write();
  return getSettings(); // Return masked version
}

/**
 * Returns the raw provider config for a given provider name (for backend use).
 */
async function getProviderConfig(providerName) {
  const raw = await getSettingsRaw();
  return raw.providers?.[providerName] || null;
}

module.exports = { getSettings, updateSettings, getProviderConfig, getSettingsRaw };
