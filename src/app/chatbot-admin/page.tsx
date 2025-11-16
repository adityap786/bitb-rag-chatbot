import TenantTable, { TenantRecord } from "./TenantTable";
import EscalationTimeline, { type EscalationEvent } from "./EscalationTimeline";
import AnalyticsWidgets from "./AnalyticsWidgets";
import {
  Download,
  MessageSquare,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { getAdminAnalytics } from "@/lib/admin/analytics";

const escalationEvents: EscalationEvent[] = [
  {
    id: "evt-2310",
    tenant: "Kindroot Care",
    summary: "Voice greeting misfires on fallback intents",
    impact: "High",
    owner: "Ops",
    opened: "Nov 04, 10:32",
    status: "Mitigation",
    details: [
      "Escalated to voice pipeline on-call; awaiting patched prompt set.",
      "Customer notified of workaround; trial extended by 5 days.",
    ],
  },
  {
    id: "evt-2308",
    tenant: "Harbor Finance",
    summary: "Nightly ingestion paused due to quota limits",
    impact: "Medium",
    owner: "Customer Success",
    opened: "Nov 03, 21:05",
    status: "Monitoring",
    details: [
      "Quota bump deployed; ingestion caught up within SLA.",
      "Triggering new alert thresholds for >4h backlog.",
    ],
  },
  {
    id: "evt-2301",
    tenant: "Orbit Labs",
    summary: "Custom task routing intermittently drops connections",
    impact: "High",
    owner: "Engineering",
    opened: "Nov 01, 08:12",
    status: "Resolved",
    details: [
      "Patched WebSocket keepalive logic; rolled out to Scale tenants.",
      "Confirmed stability: 0 disconnects in the last 24h.",
    ],
  },
];

const auditLog = [
  {
    id: "audit-9812",
    actor: "l.thomas",
    action: "Extended Orbit Labs trial",
    timestamp: "Nov 05 · 14:18",
    scope: "Tenant",
  },
  {
    id: "audit-9804",
    actor: "system",
    action: "Synced voice config to Kindroot Care",
    timestamp: "Nov 05 · 11:02",
    scope: "Automation",
  },
  {
    id: "audit-9799",
    actor: "d.chen",
    action: "Exported conversation transcripts",
    timestamp: "Nov 04 · 21:44",
    scope: "Compliance",
  },
  {
    id: "audit-9786",
    actor: "ops-oncall",
    action: "Acknowledged escalation EVT-2308",
    timestamp: "Nov 04 · 08:15",
    scope: "Operations",
  },
];

const tenantRecords: TenantRecord[] = [
  {
    id: "orbit-labs",
    name: "Orbit Labs",
    domain: "orbitlabs.ai",
    vertical: "Healthcare automation",
    plan: "Scale",
    seats: 52,
    usagePercent: 86,
    status: "Healthy",
    sentiment: "Positive",
    trialEndsOn: null,
    lastActive: "2h ago",
  },
  {
    id: "harbor-finance",
    name: "Harbor Finance",
    domain: "harborfinance.co",
    vertical: "Fintech underwriting",
    plan: "Potential",
    seats: 24,
    usagePercent: 63,
    status: "Attention",
    sentiment: "Neutral",
    trialEndsOn: null,
    lastActive: "5h ago",
  },
  {
    id: "northwind-market",
    name: "Northwind Market",
    domain: "northwindmarket.com",
    vertical: "Retail marketplace",
    plan: "Trial",
    seats: 10,
    usagePercent: 44,
    status: "Attention",
    sentiment: "Positive",
    trialEndsOn: "Nov 21",
    lastActive: "38m ago",
  },
  {
    id: "zenith-media",
    name: "Zenith Media",
    domain: "zenithmedia.io",
    vertical: "Media & publishing",
    plan: "Scale",
    seats: 68,
    usagePercent: 91,
    status: "Healthy",
    sentiment: "Positive",
    trialEndsOn: null,
    lastActive: "12m ago",
  },
  {
    id: "lattice-analytics",
    name: "Lattice Analytics",
    domain: "latticeanalytics.dev",
    vertical: "Data observability",
    plan: "Potential",
    seats: 18,
    usagePercent: 57,
    status: "Attention",
    sentiment: "Neutral",
    trialEndsOn: null,
    lastActive: "1d ago",
  },
  {
    id: "kindroot-care",
    name: "Kindroot Care",
    domain: "kindroot.care",
    vertical: "Telehealth",
    plan: "Trial",
    seats: 14,
    usagePercent: 39,
    status: "At Risk",
    sentiment: "Negative",
    trialEndsOn: "Nov 18",
    lastActive: "6h ago",
  },
  {
    id: "solstice-energy",
    name: "Solstice Energy",
    domain: "solstice.energy",
    vertical: "Clean energy ops",
    plan: "Scale",
    seats: 41,
    usagePercent: 78,
    status: "Healthy",
    sentiment: "Positive",
    trialEndsOn: null,
    lastActive: "1h ago",
  },
];

export default async function ChatbotAdminPage() {
  const analytics = await getAdminAnalytics();

  return (
    <>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Monitor BitB tenants, trials, and widget performance at a glance.
          </p>
        </div>
      </header>
          <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Active Trials</h2>
              <p className="mt-4 text-4xl font-semibold text-white">12</p>
              <p className="mt-1 text-xs text-slate-500">Across Potential and Scale plans in the last 72h.</p>
            </article>
          </section>
          <section aria-label="Tenant overview">
            <TenantTable records={tenantRecords} />
          </section>
          <section aria-label="Usage analytics" className="space-y-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Usage Analytics</p>
              <h2 className="text-2xl font-semibold text-white">Channel and latency trends</h2>
              <p className="text-sm text-slate-400">
                Monitor interaction volume by channel and track how assistant response times evolve week over week.
              </p>
            </div>
            <AnalyticsWidgets analytics={analytics} />
          </section>
          <section aria-label="Escalations timeline" className="space-y-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Operations</p>
              <h2 className="text-2xl font-semibold text-white">Escalations & on-call handoffs</h2>
              <p className="text-sm text-slate-400">
                Track high-priority escalations, owners, and remediation status across BitB tenants.
              </p>
            </div>
            <EscalationTimeline events={escalationEvents} />
          </section>
          <section aria-label="Quick actions and audit log" className="grid gap-4 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,0.35fr)]">
            <article className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <header className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Quick Actions</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">High-signal ops shortcuts</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Ship fast support replies or fix friction points without leaving the dashboard.
                  </p>
                </div>
                <span className="rounded-xl bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  Updated 2m ago
                </span>
              </header>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="group flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-left transition hover:border-emerald-300/40 hover:bg-slate-900/70"
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Sparkles className="h-4 w-4 text-emerald-300" aria-hidden="true" /> Extend AI trial
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Orbit Labs · Auto-adjust seats + notify CS</p>
                  </div>
                  <span aria-hidden="true" className="text-slate-500 group-hover:text-emerald-300">
                    →
                  </span>
                </button>
                <button
                  type="button"
                  className="group flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-left transition hover:border-sky-300/40 hover:bg-slate-900/70"
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <RefreshCw className="h-4 w-4 text-sky-300" aria-hidden="true" /> Re-run ingestion
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Harbor Finance · Backfill last 24 hours</p>
                  </div>
                  <span aria-hidden="true" className="text-slate-500 group-hover:text-sky-300">
                    →
                  </span>
                </button>
                <button
                  type="button"
                  className="group flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-left transition hover:border-amber-300/40 hover:bg-slate-900/70"
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <MessageSquare className="h-4 w-4 text-amber-300" aria-hidden="true" /> Draft status note
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Kindroot Care · Escalation EVT-2310</p>
                  </div>
                  <span aria-hidden="true" className="text-slate-500 group-hover:text-amber-300">
                    →
                  </span>
                </button>
                <button
                  type="button"
                  className="group flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-left transition hover:border-purple-300/40 hover:bg-slate-900/70"
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Download className="h-4 w-4 text-purple-300" aria-hidden="true" /> Export transcripts
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Full tenant bundle · Compliance ready CSV</p>
                  </div>
                  <span aria-hidden="true" className="text-slate-500 group-hover:text-purple-300">
                    →
                  </span>
                </button>
              </div>
            </article>
            <article className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
              <header className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Audit Log</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Latest actions</h2>
                  <p className="mt-1 text-xs text-slate-400">Syncs across support, ops, and automation channels.</p>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-slate-400/40 hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
                </button>
              </header>
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-slate-950/80 text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Actor</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Scope</th>
                      <th className="px-4 py-3 font-medium">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-slate-950/40">
                    {auditLog.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3 font-mono text-xs uppercase tracking-wide text-slate-400">{entry.actor}</td>
                        <td className="px-4 py-3 text-sm text-white">{entry.action}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{entry.scope}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{entry.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
  );
}

// Command to run after this step: npx tsc --noEmit
// If tsc passes, request the next step
// NEXT: hook analytics stream to live API (optional stretch)
