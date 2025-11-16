export default function ChatbotAdminWidgetSettingsPage() {
  return (
    <>
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Widget</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Widget settings</h1>
        <p className="text-sm text-slate-400">
          Manage look, feel, and channel behavior for BitB widgets embedded across your tenants.
        </p>
      </header>
      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]">
        <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-lg font-semibold text-white">Configuration workspace</h2>
          <p className="mt-2 text-sm text-slate-400">
            This area will consolidate theme presets, voice toggle rules, and rollout controls for admins.
          </p>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <p className="font-semibold text-white">Theme presets</p>
              <p className="mt-1 text-xs text-slate-400">Define color, typography, and layout options per tenant or plan.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <p className="font-semibold text-white">Channel routing</p>
              <p className="mt-1 text-xs text-slate-400">Toggle chat vs voice availability and configure backup experiences.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <p className="font-semibold text-white">Rollout automation</p>
              <p className="mt-1 text-xs text-slate-400">Stage configuration changes before pushing them to production tenants.</p>
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-6">
          <h2 className="text-lg font-semibold text-white">Help shape this view</h2>
          <p className="mt-2 text-sm text-slate-400">
            Share required workflows in #widget-admin to influence the first iteration of this control plane.
          </p>
        </article>
      </section>
    </>
  );
}
