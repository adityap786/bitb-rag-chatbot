import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function listTenants() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name');
  if (error) throw error;
  return data;
}
