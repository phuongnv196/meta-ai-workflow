'use strict';

/**
 * Reference placeholder templating for generator prompts.
 *
 * Users can write `{{reference_01}}` (or any node refName) inside a node prompt.
 * Before the prompt is sent to a generator, each placeholder is replaced with the
 * real upstream upload identifier, resolved per target platform:
 *   - stitch → screenId
 *   - meta   → mediaId / attachment fbid
 *   - vibes  → mediaId
 *   - gemini → no stable id; falls back to a positional phrase ("the Nth reference image")
 *
 * The refName → nodeId mapping comes from the workflow's globalRefMap
 * (node.data.refName, or auto-assigned reference_01, reference_02, ...).
 */

const PLACEHOLDER_RE = /\{\{\s*([\w-]+)\s*\}\}/g;

/**
 * Extract the platform-native reference id from a node result.
 * @param {Object} result - results[nodeId]
 * @param {string} platform - 'stitch' | 'meta' | 'vibes' | 'gemini'
 * @returns {string}
 */
function extractRefId(result, platform) {
  if (!result) return '';
  switch (platform) {
    case 'stitch':
      return result.screenId || '';
    case 'meta':
      return (
        result.mediaId ||
        (result.attachments && result.attachments[0] && result.attachments[0].id) ||
        result.mediaEntId ||
        ''
      );
    case 'vibes':
      return result.mediaId || result.mediaEntId || '';
    default:
      return (
        result.screenId ||
        result.mediaId ||
        (result.attachments && result.attachments[0] && result.attachments[0].id) ||
        ''
      );
  }
}

/**
 * Ordinal helper: 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th"...
 */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Replace `{{refName}}` placeholders in a prompt with platform-native ids.
 *
 * @param {string} prompt
 * @param {Object} opts
 * @param {Object} opts.globalRefMap - nodeId → refName
 * @param {Object} opts.results      - nodeId → result object
 * @param {string} opts.platform     - target platform
 * @param {string[]} [opts.orderedRefNames] - ordered list of refNames actually attached
 *        (used to compute the positional fallback index for platforms without ids)
 * @returns {{ prompt: string, replacements: Array<{name:string, value:string}>, unresolved: string[] }}
 */
function resolveReferencePlaceholders(prompt, opts = {}) {
  const { globalRefMap = {}, results = {}, platform = 'default', orderedRefNames = [] } = opts;

  if (!prompt || !prompt.includes('{{')) {
    return { prompt: prompt || '', replacements: [], unresolved: [] };
  }

  // Invert globalRefMap: refName → nodeId
  const nameToNode = {};
  for (const [nodeId, refName] of Object.entries(globalRefMap)) {
    nameToNode[refName] = nodeId;
  }

  const replacements = [];
  const unresolved = [];

  const out = prompt.replace(PLACEHOLDER_RE, (match, rawName) => {
    const name = rawName.trim();
    const nodeId = nameToNode[name];
    const id = nodeId ? extractRefId(results[nodeId], platform) : '';

    if (id) {
      replacements.push({ name, value: id });
      return id;
    }

    // Positional fallback (e.g. Gemini, or id not yet available)
    const posIdx = orderedRefNames.indexOf(name);
    if (posIdx !== -1) {
      const phrase = `the ${ordinal(posIdx + 1)} reference image`;
      replacements.push({ name, value: phrase });
      return phrase;
    }

    unresolved.push(name);
    return match; // leave the placeholder untouched if we cannot resolve it
  });

  return { prompt: out, replacements, unresolved };
}

module.exports = { resolveReferencePlaceholders, extractRefId };
