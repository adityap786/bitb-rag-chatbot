
import { SupabaseRolloutStore, RolloutState, RolloutAudit } from './store/supabase-adapter';
import { getCachedRolloutDecision, isInRollout } from './decision';
import { reloadTenantConfig } from '../config/tenant-config-loader';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export type PromoteOptions = {
  dryRun?: boolean;
};

export type PrometheusGateOptions = {
  query: string; // PromQL query
  threshold: number; // numeric threshold to compare against
  comparator?: '<' | '<=' | '>' | '>='; // default '<' (e.g., error_rate < 0.01)
  lookbackSec?: number; // how far back to query (seconds)
  stepSec?: number; // Prometheus step (seconds)
  prometheusUrl?: string; // optional override
  authBearer?: string; // optional bearer token override
};

export type PrometheusGateResult = {
  ok: boolean;
  value: number | null;
  threshold: number;
  details?: any;
};

/**
 * RolloutManager
 * - Reads/writes tenant YAML files under `config/`
 * - Applies staged feature rollout values (e.g. `llamaindex_retriever_v3: 10%`)
 * - Calls `reloadTenantConfig(tenantId)` to apply changes at runtime
 * - Placeholder hooks for metric gating (Prometheus) to be added
 */

export class RolloutManager {
  private configDir: string;
  private adminUrl?: string;
  private adminSecret?: string;
  private store: SupabaseRolloutStore;

  constructor(opts?: { configDir?: string; adminUrl?: string; adminSecret?: string; store?: SupabaseRolloutStore }) {
    this.configDir = opts?.configDir ?? path.resolve(process.cwd(), 'config');
    this.adminUrl = opts?.adminUrl ?? process.env.ADMIN_URL;
    this.adminSecret = opts?.adminSecret ?? process.env.ADMIN_SECRET;
    this.store = opts?.store ?? new SupabaseRolloutStore();
  }


  /** List tenants (legacy YAML fallback). */
  async listTenants(): Promise<string[]> {
    if (!fs.existsSync(this.configDir)) return [];
    const names = fs.readdirSync(this.configDir).filter((f) => f.endsWith('.yaml'));
    return names.map((f) => path.basename(f, '.yaml'));
  }


  /**
   * Get rollout state for a tenant/feature from Supabase.
   */
  async getRolloutState(tenantId: string, feature: string): Promise<RolloutState | null> {
    return this.store.getState(tenantId, feature);
  }

  /**
   * Set rollout state for a tenant/feature and append audit row.
   */
  async setRolloutState(tenantId: string, feature: string, percentage: number, actor: string, reason?: string): Promise<void> {
    const prev = await this.store.getState(tenantId, feature);
    await this.store.setState({ tenant_id: tenantId, feature, percentage, updated_by: actor });
    await this.store.appendAudit({
      tenant_id: tenantId,
      feature,
      old_percentage: prev?.percentage,
      new_percentage: percentage,
      actor,
      reason,
    });
  }

  /**
   * Get audit history for a tenant/feature.
   */
  async getAuditHistory(tenantId: string, feature?: string, limit = 50): Promise<RolloutAudit[]> {
    return this.store.getAuditHistory(tenantId, feature, limit);
  }


  // Legacy YAML fallback for migration period
  private setFeatureRolloutInConfig(configObj: any, featureName: string, percent: number) {
    if (!configObj.rollout) configObj.rollout = {};
    if (!Array.isArray(configObj.rollout.staged_features)) configObj.rollout.staged_features = [];
    const staged: Array<any> = configObj.rollout.staged_features;
    const existing = staged.find((s) => s.name === featureName);
    const rolloutValue = typeof percent === 'number' ? `${percent}%` : String(percent);
    if (existing) existing.rollout = rolloutValue;
    else staged.push({ name: featureName, rollout: rolloutValue });
  }


  /**
   * Promote a feature across tenants: set rollout percentage and audit.
   * Uses Supabase for state/audit; falls back to YAML for legacy tenants.
   */
  async promoteFeatureAcrossTenants(featureName: string, tenants: string[], percent: number, opts: PromoteOptions & { actor?: string; reason?: string } = {}) {
    for (const tenantId of tenants) {
      try {
        // Use Supabase for rollout state
        if (!opts.dryRun) {
          await this.setRolloutState(tenantId, featureName, percent, opts.actor || 'system', opts.reason);
        }
      } catch (err) {
        // Fallback: legacy YAML for migration period
        try {
          const config = this.readTenantConfig(tenantId);
          this.setFeatureRolloutInConfig(config, featureName, percent);
          if (!opts.dryRun) {
            this.writeTenantConfig(tenantId, config);
            try {
              reloadTenantConfig(tenantId);
            } catch {}
          }
        } catch {}
      }
    }
  }


  async reloadTenant(tenantId: string): Promise<void> {
    reloadTenantConfig(tenantId);
  }

  /**
   * Read legacy tenant YAML config if present (used as a fallback during migrations).
   */
  private readTenantConfig(tenantId: string): any {
    const filePath = path.join(this.configDir, `${tenantId}.yaml`);
    if (!fs.existsSync(filePath)) return {};
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return yaml.load(raw) || {};
    } catch (err) {
      return {};
    }
  }

  /**
   * Write legacy tenant YAML config (fallback for migration period).
   */
  private writeTenantConfig(tenantId: string, configObj: any): void {
    const filePath = path.join(this.configDir, `${tenantId}.yaml`);
    try {
      const raw = yaml.dump(configObj || {});
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(filePath, raw, 'utf8');
    } catch (err) {
      // swallow errors for best-effort legacy fallback
    }
  }

  /**
   * Check if a user is in the rollout for a feature (cached, scalable).
   */
  async isUserInRollout(tenantId: string, userId: string, feature: string, percentage: number): Promise<boolean> {
    return getCachedRolloutDecision({ tenantId, userId, feature, percentage });
  }

  // Placeholder: evaluate metrics via Prometheus before promoting stages
  // Evaluate a Prometheus metric gate. Returns {ok, value, threshold, details}.
  // If no PROMETHEUS_URL is configured, the gate will allow promotions by default.
  async evaluatePrometheusGate(opts?: PrometheusGateOptions): Promise<PrometheusGateResult> {
    const prometheusUrl = opts?.prometheusUrl || process.env.PROMETHEUS_URL;
    const threshold = opts?.threshold ?? 0;
    const comparator = opts?.comparator ?? '<';

    if (!prometheusUrl) {
      // No Prometheus configured => allow promotion
      return { ok: true, value: null, threshold };
    }

    if (!opts?.query) {
      return { ok: false, value: null, threshold, details: 'Missing query' };
    }

    const lookbackSec = opts?.lookbackSec ?? 120;
    const stepSec = opts?.stepSec ?? Math.max(15, Math.floor(lookbackSec / 20));
    const end = Math.floor(Date.now() / 1000);
    const start = end - lookbackSec;

    const url = `${prometheusUrl.replace(/\/$/, '')}/api/v1/query_range?query=${encodeURIComponent(
      opts.query
    )}&start=${start}&end=${end}&step=${stepSec}`;

    try {
      const { default: fetch } = await import('node-fetch');
      const headers: Record<string, string> = {};
      const authBearer = opts?.authBearer || process.env.PROMETHEUS_BEARER_TOKEN;
      if (authBearer) headers['Authorization'] = `Bearer ${authBearer}`;

      const res = await fetch(url, { method: 'GET', headers });
      const json: any = await res.json();

      if (!json || json.status !== 'success' || !json.data) {
        return { ok: false, value: null, threshold, details: json };
      }

      const results = json.data.result || [];
      if (!results || results.length === 0) {
        // No data available => allow promotion to be safe
        return { ok: true, value: null, threshold };
      }

      // Compute average across all series and time points
      let total = 0;
      let count = 0;
      for (const series of results) {
        const values = series.values || (series.value ? [series.value] : []);
        for (const v of values) {
          // v may be [timestamp, value] or string value
          const raw = Array.isArray(v) ? v[1] : v;
          const val = parseFloat(String(raw));
          if (Number.isFinite(val)) {
            total += val;
            count++;
          }
        }
      }

      const avg = count > 0 ? total / count : 0;
      let ok = true;
      switch (comparator) {
        case '<':
          ok = avg < threshold;
          break;
        case '<=':
          ok = avg <= threshold;
          break;
        case '>':
          ok = avg > threshold;
          break;
        case '>=':
          ok = avg >= threshold;
          break;
        default:
          ok = avg < threshold;
      }

      return { ok, value: avg, threshold, details: { raw: results } };
    } catch (err) {
      return { ok: false, value: null, threshold, details: String(err) };
    }
  }
}

export default RolloutManager;
