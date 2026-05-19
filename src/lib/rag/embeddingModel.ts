import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function selectEmbeddingModel(tenantId: string): Promise<string> {
  // Fetch tenant config for embedding model selection
  const { data, error } = await supabase
    .from('tenants')
    .select('features')
    .eq('id', tenantId)
    .single();
  if (error) throw error;
  // Default to 'bge-base' if not set
  return data?.features?.embeddingModel || 'bge-base';
}
