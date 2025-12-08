// Example: Load and cache tenant YAML config for use in server
import path from 'path';
import { loadTenantConfig, TenantConfig } from './loader';


import fs from 'fs';

const tenantConfigCache: Record<string, TenantConfig> = {};
const configWatchers: Record<string, fs.FSWatcher> = {};

function getConfigPath(tenantId: string): string {
  return path.join(__dirname, `../config/${tenantId}.yaml`);
}

export function getTenantConfig(tenantId: string): TenantConfig {
  if (tenantConfigCache[tenantId]) return tenantConfigCache[tenantId];
  reloadTenantConfig(tenantId);
  return tenantConfigCache[tenantId];
}

export function reloadTenantConfig(tenantId: string): void {
  const configPath = getConfigPath(tenantId);
  const config = loadTenantConfig(configPath);
  tenantConfigCache[tenantId] = config;
  // Set up watcher for dynamic reload
  if (!configWatchers[tenantId]) {
    try {
      configWatchers[tenantId] = fs.watch(configPath, (eventType) => {
        if (eventType === 'change') {
          try {
            const updated = loadTenantConfig(configPath);
            tenantConfigCache[tenantId] = updated;
            // Optionally, log reload event
            // console.log(`Reloaded config for tenant: ${tenantId}`);
          } catch (err) {
            // Optionally, log error
          }
        }
      });
    } catch (err) {
      // Optionally, log error
    }
  }
}

export function clearTenantConfigCache(tenantId?: string): void {
  if (tenantId) {
    delete tenantConfigCache[tenantId];
    if (configWatchers[tenantId]) {
      configWatchers[tenantId].close();
      delete configWatchers[tenantId];
    }
  } else {
    Object.keys(tenantConfigCache).forEach((tid) => clearTenantConfigCache(tid));
  }
}

// Usage in server:
// const config = getTenantConfig(trial.tenant_id);
// if (config.feature_flags?.enable_new_reranker) { ... }
// const prompt = config.prompt_versions?.greeting?.[config.rollout?.current_prompt_version || 'v1'] || config.prompts.greeting;
