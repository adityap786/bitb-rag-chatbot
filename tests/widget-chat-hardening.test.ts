
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Hoist the mock object so it can be used in vi.mock
const { mockSupabase } = vi.hoisted(() => {
  return {
    mockSupabase: {
      from: vi.fn(),
    }
  };
});

// Mock dependencies
vi.mock('@/lib/supabase-client', () => ({
  createLazyServiceClient: vi.fn(() => mockSupabase),
}));

import { POST } from '@/app/api/widget/chat/route';
import { verifyToken } from '@/lib/trial/auth';

vi.mock('@/lib/trial/auth', () => ({
  verifyToken: vi.fn(),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock('@/lib/trial/usage-tracker', () => ({
  trackUsage: vi.fn().mockReturnValue({
    recordRateLimit: vi.fn(),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
  }),
}));

vi.mock('../../../../middleware/tenant-rate-limit', () => ({
  checkTenantRateLimit: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/monitoring', () => ({
  recordApiCall: vi.fn(),
  incrementMetric: vi.fn(),
  observeLatency: vi.fn(),
}));

vi.mock('@/lib/monitoring/metrics', () => ({
  recordChatApiMetrics: vi.fn(),
}));

describe('Widget Chat Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if token is invalid', async () => {
    (verifyToken as any).mockImplementation(() => {
      throw new Error('Invalid token');
    });

    const req = new NextRequest('http://localhost/api/widget/chat', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer invalid-token',
      },
      body: JSON.stringify({
        sessionId: 'session-123',
        message: 'Hello',
      }),
    });

    // Mock session lookup to return a tenantId
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { tenant_id: 'tn_123' } }),
        }),
      }),
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized: Invalid or expired token');
  });

  it('should return 403 if trial is expired', async () => {
    // Mock valid token (optional, or no token)
    // Let's test without token first, relying on session
    const req = new NextRequest('http://localhost/api/widget/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'session-123',
        message: 'Hello',
      }),
    });

    // Mock session lookup
    const selectMock = vi.fn();
    const eqMock = vi.fn();
    const singleMock = vi.fn();
    
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'chat_sessions') {
        return {
          select: selectMock.mockReturnValue({
            eq: eqMock.mockReturnValue({
              single: singleMock.mockResolvedValue({ data: { tenant_id: 'tn_123' } }),
            }),
          }),
        };
      }
      if (table === 'trial_tenants') {
        return {
          select: selectMock.mockReturnValue({
            eq: eqMock.mockReturnValue({
              single: singleMock.mockResolvedValue({ 
                data: { 
                  status: 'active', 
                  trial_expires_at: new Date(Date.now() - 86400000).toISOString() // Expired yesterday
                } 
              }),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Trial has expired');
  });

  it('should return 403 if trial is inactive', async () => {
    const req = new NextRequest('http://localhost/api/widget/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'session-123',
        message: 'Hello',
      }),
    });

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'chat_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { tenant_id: 'tn_123' } }),
            }),
          }),
        };
      }
      if (table === 'trial_tenants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ 
                data: { 
                  status: 'expired', 
                  trial_expires_at: new Date(Date.now() + 86400000).toISOString() // Future date but status expired
                } 
              }),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Trial is not active');
  });
});
