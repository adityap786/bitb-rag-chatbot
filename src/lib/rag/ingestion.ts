import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function ingestDocument({ tenantId, document, metadata }: { tenantId: string; document: string; metadata?: any }) {
  // 1. Store document with tenant_id
  const { data, error } = await supabase
    .from('documents')
    .insert([{ tenant_id: tenantId, content: document, metadata }])
    .select()
    .single();
  if (error) throw error;
  // 2. Trigger chunking, embedding, etc. (to be implemented)
  // ...
  return data;
}
