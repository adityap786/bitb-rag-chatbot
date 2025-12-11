'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { createParser, type EventSourceMessage } from 'eventsource-parser';
import { Progress } from '@/components/ui/progress';
import type { IngestionSseEvent } from '@/types/ingestion';
import { INGESTION_STEP_LABELS, INGESTION_STEP_ORDER } from '@/types/ingestion';
import {
  calculateStepProgress,
  createInitialStepState,
  formatEtaDuration,
  StepState,
  StepStateMap,
} from '@/lib/trial/multi-step-loader';

const CHANNEL_NAME = 'bitb-ingestion-steps';
type ConnectionState = 'idle' | 'connecting' | 'connected' | 'failed';

interface MultiStepLoaderProps {
  jobId: string;
  tenantId: string;
  token: string;
  initialProgress?: number;
  onProgress?: (value: number) => void;
  onComplete?: () => void;
  onFailure?: (message: string) => void;
}

interface BroadcastPayload {
  jobId: string;
  event: IngestionSseEvent;
  origin: 'sse';
}

export default function MultiStepLoader({
  jobId,
  tenantId,
  token,
  initialProgress = 0,
  onProgress,
  onComplete,
  onFailure,
}: MultiStepLoaderProps) {
  const [steps, setSteps] = useState<StepStateMap>(() => createInitialStepState());
  const [progress, setProgress] = useState<number>(initialProgress);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [etaText, setEtaText] = useState<string | null>(null);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const progressRef = useRef<number>(initialProgress);
  const completeRef = useRef(false);

  const updateStep = (event: IngestionSseEvent, fromBroadcast = false) => {
    // Pipeline-level events fast-path
    if (event.type === 'pipeline.completed') {
      setFinalMessage('Preparing your chatbot playground');
      setProgress(100);
      progressRef.current = 100;
      onProgress?.(100);
      onComplete?.();
      channelRef.current?.postMessage({ jobId, event, origin: 'sse' });
      return;
    }

    if (event.type === 'pipeline.cancelled') {
      setConnectionError('Pipeline cancelled');
      onFailure?.(event.message || 'Pipeline cancelled');
      channelRef.current?.postMessage({ jobId, event, origin: 'sse' });
      return;
    }
    setSteps((previous) => {
      const next: StepStateMap = { ...previous };
      const status: StepState['status'] = event.type === 'step.started'
        ? 'running'
        : event.type === 'step.completed'
          ? 'completed'
          : 'failed';
      next[event.step] = {
        status,
        timestamp: event.ts,
        etaMs: event.etaMs ?? previous[event.step]?.etaMs ?? null,
        message: event.message ?? previous[event.step]?.message ?? null,
      };

      const nextProgress = calculateStepProgress(next);
      if (progressRef.current !== nextProgress) {
        progressRef.current = nextProgress;
        setProgress(nextProgress);
        onProgress?.(nextProgress);
      }

      const running = INGESTION_STEP_ORDER.find((key) => next[key]?.status === 'running') ?? null;
      setEtaText(running ? formatEtaDuration(next[running]?.etaMs) : null);

      if (!fromBroadcast) {
        channelRef.current?.postMessage({ jobId, event, origin: 'sse' });
      }

      if (event.step === 'done' && event.type === 'step.completed' && !completeRef.current) {
        completeRef.current = true;
        onComplete?.();
      }

      if (event.type === 'step.failed') {
        onFailure?.(event.message ?? 'Ingestion step failed.');
      }

      return next;
    });
  };

  useEffect(() => {
    setSteps(createInitialStepState());
    completeRef.current = false;
  }, [jobId]);

  useEffect(() => {
    setProgress(initialProgress);
    progressRef.current = initialProgress;
    onProgress?.(initialProgress);
  }, [initialProgress, onProgress]);

  useEffect(() => {
    if (!jobId || typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    const handleMessage = (event: MessageEvent<BroadcastPayload>) => {
      const payload = event.data;
      if (!payload || payload.jobId !== jobId) return;
      updateStep(payload.event, true);
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !token) return;
    let active = true;
    const controller = new AbortController();
    const decoder = new TextDecoder();

    const connect = async () => {
      setConnectionState('connecting');
      setConnectionError(null);

      try {
        const streamUrl = `/api/tenants/${tenantId}/ingest/${jobId}/events`;
        const res = await fetch(streamUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = new Error('Unable to connect to live updates');
          (err as any).status = res.status;
          throw err;
        }

        setConnectionState('connected');
        const parser = createParser({
          onEvent(event: EventSourceMessage) {
            if (!event.data) return;
            try {
              const payload = JSON.parse(event.data) as IngestionSseEvent;
              updateStep(payload);
            } catch (err) {
              console.warn('Failed to parse ingestion step event', err);
            }
          },
        });

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('Streaming endpoint did not provide a reader');
        }

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }

        if (active) {
          setConnectionState('failed');
          setConnectionError('Live updates disconnected');
        }
      } catch (error: any) {
        if (controller.signal.aborted || !active) return;
        const { status, message } = error;
        const authProblem = status === 401 || status === 403;
        setConnectionState('failed');
        setConnectionError(
          authProblem
            ? 'Session expired while streaming progress. Refresh to continue.'
            : message || 'Realtime updates are currently unavailable.'
        );
        if (authProblem) {
          onFailure?.('Session expired while streaming progress. Refresh to continue.');
        }
      }
    };

    connect();

    return () => {
      active = false;
      controller.abort();
    };
  }, [jobId, token, onFailure]);

  const statusLabel = useMemo(() => {
    if (connectionState === 'connecting') return 'Connecting…';
    if (connectionState === 'connected') return 'Live updates';
    if (connectionState === 'failed') return 'Live updates paused';
    return 'Preparing updates';
  }, [connectionState]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Ingestion status</p>
          <h3 className="text-xl font-semibold text-white">Building your knowledge base</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              connectionState === 'connected'
                ? 'bg-emerald-400'
                : connectionState === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-400'
            }`}
          />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-300">
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400">
          {progress >= 100 ? 'Complete' : `${progress}%`}
        </div>
        <Progress value={progress} className="h-2 bg-slate-700" indicatorClassName="bg-gradient-to-r from-indigo-500 to-sky-500" />
        <p className="text-xs text-slate-400">
          {finalMessage || etaText || 'Hang tight while we stitch together your custom assistant.'}
        </p>
        {connectionError ? (
          <p className="text-xs text-rose-300" aria-live="polite">
            {connectionError}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {INGESTION_STEP_ORDER.map((step) => {
          const state = steps[step];
          return (
            <div key={step} className="flex items-center justify-between rounded-2xl border border-white/5 bg-slate-900/40 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{INGESTION_STEP_LABELS[step]}</p>
                {state?.message ? (
                  <p className="text-xs text-slate-300">{state.message}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                {state?.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : state?.status === 'running' ? (
                  <Loader2 className="h-5 w-5 text-sky-400 animate-spin" />
                ) : state?.status === 'failed' ? (
                  <AlertCircle className="h-5 w-5 text-rose-400" />
                ) : (
                  <span className="text-slate-400">Pending</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
