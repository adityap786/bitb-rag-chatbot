'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

interface BreakerState {
  state: 'closed' | 'open' | 'half_open' | 'isolated';
  healthy: boolean;
  lastStateChange?: string;
  totalRequests?: number;
  failedRequests?: number;
  successfulRequests?: number;
}

interface HealthData {
  ok: boolean;
  breaker: BreakerState;
  retrieverCheck: {
    status: 'ok' | 'failed' | 'skipped';
    detail?: string;
    error?: string;
  };
  env: {
    groqApiKey: boolean;
    supabase: boolean;
    openAiKey: boolean;
    redis: boolean;
  };
}

export default function SystemHealthWidget() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health/rag-pipeline');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHealth(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 animate-pulse text-slate-400" />
          <h2 className="text-lg font-semibold text-white">System Health</h2>
        </div>
        <p className="mt-4 text-sm text-slate-400">Loading health status...</p>
      </article>
    );
  }

  const getBreakerIcon = (state: string) => {
    switch (state) {
      case 'closed':
        return <CheckCircle className="h-5 w-5 text-emerald-400" />;
      case 'open':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'half_open':
        return <Clock className="h-5 w-5 text-amber-400" />;
      default:
        return <AlertCircle className="h-5 w-5 text-slate-400" />;
    }
  };

  const getBreakerColor = (state: string) => {
    switch (state) {
      case 'closed':
        return 'text-emerald-400';
      case 'open':
        return 'text-red-400';
      case 'half_open':
        return 'text-amber-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-sky-400" />
          <h2 className="text-lg font-semibold text-white">System Health</h2>
        </div>
        <button
          onClick={fetchHealth}
          className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-slate-400/40 hover:text-white"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-400">Health check failed</p>
          <p className="mt-1 text-xs text-red-300">{error}</p>
        </div>
      ) : health ? (
        <div className="mt-4 space-y-3">
          {/* Circuit Breaker Status */}
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getBreakerIcon(health.breaker.state)}
                <span className="text-sm font-semibold text-white">Circuit Breaker</span>
              </div>
              <span className={`text-xs font-semibold uppercase ${getBreakerColor(health.breaker.state)}`}>
                {health.breaker.state.replace('_', ' ')}
              </span>
            </div>
            {health.breaker.totalRequests !== undefined && (
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-slate-500">Total</p>
                  <p className="font-semibold text-white">{health.breaker.totalRequests}</p>
                </div>
                <div>
                  <p className="text-slate-500">Success</p>
                  <p className="font-semibold text-emerald-400">{health.breaker.successfulRequests || 0}</p>
                </div>
                <div>
                  <p className="text-slate-500">Failed</p>
                  <p className="font-semibold text-red-400">{health.breaker.failedRequests || 0}</p>
                </div>
              </div>
            )}
          </div>

          {/* Retriever Check */}
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Retriever</span>
              <span
                className={`text-xs font-semibold uppercase ${
                  health.retrieverCheck.status === 'ok'
                    ? 'text-emerald-400'
                    : health.retrieverCheck.status === 'failed'
                    ? 'text-red-400'
                    : 'text-slate-500'
                }`}
              >
                {health.retrieverCheck.status}
              </span>
            </div>
            {health.retrieverCheck.detail && (
              <p className="mt-1 text-xs text-slate-400">{health.retrieverCheck.detail}</p>
            )}
            {health.retrieverCheck.error && (
              <p className="mt-1 text-xs text-red-400">{health.retrieverCheck.error}</p>
            )}
          </div>

          {/* Environment Status */}
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">Dependencies</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Groq API</span>
                <span className={health.env.groqApiKey ? 'text-emerald-400' : 'text-red-400'}>
                  {health.env.groqApiKey ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Supabase</span>
                <span className={health.env.supabase ? 'text-emerald-400' : 'text-red-400'}>
                  {health.env.supabase ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">OpenAI</span>
                <span className={health.env.openAiKey ? 'text-emerald-400' : 'text-red-400'}>
                  {health.env.openAiKey ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Redis</span>
                <span className={health.env.redis ? 'text-emerald-400' : 'text-red-400'}>
                  {health.env.redis ? '✓' : '✗'}
                </span>
              </div>
            </div>
          </div>

          {/* Last Updated */}
          <p className="text-xs text-slate-500">
            Updated: {lastUpdated.toLocaleTimeString()}
          </p>

          {/* Health Endpoint Link */}
          <a
            href="/api/health/rag-pipeline"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-center text-xs font-semibold text-sky-400 transition hover:border-sky-400/40 hover:bg-slate-900/70"
          >
            View Raw Health Data →
          </a>
        </div>
      ) : null}
    </article>
  );
}
