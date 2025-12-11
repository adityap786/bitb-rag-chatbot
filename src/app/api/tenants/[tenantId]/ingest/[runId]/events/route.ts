import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';
import type { IngestionStepKey, IngestionSseEvent } from '@/types/ingestion';

const supabase = createLazyServiceClient();
export const runtime = 'nodejs';

function buildEventPayload(row: any, jobId: string, tenantId: string): IngestionSseEvent | null {
  if (!row) return null;
  if (!['running', 'completed', 'failed'].includes(row.status)) return null;

  const type = row.status === 'running'
    ? 'step.started'
    : row.status === 'completed'
      ? 'step.completed'
      : 'step.failed';

  const ts = row.status === 'completed'
    ? row.completed_at ?? row.updated_at
    : row.started_at ?? row.updated_at ?? new Date().toISOString();

  return {
    type,
    step: row.step_key as IngestionStepKey,
    ts,
    etaMs: row.eta_ms ?? undefined,
    message: row.message ?? undefined,
    runId: jobId,
    tenantId,
    processed: row.processed ?? undefined,
    total: row.total ?? undefined,
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ tenantId: string; runId: string }> }) {
  try {
    const token = verifyBearerToken(req);
    const { tenantId, runId } = await context.params;

    if (token.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: job, error: jobError } = await supabase
      .from('ingestion_jobs')
      .select('job_id, tenant_id, status')
      .eq('job_id', runId)
      .eq('tenant_id', tenantId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        let interval: ReturnType<typeof setInterval>;
        const seen = new Map<string, { status: string; updatedAt: string }>();

        const heartbeat = setInterval(() => {
          if (closed) return;
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        }, 15000);

        const closeStream = () => {
          if (closed) return;
          closed = true;
          clearInterval(interval);
          clearInterval(heartbeat);
          controller.close();
        };

        const sendEvent = (event: IngestionSseEvent) => {
          if (closed) return;
          const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        const poll = async () => {
          if (closed) return;
          const { data, error } = await supabase
            .from('ingestion_job_steps')
            .select('*')
            .eq('job_id', runId)
            .order('updated_at', { ascending: true });

          if (error) {
            console.error('Tenant ingestion stream error', error);
            closeStream();
            return;
          }

          // Refresh job status for pipeline-level events
          const { data: jobRow, error: jobRefreshError } = await supabase
            .from('ingestion_jobs')
            .select('status, updated_at')
            .eq('job_id', runId)
            .eq('tenant_id', tenantId)
            .single();

          if (jobRefreshError) {
            console.error('Tenant ingestion job refresh error', jobRefreshError);
            closeStream();
            return;
          }

          (data || []).forEach((row: any) => {
            if (!row) return;
            if (!['running', 'completed', 'failed'].includes(row.status)) return;
            const existing = seen.get(row.step_key);
            if (existing && existing.status === row.status && existing.updatedAt === row.updated_at) {
              return;
            }

            seen.set(row.step_key, { status: row.status, updatedAt: row.updated_at });
            const event = buildEventPayload(row, runId, tenantId);
            if (!event) return;
            sendEvent(event);

            if (event.type === 'step.failed' || (event.step === 'done' && event.type === 'step.completed')) {
              closeStream();
            }
          });

          if (jobRow?.status === 'completed') {
            sendEvent({
              type: 'pipeline.completed',
              step: 'done',
              ts: jobRow.updated_at || new Date().toISOString(),
              runId,
              tenantId,
            });
            closeStream();
          }

          if (jobRow?.status === 'cancelled') {
            sendEvent({
              type: 'pipeline.cancelled',
              step: 'done',
              ts: jobRow.updated_at || new Date().toISOString(),
              runId,
              tenantId,
            });
            closeStream();
          }
        };

        void poll();
        interval = setInterval(() => void poll(), 2000);

        req.signal.addEventListener('abort', () => {
          closeStream();
        });
      },
    });

    return new Response(stream, { headers });
  } catch (error) {
    console.error('Tenant ingestion SSE error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
