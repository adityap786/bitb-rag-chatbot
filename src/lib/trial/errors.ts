/**
 * Custom error types for trial system
 */

export class TrialError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'TrialError';
  }
}

export class ValidationError extends TrialError {
  constructor(message: string, details?: Record<string, any>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends TrialError {
  constructor(message: string = 'Authentication failed') {
    super('AUTH_ERROR', message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends TrialError {
  constructor(message: string = 'Insufficient permissions') {
    super('AUTHZ_ERROR', message, 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends TrialError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends TrialError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends TrialError {
  constructor(retryAfter: number = 60) {
    super('RATE_LIMIT', 'Too many requests', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class InternalError extends TrialError {
  constructor(message: string = 'Internal server error', originalError?: Error) {
    super('INTERNAL_ERROR', message, 500, { originalMessage: originalError?.message });
    this.name = 'InternalError';
  }
}

export class ExternalServiceError extends TrialError {
  constructor(service: string, message: string) {
    super('EXTERNAL_SERVICE_ERROR', `${service} error: ${message}`, 502, { service });
    this.name = 'ExternalServiceError';
  }
}
