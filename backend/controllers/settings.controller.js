'use strict';

const settingsService = require('../services/settings.service');
const { asyncHandler } = require('../middleware/error-handler');
const { ValidationError } = require('../utils/errors');

/**
 * GET /settings — Returns settings with masked API keys.
 */
const getSettings = asyncHandler(async (_req, res) => {
  const settings = await settingsService.getSettings();
  res.json({ success: true, settings });
});

/**
 * PUT /settings — Partially updates settings.
 */
const updateSettings = asyncHandler(async (req, res) => {
  const updates = req.body;

  if (!updates || typeof updates !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }

  const settings = await settingsService.updateSettings(updates);
  res.json({ success: true, settings });
});

/**
 * POST /settings/test/:provider — Tests connectivity for a provider.
 */
const testProvider = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const config = await settingsService.getProviderConfig(provider);

  if (!config) {
    throw new ValidationError(`Unknown provider: ${provider}`);
  }

  if (!config.apiKey) {
    return res.json({ success: false, error: 'No API key configured' });
  }

  try {
    let testResult = { ok: false, message: '' };

    switch (provider) {
      case 'openai':
      case 'ollama': {
        const url = `${config.baseUrl}/models`;
        const headers = config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {};
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        testResult.ok = resp.ok;
        testResult.message = resp.ok ? 'Connected successfully' : `HTTP ${resp.status}`;
        break;
      }
      case 'gemini': {
        const url = `${config.baseUrl}/v1beta/models?key=${config.apiKey}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        testResult.ok = resp.ok;
        testResult.message = resp.ok ? 'Connected successfully' : `HTTP ${resp.status}`;
        break;
      }
      case 'anthropic': {
        const url = `${config.baseUrl}/v1/messages`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }],
          }),
          signal: AbortSignal.timeout(10000),
        });
        // 200 or 400 (bad request but auth ok) both mean connection works
        testResult.ok = resp.status < 500;
        testResult.message = testResult.ok ? 'Connected successfully' : `HTTP ${resp.status}`;
        break;
      }
      default:
        testResult.message = 'Test not implemented for this provider';
    }

    res.json({ success: testResult.ok, message: testResult.message });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

module.exports = { getSettings, updateSettings, testProvider };
