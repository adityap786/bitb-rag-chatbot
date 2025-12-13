import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import type { GenerateWidgetResponse } from '@/types/trial';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';
import { AuthenticationError } from '@/lib/trial/errors';
import { startTenantPipeline } from '@/lib/trial/start-pipeline';
import { isPipelineReady } from '@/lib/trial/pipeline-readiness';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

const supabase = createLazyServiceClient();

const WIDGET_CDN_URL = process.env.NEXT_PUBLIC_WIDGET_CDN_URL || 'https://cdn.yourcompany.com/widget/v1/widget.js';
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
// SRI hash for widget integrity (not embedding-related)
function computeSRI(content: string): string {
  const hash = createHash('sha384').update(content).digest('base64');
  return `sha384-${hash}`;
}

export async function POST(req: any, context: { params: Promise<{}> }) {
  try {
    // Cheap IP/user rate limiting before auth/DB work
    const ipRateLimitResponse = await rateLimit(req, RATE_LIMITS.trial);
    if (ipRateLimitResponse) return ipRateLimitResponse;

    const token = verifyBearerToken(req);
    const { tenantId } = token;

    // Check if tenant exists
    const { data: tenant } = await supabase
      .from('tenants')
      .select('status')
      .eq('tenant_id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get widget config
    const { data: config } = await supabase
      .from('widget_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (!config) {
      return NextResponse.json(
        { error: 'Widget configuration not found. Please complete branding step first.' },
        { status: 400 }
      );
    }

    const minVectors = Number(process.env.MIN_PIPELINE_VECTORS ?? '10');

    const [jobResult] = await Promise.all([
      supabase
        .from('ingestion_jobs')
        .select('job_id, status, updated_at, embeddings_count, started_at')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const lastJob = jobResult.data;
    let vectorCount = typeof lastJob?.embeddings_count === 'number' ? lastJob.embeddings_count : 0;
    if (!lastJob || typeof lastJob.embeddings_count !== 'number') {
      const { count } = await supabase
        .from('embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
      vectorCount = count ?? 0;
    }
    const jobStatus = lastJob?.status || null;

    let ragStatus = 'pending';
    if (jobStatus === 'completed' && vectorCount >= Math.max(minVectors, 0)) {
      ragStatus = 'ready';
    } else if (jobStatus === 'processing' || jobStatus === 'queued') {
      ragStatus = 'processing';
    } else if (jobStatus === 'failed') {
      ragStatus = 'failed';
    }

    const ready = isPipelineReady({
      ragStatus,
      lastJobStatus: jobStatus,
      vectorCount,
      minVectors,
    });

    // If RAG pipeline isn't ready yet, ensure a pipeline run is in-flight.
    if (!ready) {
      const started = await startTenantPipeline(tenantId, {
        source: 'manual',
        skipIfProcessing: true,
      });

      return NextResponse.json(
        {
          status: 'processing',
          message: 'Widget is being prepared. Please check back shortly.',
          tenantId,
          jobId: started.jobId ?? lastJob?.job_id ?? null,
        },
        { status: 202 }
      );
    }

    // Generate embed code
    const embedCode = `<!-- Chatbot Widget -->
<script
  src="${WIDGET_CDN_URL}"
  crossorigin="anonymous"
  data-tenant-id="${tenantId}"
  data-primary-color="${config.primary_color}"
  data-secondary-color="${config.secondary_color}"
  data-welcome-message="${encodeURIComponent(config.welcome_message)}"
  async
></script>`;

    const response: GenerateWidgetResponse = {
      embedCode,
      widgetUrl: WIDGET_CDN_URL,
      previewUrl: `${APP_BASE_URL}/widget-preview/${tenantId}`,
      assignedTools: config.assigned_tools,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('Generate widget error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
