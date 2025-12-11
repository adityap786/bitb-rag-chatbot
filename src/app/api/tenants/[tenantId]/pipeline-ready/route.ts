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
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of readinessCache.entries()) {
    if (now - value.ts > CACHE_TTL_MS * 2) {
      readinessCache.delete(key);
    }
  }
}, 10000);

export async function GET(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  const startTime = Date.now();
  
  try {
    // Fast path: check cache BEFORE any async operations
    const { tenantId } = await context.params;
    const cached = readinessCache.get(tenantId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { 'X-Cache': 'HIT', 'X-Response-Time': `${Date.now() - startTime}ms` }
      });
    }

    // Verify token (fast, in-memory JWT verification)
    const token = verifyBearerToken(req);
    if (token.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // REMOVED: setTenantContext - not needed with service role key (bypasses RLS)
    // The service role key has full access, RLS policies don't apply

    // Run all 3 queries in parallel - this is the main latency
    const [tenantResult, jobResult, vectorResult] = await Promise.all([
      // Query 1: Tenant status (fast - single row by PK)
      supabase
        .from('trial_tenants')
        .select('rag_status, status')
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
      
      // Query 3: Vector count (can be slow on large tables - use head:true for count only)
      supabase
        .from('embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
    ]);

    const { data: tenant, error: tenantError } = tenantResult;
    const { data: lastJob } = jobResult;
    const { count: vectorCount = 0 } = vectorResult;

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const minVectors = Number(process.env.MIN_PIPELINE_VECTORS ?? '10');
    const ready = isPipelineReady({
      ragStatus: tenant.rag_status,
      lastJobStatus: lastJob?.status || null,
      vectorCount: vectorCount ?? 0,
      minVectors,
    });

    const responseData = {
      ready,
      ragStatus: tenant.rag_status,
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
      { status: error.status || 500 }
    );
  }
}
