import SystemHealthWidget from '@/components/admin/SystemHealthWidget';
import ErrorRateWidget from '@/components/admin/ErrorRateWidget';
import QuotaUsageWidget from '@/components/admin/QuotaUsageWidget';
import { ExternalLink } from 'lucide-react';

export default function ChatbotAdminOperationsPage() {
  return (
    <>
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Operations</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">System Health Dashboard</h1>
        <p className="text-sm text-slate-400">
          Monitor circuit breaker status, error rates, and quota usage across all tenants in real-time.
        </p>
      </header>

      {/* System Health Widgets */}
      <section className="grid gap-4 lg:grid-cols-3">
        <SystemHealthWidget />
        <ErrorRateWidget />
        <QuotaUsageWidget />
      </section>

      {/* Health Endpoint Info */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">RAG Pipeline Health Endpoint</h2>
            <p className="mt-1 text-sm text-slate-400">
              Monitor the health of the RAG pipeline, circuit breaker state, and dependency status
            </p>
          </div>
          <a
            href="/api/health/rag-pipeline"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm font-semibold text-sky-400 transition hover:border-sky-400/40 hover:bg-slate-900/70"
          >
            View Endpoint
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">Circuit Breaker State</p>
            <p className="mt-1 text-xs text-slate-400">
              Real-time status of the Groq API circuit breaker (closed, open, half-open)
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">Dependency Status</p>
            <p className="mt-1 text-xs text-slate-400">
              Environment checks for Groq, Supabase, OpenAI, and Redis availability
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">Retriever Health</p>
            <p className="mt-1 text-xs text-slate-400">
              Test tenant-isolated retriever initialization and configuration
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">Usage Metrics</p>
            <p className="mt-1 text-xs text-slate-400">
              Request counts, success/failure rates, and state change timestamps
            </p>
          </div>
        </div>
      </section>

      {/* Future Features */}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6">
          <h2 className="text-lg font-semibold text-white">Coming Soon: SLA Analytics</h2>
          <p className="mt-2 text-sm text-slate-400">
            Highlight MTTR trends, backlog aging, and escalation queues across product surfaces.
          </p>
        </article>
        <article className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6">
          <h2 className="text-lg font-semibold text-white">Coming Soon: Runbook Shortcuts</h2>
          <p className="mt-2 text-sm text-slate-400">
            Launch templated remediation tasks, status updates, and communication macros.
          </p>
        </article>
      </section>
    </>
  );
}
