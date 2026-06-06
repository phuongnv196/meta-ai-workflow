'use strict';

/**
 * Text Transform node handler.
 * Supports multiple operations: template, regex, uppercase, lowercase, trim, split, join.
 */

async function handle(node, inputs, context) {
  const operation = node.data.operation || 'template';
  const input = inputs[0] || {};
  const inputText = input.text || input.promptText || '';

  let result = '';

  switch (operation) {
    case 'template': {
      // Replace {{input1}}, {{input2}} etc. with input values
      let template = node.data.template || '';
      inputs.forEach((inp, i) => {
        const text = inp.text || inp.promptText || '';
        template = template.replace(new RegExp(`\\{\\{input${i + 1}\\}\\}`, 'g'), text);
      });
      // Also support {{input.field}} syntax
      template = template.replace(/\{\{input\.(\w+)\}\}/g, (match, key) => {
        return input[key] !== undefined ? String(input[key]) : match;
      });
      result = template;
      break;
    }
    case 'regex': {
      const pattern = node.data.pattern || '';
      const replacement = node.data.replacement || '';
      const flags = node.data.flags || 'g';
      try {
        const regex = new RegExp(pattern, flags);
        result = inputText.replace(regex, replacement);
      } catch (e) {
        throw new Error(`Invalid regex pattern "${pattern}": ${e.message}`);
      }
      break;
    }
    case 'uppercase':
      result = inputText.toUpperCase();
      break;
    case 'lowercase':
      result = inputText.toLowerCase();
      break;
    case 'trim':
      result = inputText.trim();
      break;
    case 'split': {
      const delimiter = node.data.delimiter || '\n';
      const items = inputText.split(delimiter);
      context.log(`  Split into ${items.length} parts`);
      return { text: JSON.stringify(items), promptText: JSON.stringify(items), items };
    }
    case 'join': {
      const joinDelimiter = node.data.delimiter || '\n';
      const arr = input.items || [];
      result = Array.isArray(arr) ? arr.join(joinDelimiter) : String(arr);
      break;
    }
    default:
      result = inputText;
  }

  context.log(`  Text transform [${operation}]: "${result.slice(0, 100)}"`);

  return { text: result, promptText: result };
}

module.exports = { handle };
