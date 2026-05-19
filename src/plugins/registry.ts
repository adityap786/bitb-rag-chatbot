// Plugin interface and registry for composable multi-tenant RAG pipeline

export type PluginType = 'llm-tool' | 'webhook' | 'pipeline-step' | 'branding' | 'custom';

export interface PluginMeta {
  id: string; // unique plugin id
  name: string;
  description?: string;
  type: PluginType;
  version: string;
  author?: string;
  tenantScoped?: boolean; // true if plugin can be enabled per tenant
  configSchema?: object; // JSON schema for plugin config
}

export interface PluginContext {
  tenantId: string;
  config: any;
  // ...other context (user, request, etc.)
}

export interface Plugin {
  meta: PluginMeta;
  // Called when plugin is loaded for a tenant
  onLoad?(ctx: PluginContext): Promise<void> | void;
  // Called when plugin is unloaded for a tenant
  onUnload?(ctx: PluginContext): Promise<void> | void;
  // Main handler (for LLM tools, pipeline steps, etc.)
  handle?(input: any, ctx: PluginContext): Promise<any>;
}

export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();
  private tenantPlugins: Map<string, Set<string>> = new Map(); // tenantId -> plugin ids

  register(plugin: Plugin) {
    if (this.plugins.has(plugin.meta.id)) throw new Error('Plugin already registered');
    this.plugins.set(plugin.meta.id, plugin);
  }

  enableForTenant(pluginId: string, tenantId: string) {
    if (!this.plugins.has(pluginId)) throw new Error('Plugin not found');
    if (!this.tenantPlugins.has(tenantId)) this.tenantPlugins.set(tenantId, new Set());
    this.tenantPlugins.get(tenantId)!.add(pluginId);
  }

  disableForTenant(pluginId: string, tenantId: string) {
    this.tenantPlugins.get(tenantId)?.delete(pluginId);
  }

  getPluginsForTenant(tenantId: string): Plugin[] {
    const ids = this.tenantPlugins.get(tenantId) || new Set();
    return Array.from(ids).map(id => this.plugins.get(id)!).filter(Boolean);
  }

  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }
}

export const pluginRegistry = new PluginRegistry();
