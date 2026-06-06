'use strict';

const { getProviderConfig } = require('../../settings.service');

/**
 * Model lists per provider (initial hardcode).
 */
const MODEL_LISTS = {
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  gemini:    ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022'],
  ollama:    ['llama3', 'mistral', 'codellama', 'phi3'],
};

/**
 * Builds provider-specific request and parses response.
 */
async function callProvider(provider, model, systemPrompt, userPrompt, temperature, maxTokens, config) {
  const { apiKey, baseUrl } = config;

  switch (provider) {
    case 'openai':
    case 'ollama': {
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: userPrompt });

      const url = `${baseUrl}/chat/completions`;
      const headers = {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`${provider} API error (${resp.status}): ${errText}`);
      }

      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || '';
      return { text, raw: data };
    }

    case 'gemini': {
      const contents = [];
      if (systemPrompt) {
        contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
        contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
      }
      contents.push({ role: 'user', parts: [{ text: userPrompt }] });

      const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini API error (${resp.status}): ${errText}`);
      }

      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { text, raw: data };
    }

    case 'anthropic': {
      const messages = [{ role: 'user', content: userPrompt }];

      const url = `${baseUrl}/v1/messages`;
      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };

      const body = {
        model,
        max_tokens: maxTokens,
        messages,
      };
      if (systemPrompt) body.system = systemPrompt;

      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Anthropic API error (${resp.status}): ${errText}`);
      }

      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      return { text, raw: data };
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Universal LLM handler.
 * Reads provider/model from node.data, merges upstream promptText with node prompt.
 */
async function handle(node, inputs, context) {
  const provider = node.data.provider || 'openai';
  const model = node.data.model || MODEL_LISTS[provider]?.[0] || 'gpt-4o';
  const systemPrompt = (node.data.systemPrompt || '').trim();
  const temperature = node.data.temperature ?? 0.7;
  const maxTokens = node.data.maxTokens ?? 2048;

  // Merge node prompt with upstream promptText
  const nodePrompt = (node.data.prompt || '').trim();
  const inputPrompt = (inputs.find(i => i.promptText)?.promptText || '').trim();
  const userPrompt = [nodePrompt, inputPrompt].filter(Boolean).join('\n\n') || 'Hello';

  // Get provider credentials from settings
  const config = await getProviderConfig(provider);
  if (!config) {
    throw new Error(`Provider "${provider}" is not configured. Go to Settings to add your API key.`);
  }
  if (!config.apiKey && provider !== 'ollama') {
    throw new Error(`No API key configured for "${provider}". Go to Settings to add your API key.`);
  }

  context.log(`  Calling ${provider}/${model} with prompt: "${userPrompt.slice(0, 100)}..."`);

  const result = await callProvider(provider, model, systemPrompt, userPrompt, temperature, maxTokens, config);

  context.log(`  ${provider} response: "${result.text.slice(0, 200)}..."`);

  return {
    text: result.text,
    promptText: result.text,
    sourceType: 'text',
    provider,
    model,
  };
}

module.exports = { handle, MODEL_LISTS };
