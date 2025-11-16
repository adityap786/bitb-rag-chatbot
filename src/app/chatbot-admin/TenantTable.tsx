"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type TenantRecord = {
  id: string;
  name: string;
  domain: string;
  vertical: string;
  plan: "Trial" | "Potential" | "Scale";
  seats: number;
  usagePercent: number;
  status: "Healthy" | "Attention" | "At Risk" | "Paused";
  sentiment: "Positive" | "Neutral" | "Negative";
  trialEndsOn: string | null;
  lastActive: string;
};

type TenantTableProps = {
  records: TenantRecord[];
};

const statusTone: Record<TenantRecord["status"], string> = {
  Healthy: "bg-emerald-500/10 text-emerald-300",
  Attention: "bg-amber-500/10 text-amber-300",
  "At Risk": "bg-rose-500/10 text-rose-300",
  Paused: "bg-slate-700 text-slate-200",
};

const sentimentTone: Record<TenantRecord["sentiment"], string> = {
  Positive: "text-emerald-300",
  Neutral: "text-slate-300",
  Negative: "text-rose-300",
};

const planTone: Record<TenantRecord["plan"], string> = {
  Trial: "bg-sky-500/10 text-sky-200",
  Potential: "bg-purple-500/10 text-purple-200",
  Scale: "bg-teal-500/10 text-teal-200",
};

function TenantTable({ records }: TenantTableProps) {
  const [search, setSearch] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState<"all" | TenantRecord["plan"]>("all");

  const planOptions = React.useMemo(() => {
    return Array.from(new Set(records.map((record) => record.plan))).sort();
  }, [records]);

  const filteredRecords = React.useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return records.filter((record) => {
      const matchesPlan = planFilter === "all" || record.plan === planFilter;

      const matchesQuery = !normalized
        ? true
        : [record.name, record.domain, record.vertical].some((value) =>
            value.toLowerCase().includes(normalized)
          );

      return matchesPlan && matchesQuery;
    });
  }, [planFilter, records, search]);

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Tenant Table</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Customer Tenants</h2>
          <p className="mt-1 text-sm text-slate-400">
            Search for specific tenants, or narrow the results by plan tier.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1 text-xs text-slate-400">
            <span className="sr-only">Search tenants</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, domain, or vertical"
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400/60"
              type="search"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400 sm:w-48">
            <span className="sr-only">Filter by plan</span>
            <select
              value={planFilter}
              onChange={(event) => setPlanFilter(event.target.value as TenantRecord["plan"] | "all")}
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400/60"
            >
              <option value="all">All plans</option>
              {planOptions.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="min-w-full divide-y divide-white/5 text-sm">
          <thead className="bg-slate-950/80 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Tenant</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Seats</th>
              <th className="px-4 py-3 font-medium">Usage</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Trial Ends</th>
              <th className="px-4 py-3 font-medium">Last Active</th>
              <th className="px-4 py-3 font-medium">Sentiment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-slate-950/40">
            {filteredRecords.length ? (
              filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-slate-950/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{record.name}</div>
                    <div className="text-xs text-slate-400">{record.domain}</div>
                    <div className="text-xs text-slate-500">{record.vertical}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold", planTone[record.plan])}>
                      {record.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-200">{record.seats}</td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-200">{record.usagePercent}%</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold", statusTone[record.status])}>
                      {record.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-200">{record.trialEndsOn ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-200">{record.lastActive}</td>
                  <td className="px-4 py-3 font-medium">
                    <span className={sentimentTone[record.sentiment]}>{record.sentiment}</span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-400" colSpan={8}>
                  No tenants match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">
        Showing {filteredRecords.length} of {records.length} tenants
      </div>
    </div>
  );
}

export default TenantTable;
