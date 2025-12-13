'use client';

import { useState } from 'react';
import { Settings, Save, RefreshCw } from 'lucide-react';

interface TenantConfig {
  tenant_id: string;
  batch_mode_enabled: boolean;
  max_batch_size: number;
  rate_limit_per_minute: number;
  token_quota_per_day: number;
}

export default function TenantConfigPanel() {
  const [selectedTenant, setSelectedTenant] = useState('');
  const [config, setConfig] = useState<TenantConfig>({
    tenant_id: '',
    batch_mode_enabled: true,
    max_batch_size: 5,
    rate_limit_per_minute: 60,
    token_quota_per_day: 10000,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Mock tenant list - replace with actual API call
  const tenants = [
    { id: 'orbit-labs', name: 'Orbit Labs', plan: 'Scale' },
    { id: 'zenith-media', name: 'Zenith Media', plan: 'Scale' },
    { id: 'harbor-finance', name: 'Harbor Finance', plan: 'Potential' },
    { id: 'kindroot-care', name: 'Kindroot Care', plan: 'Trial' },
  ];

  const handleTenantChange = async (tenantId: string) => {
    setSelectedTenant(tenantId);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/tenant-config?tenant_id=${tenantId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to load config:', err);
      setMessage({ type: 'error', text: 'Failed to load configuration' });
    }
  };

  const handleSave = async () => {
    if (!selectedTenant) {
      setMessage({ type: 'error', text: 'Please select a tenant' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/tenant-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save');
      }

      const data = await res.json();
      setMessage({ type: 'success', text: data.message || 'Configuration saved successfully' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save configuration',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="flex items-center gap-3">
        <Settings className="h-5 w-5 text-sky-400" />
        <h2 className="text-lg font-semibold text-white">Tenant Configuration</h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">Configure batch mode, rate limits, and quotas per tenant</p>

      <div className="mt-4 space-y-4">
        {/* Tenant Selector */}
        <div>
          <label htmlFor="tenant-select" className="block text-sm font-semibold text-white">
            Select Tenant
          </label>
          <select
            id="tenant-select"
            name="tenant-select"
            value={selectedTenant}
            onChange={(e) => handleTenantChange(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-white transition focus:border-sky-400/40 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
          >
            <option value="">-- Choose a tenant --</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.plan})
              </option>
            ))}
          </select>
        </div>

        {selectedTenant && (
          <>
            {/* Batch Mode Toggle */}
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Batch Mode</p>
                  <p className="mt-1 text-xs text-slate-400">Enable multiple queries in a single request</p>
                </div>
                <button
                  onClick={() =>
                    setConfig((prev) => ({ ...prev, batch_mode_enabled: !prev.batch_mode_enabled }))
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    config.batch_mode_enabled ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                      config.batch_mode_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Max Batch Size Slider */}
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <label htmlFor="batch-size" className="block text-sm font-semibold text-white">
                Max Batch Size
              </label>
              <p className="mt-1 text-xs text-slate-400">Maximum queries per batch (1-10)</p>
              <div className="mt-3 flex items-center gap-4">
                <input
                  id="batch-size"
                  type="range"
                  min="1"
                  max="10"
                  value={config.max_batch_size}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, max_batch_size: parseInt(e.target.value) }))
                  }
                  disabled={!config.batch_mode_enabled}
                  className="flex-1"
                />
                <span className="w-12 rounded bg-slate-800 px-3 py-1 text-center text-sm font-semibold text-white">
                  {config.max_batch_size}
                </span>
              </div>
            </div>

            {/* Rate Limit Input */}
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <label htmlFor="rate-limit" className="block text-sm font-semibold text-white">
                Rate Limit (requests/min)
              </label>
              <p className="mt-1 text-xs text-slate-400">Maximum requests per minute</p>
              <input
                id="rate-limit"
                type="number"
                min="10"
                max="1000"
                value={config.rate_limit_per_minute}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, rate_limit_per_minute: parseInt(e.target.value) || 60 }))
                }
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-white transition focus:border-sky-400/40 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
            </div>

            {/* Token Quota Input */}
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
              <label htmlFor="token-quota" className="block text-sm font-semibold text-white">
                Token Quota (per day)
              </label>
              <p className="mt-1 text-xs text-slate-400">Daily token limit for LLM calls</p>
              <input
                id="token-quota"
                type="number"
                min="1000"
                max="100000"
                step="1000"
                value={config.token_quota_per_day}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, token_quota_per_day: parseInt(e.target.value) || 10000 }))
                }
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-white transition focus:border-sky-400/40 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
            </div>

            {/* Message Display */}
            {message && (
              <div
                className={`rounded-xl border p-4 ${
                  message.type === 'success'
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                    : 'border-red-500/20 bg-red-500/10 text-red-400'
                }`}
              >
                <p className="text-sm font-semibold">{message.text}</p>
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-sky-500 px-4 py-3 font-semibold text-white transition hover:bg-sky-600 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Configuration
                </>
              )}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
