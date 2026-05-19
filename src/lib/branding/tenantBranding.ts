import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function getTenantBranding(tenantId: string) {
  const { data, error } = await supabase
    .from('tenants')
    .select('branding')
    .eq('id', tenantId)
    .single();
  if (error) throw error;
  return data?.branding || {};
}

export async function setTenantBranding(tenantId: string, branding: any) {
  const { error } = await supabase
    .from('tenants')
    .update({ branding })
    .eq('id', tenantId);
  if (error) throw error;
}
