import { Plugin, pluginRegistry } from '../plugins/registry';

// Utility to invoke all enabled plugins of a type for a tenant
export async function invokePluginsOfType(
  tenantId: string,
  type: string,
  input: any,
  context: any = {}
) {
  const plugins = pluginRegistry.getPluginsForTenant(tenantId).filter(p => p.meta.type === type);
  const results = [];
  for (const plugin of plugins) {
    if (plugin.handle) {
      results.push(await plugin.handle(input, { tenantId, config: context.config || {}, ...context }));
    }
  }
  return results;
}
