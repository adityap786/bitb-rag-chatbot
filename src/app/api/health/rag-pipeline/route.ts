import { NextRequest, NextResponse } from 'next/server';
import { TenantIsolatedRetriever } from '@/lib/rag/supabase-retriever-v2';
import { getGroqClient } from '@/lib/rag/llm-client-with-breaker';
import { logger } from '@/lib/observability/logger';
import { redis as upstashRedis } from '@/lib/redis-client';

interface RetrieverCheckResult {
  status: 'ok' | 'failed' | 'skipped';
  detail?: string;
  error?: string;
}

export async function GET(req: any, context: { params: Promise<{}> }) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId');
  const breakerState = getGroqClient().getBreakerState();
  const envStatus = {
    groqApiKey: Boolean(process.env.GROQ_API_KEY),
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    openAiKey: Boolean(process.env.OPENAI_API_KEY),
    redis: Boolean(process.env.RAG_REDIS_URL),
  };

  let retrieverCheck: RetrieverCheckResult = {
    status: tenantId ? 'failed' : 'skipped',
    detail: tenantId ? 'Pending execution' : 'Tenant ID not provided',
  };

  // Redis health metrics (use Upstash if configured)
  let redisStats: any = null;
  try {
    if (process.env.UPSTASH_REDIS_REST_URL || process.env.RAG_REDIS_URL) {
      try {
        const client = upstashRedis as any;
        // Try lightweight health check: set a short-lived key and read it back
        const healthKey = '__health_check__';
        if (typeof client.set === 'function') {
          await client.set(healthKey, '1', { ex: 5 });
          const val = await client.get(healthKey);
          redisStats = { ok: val === '1' };
        } else if (typeof client.ping === 'function') {
          const ping = await client.ping();
          redisStats = { ping };
        } else {
          redisStats = { info: 'Upstash client present (no ping available)' };
        }
      } catch (err) {
        redisStats = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  } catch (err) {
    redisStats = { error: err instanceof Error ? err.message : String(err) };
  }

  // Cache stats placeholder (getRedisLangCache not exported)
  const cacheStats: Record<string, unknown> | null = null;

  if (tenantId) {
    try {
      const retriever = await TenantIsolatedRetriever.create(tenantId, {
        useCache: true,
        redisUrl: process.env.RAG_REDIS_URL,
      });
      await retriever.close();
      retrieverCheck = { status: 'ok', detail: 'Retriever created successfully' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Pipeline health retriever check failed', { tenantId, error: message });
      retrieverCheck = { status: 'failed', error: message, detail: 'Retriever bootstrap failed' };
    }
  }

  const breakerHealthy = breakerState.state !== 'open' && breakerState.state !== 'isolated';
  const overallOk = breakerHealthy && retrieverCheck.status !== 'failed';

  return NextResponse.json(
    {
      ok: overallOk,
      breaker: {
        ...breakerState,
        healthy: breakerHealthy,
      },
      retrieverCheck,
      env: envStatus,
      redis: redisStats,
      cacheStats,
    },
    { status: overallOk ? 200 : 503 }
  );
}