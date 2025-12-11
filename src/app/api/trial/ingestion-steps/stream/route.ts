import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';
import type { IngestionStepKey, IngestionSseEvent } from '@/types/ingestion';

const supabase = createLazyServiceClient();
export const runtime = 'nodejs';

function buildEventPayload(row: any): IngestionSseEvent | null {
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
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = verifyBearerToken(req);
    const { tenantId } = token;

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabase
      .from('ingestion_jobs')
      .select('job_id, tenant_id, status')
      .eq('job_id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
        const seen = new Map<string, { status: string; updatedAt: string }>();

        const heartbeat = setInterval(() => {
          if (closed) return;
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        }, 15000);

        let interval: ReturnType<typeof setInterval>;
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
            .eq('job_id', jobId)
            .order('updated_at', { ascending: true });

          if (error) {
            console.error('Ingestion step stream error', error);
            closeStream();
            return;
          }

          (data || []).forEach((row: any) => {
            if (!row) return;
            if (!['running', 'completed', 'failed'].includes(row.status)) return;
            if (seen.get(row.step_key)?.updatedAt === row.updated_at && seen.get(row.step_key)?.status === row.status) {
              return;
            }

            seen.set(row.step_key, { status: row.status, updatedAt: row.updated_at });

            const event = buildEventPayload(row);
            if (!event) return;
            sendEvent(event);

            if (event.type === 'step.failed' || (event.step === 'done' && event.type === 'step.completed')) {
              closeStream();
            }
          });
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
    console.error('Ingestion step SSE error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
