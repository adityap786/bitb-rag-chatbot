import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function getTenantPluginConfig(tenantId: string) {
  const { data, error } = await supabase
    .from('plugin_tenant_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('enabled', true);
  if (error) throw error;
  return data;
}

export async function setTenantPluginConfig(tenantId: string, pluginId: string, config: any, enabled = true) {
  const { error } = await supabase
    .from('plugin_tenant_config')
    .upsert({ tenant_id: tenantId, plugin_id: pluginId, config, enabled }, { onConflict: ['tenant_id', 'plugin_id'] });
  if (error) throw error;
}
