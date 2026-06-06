'use strict';

/**
 * Condition (If/Else) node handler.
 * Evaluates a condition against the first input and returns branchId 'true' or 'false'.
 */

const OPERATORS = {
  equals:       (val, cmp) => String(val) === String(cmp),
  not_equals:   (val, cmp) => String(val) !== String(cmp),
  contains:     (val, cmp) => String(val).includes(String(cmp)),
  not_contains: (val, cmp) => !String(val).includes(String(cmp)),
  greater_than: (val, cmp) => Number(val) > Number(cmp),
  less_than:    (val, cmp) => Number(val) < Number(cmp),
  is_empty:     (val)      => !val || String(val).trim() === '',
  is_not_empty: (val)      => !!val && String(val).trim() !== '',
  is_truthy:    (val)      => !!val,
};

function getNestedValue(obj, fieldPath) {
  if (!fieldPath || !obj) return obj;
  const parts = fieldPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

async function handle(node, inputs, context) {
  const { field, operator, value } = node.data;
  const input = inputs[0] || {};

  // Get the value to check — if field is specified, extract it from input
  const actualValue = field ? getNestedValue(input, field) : (input.text || input.promptText || JSON.stringify(input));

  const op = OPERATORS[operator || 'is_truthy'];
  if (!op) {
    throw new Error(`Unknown condition operator: ${operator}`);
  }

  const conditionMet = op(actualValue, value);

  context.log(`  Condition: ${field || '(input)'} ${operator || 'is_truthy'} ${value || ''} → ${conditionMet}`);

  return {
    ...input,
    conditionMet,
    branchId: conditionMet ? 'true' : 'false',
  };
}

module.exports = { handle };
