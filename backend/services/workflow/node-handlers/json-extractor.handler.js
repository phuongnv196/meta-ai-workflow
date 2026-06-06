'use strict';

/**
 * JSON Extractor node handler.
 * Extracts a value from JSON input using a dot-notation path (e.g. "data.items[0].url").
 */

function extractByPath(obj, pathStr) {
  if (!pathStr || !obj) return obj;

  // Support bracket notation like items[0] by converting to dot notation
  const normalizedPath = pathStr.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalizedPath.split('.');

  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

async function handle(node, inputs, context) {
  const input = inputs[0] || {};
  const jsonPath = node.data.path || '';

  // Get source text — try text, promptText, body, or the whole input
  let sourceText = input.text || input.promptText || input.body;
  
  let sourceObj;
  if (typeof sourceText === 'string') {
    try {
      sourceObj = JSON.parse(sourceText);
    } catch {
      // If it's not valid JSON, just use it as-is
      context.log(`  Warning: Input is not valid JSON, using as plain text.`);
      sourceObj = { text: sourceText };
    }
  } else if (typeof sourceText === 'object') {
    sourceObj = sourceText;
  } else {
    sourceObj = input;
  }

  const extracted = extractByPath(sourceObj, jsonPath);
  const extractedStr = typeof extracted === 'object' ? JSON.stringify(extracted) : String(extracted ?? '');

  context.log(`  Extracted path "${jsonPath}" → "${extractedStr.slice(0, 100)}"`);

  return {
    text: extractedStr,
    promptText: extractedStr,
    extracted,
  };
}

module.exports = { handle };
