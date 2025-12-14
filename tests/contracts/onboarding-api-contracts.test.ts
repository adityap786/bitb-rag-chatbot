import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.MIN_PIPELINE_VECTORS = '10';

const { mockSupabase } = vi.hoisted(() => {
  return {
    mockSupabase: {
      from: vi.fn(),
    },
  };
});

vi.mock('@/lib/supabase-client', () => ({
  createLazyServiceClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/trial/auth', () => ({
  verifyBearerToken: vi.fn(),
}));

vi.mock('@/lib/trial/start-pipeline', () => ({
  startTenantPipeline: vi.fn(),
}));

vi.mock('@/lib/trial/logger', () => ({
  default: {
    logAuth: vi.fn(),
    logRequest: vi.fn(),
    logModification: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/trial/tool-assignment', () => ({
  analyzeKnowledgeBase: vi.fn(() => ({ summary: 'ok' })),
  assignTools: vi.fn(() => ['faq']),
  generatePromptTemplate: vi.fn(() => 'template'),
}));

import { verifyBearerToken } from '@/lib/trial/auth';
import { startTenantPipeline } from '@/lib/trial/start-pipeline';

import { POST as ingestPOST } from '@/app/api/tenants/[tenantId]/ingest/route';
import { GET as pipelineReadyGET } from '@/app/api/tenants/[tenantId]/pipeline-ready/route';
import { POST as generateWidgetPOST } from '@/app/api/trial/generate-widget/route';
import { POST as brandingPOST } from '@/app/api/trial/branding/route';

describe('Onboarding API contracts (unit/route)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/tenants/:tenantId/ingest returns 403 on tenant mismatch', async () => {
    (verifyBearerToken as any).mockReturnValue({ tenantId: 'tn_token' });

    const req = new NextRequest('http://localhost/api/tenants/tn_path/ingest', {
      method: 'POST',
      body: JSON.stringify({ source: 'manual' }),
      headers: { Authorization: 'Bearer test' },
    });

    const res = await ingestPOST(req, { params: Promise.resolve({ tenantId: 'tn_path' }) });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized tenant' });
  });

  it('POST /api/tenants/:tenantId/ingest returns 409 with runId when a job is already processing', async () => {
    (verifyBearerToken as any).mockReturnValue({ tenantId: 'tn_123' });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'tenants') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(async () => ({ data: { status: 'active' }, error: null })),
        };
        return chain;
      }

      if (table === 'ingestion_jobs') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: { job_id: 'job_abc', status: 'processing', started_at: '2025-01-01T00:00:00.000Z' },
            error: null,
          })),
        };
        return chain;
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const req = new NextRequest('http://localhost/api/tenants/tn_123/ingest', {
      method: 'POST',
      body: JSON.stringify({ source: 'manual' }),
      headers: { Authorization: 'Bearer test' },
    });

    const res = await ingestPOST(req, { params: Promise.resolve({ tenantId: 'tn_123' }) });
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.status).toBe('processing');
    expect(body.runId).toBe('job_abc');
    expect(body.source).toBe('manual');
  });

  it('POST /api/trial/generate-widget returns 202 + jobId when pipeline not ready', async () => {
    (verifyBearerToken as any).mockReturnValue({ tenantId: 'tn_123' });
    (startTenantPipeline as any).mockResolvedValue({ status: 'processing', jobId: 'job_new', startedAt: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'tenants') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(async () => ({ data: { status: 'active' }, error: null })),
        };
        return chain;
      }

      if (table === 'widget_configs') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(async () => ({
            data: {
              primary_color: '#111111',
              secondary_color: '#222222',
              welcome_message: 'Hello',
              assigned_tools: [],
            },
            error: null,
          })),
        };
        return chain;
      }

      if (table === 'ingestion_jobs') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({ data: { job_id: 'job_old', status: 'completed', started_at: null }, error: null })),
        };
        return chain;
      }

      if (table === 'embeddings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ count: 0, error: null })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const req = new NextRequest('http://localhost/api/trial/generate-widget', {
      method: 'POST',
      headers: { Authorization: 'Bearer test' },
      body: JSON.stringify({}),
    });

    const res = await generateWidgetPOST(req as any, { params: Promise.resolve({}) });
    expect(res.status).toBe(202);

    const json = await res.json();
    expect(json.status).toBe('processing');
    expect(json.tenantId).toBe('tn_123');
    expect(json.jobId).toBe('job_new');
  });

  it('POST /api/trial/generate-widget returns 200 + embedCode when pipeline ready', async () => {
    (verifyBearerToken as any).mockReturnValue({ tenantId: 'tn_123' });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'tenants') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(async () => ({ data: { status: 'active' }, error: null })),
        };
        return chain;
      }

      if (table === 'widget_configs') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(async () => ({
            data: {
              primary_color: '#111111',
              secondary_color: '#222222',
              welcome_message: 'Hello',
              assigned_tools: ['faq'],
            },
            error: null,
          })),
        };
        return chain;
      }

      if (table === 'ingestion_jobs') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: { job_id: 'job_old', status: 'completed', embeddings_count: 12, started_at: null, updated_at: '2025-01-01T00:00:00.000Z' },
            error: null,
          })),
        };
        return chain;
      }

      if (table === 'embeddings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ count: 12, error: null })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const req = new NextRequest('http://localhost/api/trial/generate-widget', {
      method: 'POST',
      headers: { Authorization: 'Bearer test' },
      body: JSON.stringify({}),
    });

    const res = await generateWidgetPOST(req as any, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.embedCode).toContain('data-tenant-id="tn_123"');
    expect(json.embedCode).toContain('data-primary-color="#111111"');
    expect(json.embedCode).toContain('data-secondary-color="#222222"');
    expect(json.assignedTools).toEqual(['faq']);
  });

  it('GET /api/tenants/:tenantId/pipeline-ready returns 403 on tenant mismatch', async () => {
    (verifyBearerToken as any).mockReturnValue({ tenantId: 'tn_token' });

    const req = new NextRequest('http://localhost/api/tenants/tn_path/pipeline-ready', {
      method: 'GET',
      headers: { Authorization: 'Bearer test' },
    });

    const res = await pipelineReadyGET(req, { params: Promise.resolve({ tenantId: 'tn_path' }) });
    expect(res.status).toBe(403);
  });

  it('POST /api/trial/branding returns pipeline block', async () => {
    (verifyBearerToken as any).mockReturnValue({ tenantId: 'tn_123' });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'tenants') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          single: vi.fn(async () => ({ data: { industry_vertical: 'ecommerce', status: 'active' }, error: null })),
        };
        return chain;
      }

      if (table === 'knowledge_base') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [{ raw_text: 'doc1' }], error: null })),
          })),
        };
      }

      if (table === 'widget_configs') {
        // Simulate existing config, then update path
        const chainExisting: any = {
          select: vi.fn(() => chainExisting),
          eq: vi.fn(() => chainExisting),
          single: vi.fn(async () => ({ data: { config_id: 'cfg_1' }, error: null })),
        };

        const chainUpdate: any = {
          update: vi.fn(() => chainUpdate),
          eq: vi.fn(() => chainUpdate),
          select: vi.fn(() => chainUpdate),
          single: vi.fn(async () => ({
            data: {
              config_id: 'cfg_1',
              primary_color: '#111111',
              secondary_color: '#222222',
              chat_tone: 'friendly',
              welcome_message: 'Hello! How can I help you today?',
              assigned_tools: ['faq'],
              avatar_url: null,
            },
            error: null,
          })),
        };

        // Branding route calls select('config_id').single() first, then update()...
        const fromImpl: any = {
          select: chainExisting.select,
          eq: chainExisting.eq,
          single: chainExisting.single,
          update: chainUpdate.update,
          insert: vi.fn(() => chainUpdate),
        };

        return fromImpl;
      }

      if (table === 'ingestion_jobs') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => ({
            data: {
              job_id: 'job_abc',
              status: 'processing',
              started_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-01T00:00:01.000Z',
              embeddings_count: 0,
            },
            error: null,
          })),
        };
        return chain;
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const req = new NextRequest('http://localhost/api/trial/branding', {
      method: 'POST',
      headers: { Authorization: 'Bearer test' },
      body: JSON.stringify({
        primaryColor: '#111111',
        secondaryColor: '#222222',
        tone: 'friendly',
      }),
    });

    const res = await brandingPOST(req as any, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.pipeline).toEqual({
      status: 'processing',
      jobId: 'job_abc',
      startedAt: '2025-01-01T00:00:00.000Z',
    });
  });
});
