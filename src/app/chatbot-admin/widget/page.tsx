import TenantConfigPanel from '@/components/admin/TenantConfigPanel';

export default function ChatbotAdminWidgetSettingsPage() {
  return (
    <>
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Widget</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Widget & Tenant Settings</h1>
        <p className="text-sm text-slate-400">
          Configure batch mode, rate limits, and quotas for BitB widgets across your tenants.
        </p>
      </header>

      {/* Tenant Configuration Panel */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,0.4fr)]">
        <TenantConfigPanel />

        {/* Info Panel */}
        <div className="space-y-4">
          <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold text-white">Configuration Guide</h2>
            <p className="mt-2 text-sm text-slate-400">
              Fine-tune performance and resource usage for each tenant.
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <p className="font-semibold text-white">Batch Mode</p>
                <p className="mt-1 text-xs text-slate-400">
                  Allow multiple queries in a single request. Aggregates up to max batch size queries when possible for efficiency.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <p className="font-semibold text-white">Rate Limiting</p>
                <p className="mt-1 text-xs text-slate-400">
                  Controls requests per minute using sliding window algorithm. Prevents quota exhaustion and API abuse.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <p className="font-semibold text-white">Token Quotas</p>
                <p className="mt-1 text-xs text-slate-400">
                  Daily LLM token limit per tenant. Tracks usage across all queries and enforces limits to control costs.
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6">
            <h2 className="text-lg font-semibold text-white">Best Practices</h2>
            <ul className="mt-2 space-y-2 text-sm text-slate-400">
              <li>• Set batch size based on tenant query patterns</li>
              <li>• Monitor quota usage to adjust limits proactively</li>
              <li>• Enable batch mode for high-volume tenants</li>
              <li>• Review rate limits weekly during trials</li>
            </ul>
          </article>
        </div>
      </section>

      {/* Theme Presets (Future) */}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6">
          <h2 className="text-lg font-semibold text-white">Coming Soon: Theme Presets</h2>
          <p className="mt-2 text-sm text-slate-400">
            Define color, typography, and layout options per tenant or plan tier.
          </p>
        </article>
        <article className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6">
          <h2 className="text-lg font-semibold text-white">Coming Soon: Channel Routing</h2>
          <p className="mt-2 text-sm text-slate-400">
            Toggle chat vs voice availability and configure fallback experiences per tenant.
          </p>
        </article>
      </section>
    </>
  );
}
