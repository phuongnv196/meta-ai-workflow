'use strict';

/**
 * HTTP Request node handler.
 * Supports GET, POST, PUT, DELETE with template variable substitution.
 */

function resolveTemplate(template, input) {
  if (!template) return template;
  return template.replace(/\{\{input\.(\w+)\}\}/g, (match, key) => {
    return input[key] !== undefined ? String(input[key]) : match;
  });
}

async function handle(node, inputs, context) {
  const input = inputs[0] || {};
  const method = (node.data.method || 'GET').toUpperCase();
  let url = resolveTemplate(node.data.url || '', input);
  let body = node.data.body ? resolveTemplate(node.data.body, input) : undefined;

  // Parse headers from key-value pairs
  const headers = {};
  if (node.data.headers && Array.isArray(node.data.headers)) {
    node.data.headers.forEach(h => {
      if (h.key && h.value) {
        headers[h.key] = resolveTemplate(h.value, input);
      }
    });
  }

  // Auto-set Content-Type for POST/PUT with body
  if ((method === 'POST' || method === 'PUT') && body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  context.log(`  HTTP ${method} ${url}`);

  const fetchOptions = {
    method,
    headers,
    signal: AbortSignal.timeout(30000),
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    fetchOptions.body = body;
  }

  const response = await fetch(url, fetchOptions);
  const responseText = await response.text();

  let responseBody;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = responseText;
  }

  context.log(`  HTTP Response: ${response.status} (${responseText.length} chars)`);

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody,
    text: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
    promptText: typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
  };
}

module.exports = { handle };
