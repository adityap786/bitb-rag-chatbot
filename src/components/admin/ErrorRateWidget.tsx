'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

interface ErrorMetrics {
  total_requests: number;
  failed_requests: number;
  error_rate: number;
  last_24h_errors: number;
  trend: 'up' | 'down' | 'stable';
  recent_errors: Array<{
    timestamp: string;
    error_type: string;
    count: number;
  }>;
}

export default function ErrorRateWidget() {
  const [metrics, setMetrics] = useState<ErrorMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/admin/error-metrics');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        // Format timestamps for display
        const formattedMetrics = {
          ...data,
          recent_errors: data.recent_errors.map((err: any) => ({
            ...err,
            timestamp: formatTimestamp(err.timestamp),
          })),
        };
        
        setMetrics(formattedMetrics);
      } catch (err) {
        console.error('Failed to fetch error metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return `${Math.floor(diffMs / (1000 * 60))}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (loading) {
    return (
      <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 animate-pulse text-slate-400" />
          <h2 className="text-lg font-semibold text-white">Error Rate</h2>
        </div>
        <p className="mt-4 text-sm text-slate-400">Loading error metrics...</p>
      </article>
    );
  }

  const getErrorRateColor = (rate: number) => {
    if (rate >= 1.0) return 'text-red-400';
    if (rate >= 0.5) return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-semibold text-white">Error Rate</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">Last 24 hours</p>

      {metrics && (
        <div className="mt-4 space-y-4">
          {/* Current Error Rate */}
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Current Rate</span>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${getErrorRateColor(metrics.error_rate)}`}>
                  {metrics.error_rate.toFixed(2)}%
                </span>
                {metrics.trend === 'down' ? (
                  <TrendingDown className="h-4 w-4 text-emerald-400" />
                ) : metrics.trend === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-red-400" />
                ) : null}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Total Requests</p>
                <p className="font-semibold text-white">{metrics.total_requests.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-slate-500">Failed</p>
                <p className="font-semibold text-red-400">{metrics.failed_requests}</p>
              </div>
            </div>
          </div>

          {/* Recent Errors */}
          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">Recent Errors</p>
            <div className="mt-2 space-y-2">
              {metrics.recent_errors.map((error, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-medium text-white">{error.error_type}</span>
                    <span className="ml-2 text-slate-500">{error.timestamp}</span>
                  </div>
                  <span className="rounded bg-red-500/20 px-2 py-0.5 font-semibold text-red-400">
                    {error.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
