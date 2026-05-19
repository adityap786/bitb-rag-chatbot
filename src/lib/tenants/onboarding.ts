import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function createTenant({ name, branding, features }: { name: string; branding?: any; features?: any }) {
  // 1. Create tenant row
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert([{ name, branding, features }])
    .select()
    .single();
  if (tenantError) throw tenantError;
  // 2. Create default config, resources, etc. (extend as needed)
  // ...
  return tenant;
}
