'use strict';

const { ValidationError } = require('../utils/errors');

/**
 * Lightweight request body validation middleware.
 * Accepts a validator function: (body) => { valid: boolean, errors?: string[] }
 */
function validate(validatorFn) {
  return (req, _res, next) => {
    const result = validatorFn(req.body);
    if (!result.valid) {
      return next(new ValidationError('Validation failed', result.errors));
    }
    next();
  };
}

/**
 * Validator for the /execute endpoint.
 */
function validateExecutePayload(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }
  if (!Array.isArray(body.nodes) || body.nodes.length === 0) {
    errors.push('nodes must be a non-empty array');
  }
  if (!Array.isArray(body.edges)) {
    errors.push('edges must be an array');
  }
  if (body.nodes) {
    for (const node of body.nodes) {
      if (!node.id || !node.type) {
        errors.push(`Each node must have "id" and "type" fields`);
        break;
      }
    }
  }
  if (body.targetNodeId && typeof body.targetNodeId !== 'string') {
    errors.push('targetNodeId must be a string if provided');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validator for the /upload endpoint.
 */
function validateUploadPayload(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }
  if (!body.base64Data || typeof body.base64Data !== 'string') {
    errors.push('base64Data is required and must be a string');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validate, validateExecutePayload, validateUploadPayload };
