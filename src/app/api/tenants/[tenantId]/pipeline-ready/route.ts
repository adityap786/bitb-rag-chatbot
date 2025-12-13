import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';
import { isPipelineReady } from '@/lib/trial/pipeline-readiness';

const supabase = createLazyServiceClient();
export const runtime = 'nodejs';

// Cache readiness for 3 seconds to reduce DB load during polling
const readinessCache = new Map<string, { ready: boolean; data: any; ts: number }>();
const CACHE_TTL_MS = 3000;

// Cleanup old cache entries periodically
const cacheCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of readinessCache.entries()) {
    if (now - value.ts > CACHE_TTL_MS * 2) {
      readinessCache.delete(key);
    }
  }
}, 10000);

// Avoid keeping the Node.js event loop alive (important for tests).
(cacheCleanupInterval as any)?.unref?.();

export async function GET(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  const startTime = Date.now();
  
  try {
    const { tenantId } = await context.params;

    // Verify token (fast, in-memory JWT verification)
    const token = verifyBearerToken(req);
    if (token.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fast path: check cache AFTER auth (still before any async DB operations)
    const cached = readinessCache.get(tenantId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { 'X-Cache': 'HIT', 'X-Response-Time': `${Date.now() - startTime}ms` }
      });
    }

    // REMOVED: setTenantContext - not needed with service role key (bypasses RLS)
    // The service role key has full access, RLS policies don't apply

    // Run tenant + latest job queries in parallel.
    // Avoid expensive embeddings COUNT(*) during polling when we can rely on ingestion_jobs.embeddings_count.
    const [tenantResult, jobResult] = await Promise.all([
      // Query 1: Tenant status (fast - single row by PK)
      supabase
        .from('tenants')
        .select('status, plan')
        .eq('tenant_id', tenantId)
        .single(),
      
      // Query 2: Latest job (fast - index on tenant_id + updated_at)
      supabase
        .from('ingestion_jobs')
        .select('job_id, status, updated_at, embeddings_count')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const { data: tenant, error: tenantError } = tenantResult;
    const { data: lastJob } = jobResult;
    let vectorCount = typeof lastJob?.embeddings_count === 'number' ? lastJob.embeddings_count : 0;
    // Fall back to exact count only if we don't have a job-derived count (legacy/edge cases).
    if (!lastJob || typeof lastJob.embeddings_count !== 'number') {
      const { count } = await supabase
        .from('embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
      vectorCount = count ?? 0;
    }

    if (tenantError || !tenant) {
      console.error('[pipeline-ready] Tenant not found:', { tenantId, error: tenantError?.message });
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const minVectors = Number(process.env.MIN_PIPELINE_VECTORS ?? '10'); // Require a few vectors before ready

    // Derive rag_status from tenant status and job info.
    // IMPORTANT: Only mark 'ready' when the same readiness threshold is satisfied,
    // otherwise callers can observe "ready" here but still be blocked by /api/ask.
    let ragStatus = tenant.status || 'pending';
    if (lastJob?.status === 'completed' && (vectorCount ?? 0) >= Math.max(minVectors, 0)) {
      ragStatus = 'ready';
    } else if (lastJob?.status === 'processing') {
      ragStatus = 'processing';
    } else if (lastJob?.status === 'failed') {
      ragStatus = 'failed';
    }
    const ready = isPipelineReady({
      ragStatus,
      lastJobStatus: lastJob?.status || null,
      vectorCount: vectorCount ?? 0,
      minVectors,
    });

    // Debug logging for stuck pipelines
    if (!ready) {
      console.log('[pipeline-ready] Not ready:', {
        tenantId,
        ragStatus,
        lastJobStatus: lastJob?.status,
        vectorCount,
        minVectors,
        lastJobUpdated: lastJob?.updated_at,
      });
    }

    const responseData = {
      ready,
      ragStatus,
      vectorCount: vectorCount ?? 0,
      minVectors,
      lastIngestion: lastJob ? {
        jobId: lastJob.job_id,
        status: lastJob.status,
        completedAt: lastJob.updated_at,
        embeddingsCount: lastJob.embeddings_count ?? null,
      } : null,
    };

    // Cache the result
    readinessCache.set(tenantId, { ready, data: responseData, ts: Date.now() });

    return NextResponse.json(responseData, {
      headers: { 'X-Cache': 'MISS', 'X-Response-Time': `${Date.now() - startTime}ms` }
    });

  } catch (error: any) {
    console.error('Pipeline readiness check failed:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.statusCode || error.status || 500 }
    );
  }
}
