'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, errors) {
    super(message, 400);
    this.errors = errors;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class ExternalServiceError extends AppError {
  constructor(message, service) {
    super(message, 502);
    this.service = service;
  }
}

class NodeExecutionError extends AppError {
  constructor(nodeId, nodeType, message) {
    super(message, 500);
    this.nodeId = nodeId;
    this.nodeType = nodeType;
  }
}

module.exports = { AppError, ValidationError, NotFoundError, ExternalServiceError, NodeExecutionError };
