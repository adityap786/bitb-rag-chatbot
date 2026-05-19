import { Plugin, pluginRegistry } from '../plugins/registry';
import { getTenantPluginConfig } from '../plugins/pluginTenantConfig';

// Loads and enables plugins for a tenant at runtime
export async function loadPluginsForTenant(tenantId: string) {
  const configs = await getTenantPluginConfig(tenantId);
  for (const row of configs) {
    const plugin = pluginRegistry.getPlugin(row.plugin_id);
    if (plugin && plugin.onLoad) {
      await plugin.onLoad({ tenantId, config: row.config });
    }
    pluginRegistry.enableForTenant(row.plugin_id, tenantId);
  }
}
