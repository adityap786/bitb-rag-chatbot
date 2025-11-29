// Security & Multi-Tenancy Middleware
// Product-grade scaffolding for tenant isolation, input validation, rate limiting, and audit logging

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { logger } from '../lib/observability/logger.js';

// 1. Tenant Isolation Middleware
export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.headers['x-tenant-id'] || req.body?.tenant_id || req.query?.tenant_id;
  if (!tenantId) {
    logger.warn('Missing tenant_id in request');
    return res.status(400).json({ error: 'Missing tenant_id' });
  }
  // Attach to request for downstream use
  (req as any).tenantId = tenantId;
  next();
}

// 2. Input Validation Middleware (example schema)
export function validateInput(schema: z.ZodSchema<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
      logger.warn('Input validation failed', { issues });
      return res.status(422).json({ error: 'Invalid input', details: issues });
    }
    next();
  };
}

// 3. Rate Limiting Middleware (per tenant)
export function tenantRateLimiter(options: { windowMs: number; max: number }) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    keyGenerator: (req) => (req as any).tenantId || req.ip,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', { tenantId: (req as any).tenantId });
      res.status(429).json({ error: 'Rate limit exceeded' });
    },
  });
}

// 4. Audit Logging Middleware
export function auditLogger(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      logger.info('Audit log', {
        action,
        tenantId: (req as any).tenantId,
        userId: req.headers['x-user-id'],
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        timestamp: new Date().toISOString(),
      });
    });
    next();
  };
}
