'use strict';

const { AppError } = require('../utils/errors');
const { log } = require('../utils/logger');

/**
 * Global error handler middleware.
 * Returns consistent JSON error responses and hides internals in production.
 */
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    log(`[${err.statusCode}] ${err.message}`);
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.errors ? { details: err.errors } : {}),
    });
  }

  // Unexpected errors
  log(`Unhandled error: ${err.message}\n${err.stack}`);

  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  res.status(500).json({ success: false, error: message });
}

/**
 * Wraps async route handlers to automatically catch and forward errors.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };
