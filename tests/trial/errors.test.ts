import { describe, it, expect } from 'vitest';
import {
  TrialError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  ExternalServiceError,
} from '../../src/lib/trial/errors';

describe('trial/errors', () => {
  it('constructs subclasses with expected properties', () => {
    const ve = new ValidationError('bad input', { foo: 'bar' });
    expect(ve).toBeInstanceOf(ValidationError);
    expect(ve.name).toBe('ValidationError');
    expect(ve.code).toBe('VALIDATION_ERROR');
    expect(ve.statusCode).toBe(400);
    expect(ve.details).toEqual({ foo: 'bar' });

    const ae = new AuthenticationError();
    expect(ae.code).toBe('AUTH_ERROR');
    expect(ae.statusCode).toBe(401);

    const az = new AuthorizationError('no');
    expect(az.code).toBe('AUTHZ_ERROR');
    expect(az.statusCode).toBe(403);

    const nf = new NotFoundError('resource');
    expect(nf.code).toBe('NOT_FOUND');
    expect(nf.message).toContain('resource not found');

    const c = new ConflictError('conflict happened');
    expect(c.code).toBe('CONFLICT');

    const rl = new RateLimitError(30);
    expect(rl.code).toBe('RATE_LIMIT');
    expect(rl.details?.retryAfter).toBe(30);

    const ie = new InternalError('oops', new Error('orig'));
    expect(ie.code).toBe('INTERNAL_ERROR');
    expect(ie.details?.originalMessage).toBe('orig');

    const es = new ExternalServiceError('SVC', 'bad');
    expect(es.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(es.message).toContain('SVC error');
  });
});
