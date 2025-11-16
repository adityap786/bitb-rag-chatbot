export default function ChatbotAdminTenantsPage() {
  return (
    <>
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Tenants</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Tenant directory</h1>
        <p className="text-sm text-slate-400">
          Review onboarding status, usage, and trial health for every BitB tenant from a single view.
        </p>
      </header>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-lg font-semibold text-white">Coming soon</h2>
          <p className="mt-2 text-sm text-slate-400">
            We are building a richer tenant management surface with filters, exports, and lifecycle automation.
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-500">Planned additions</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            <li>- Seat utilization breakdowns by plan tier</li>
            <li>- Segmented health scoring and alerts</li>
            <li>- Bulk actions for renewals and outreach</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6">
          <h2 className="text-lg font-semibold text-white">Need something sooner?</h2>
          <p className="mt-2 text-sm text-slate-400">
            Drop a note in #admin-dashboard and we can prioritize the workflows you need first.
          </p>
        </article>
      </section>
    </>
  );
}
