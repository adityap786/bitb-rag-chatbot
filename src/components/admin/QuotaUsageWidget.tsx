'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';

interface TenantQuota {
  tenant_id: string;
  tenant_name: string;
  plan: string;
  tokens_used: number;
  tokens_limit: number;
  queries_used: number;
  queries_limit: number;
  usage_percent: number;
}

export default function QuotaUsageWidget() {
  const [quotas, setQuotas] = useState<TenantQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuotas = async () => {
      try {
        const res = await fetch('/api/admin/quota-usage?limit=10');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setQuotas(data.quotas || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch quotas');
      } finally {
        setLoading(false);
      }
    };

    fetchQuotas();
    const interval = setInterval(fetchQuotas, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getUsageTextColor = (percent: number) => {
    if (percent >= 90) return 'text-red-400';
    if (percent >= 75) return 'text-amber-400';
    return 'text-emerald-400';
  };

  if (loading) {
    return (
      <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 animate-pulse text-slate-400" />
          <h2 className="text-lg font-semibold text-white">Quota Usage</h2>
        </div>
        <p className="mt-4 text-sm text-slate-400">Loading quota data...</p>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-purple-400" />
        <h2 className="text-lg font-semibold text-white">Active Quota Usage</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">Top tenants by usage percentage</p>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-400">Failed to load quota data</p>
          <p className="mt-1 text-xs text-red-300">{error}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {quotas.slice(0, 5).map((quota) => (
            <div key={quota.tenant_id} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{quota.tenant_name}</span>
                    <span className={`text-xs font-semibold ${getUsageTextColor(quota.usage_percent)}`}>
                      {quota.usage_percent}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                      {quota.plan}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full transition-all duration-300 ${getUsageColor(quota.usage_percent)}`}
                  style={{ width: `${Math.min(quota.usage_percent, 100)}%` }}
                />
              </div>

              {/* Usage Details */}
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-slate-500">Tokens</p>
                  <p className="font-semibold text-white">
                    {quota.tokens_used.toLocaleString()} / {quota.tokens_limit.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Queries</p>
                  <p className="font-semibold text-white">
                    {quota.queries_used} / {quota.queries_limit}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {quotas.length === 0 && (
            <p className="text-center text-sm text-slate-400">No active quota data</p>
          )}
        </div>
      )}
    </article>
  );
}
