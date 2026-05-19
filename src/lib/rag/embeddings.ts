import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function storeEmbedding({ tenantId, chunkId, embedding }: { tenantId: string; chunkId: string; embedding: number[] }) {
  const { error } = await supabase
    .from('embeddings')
    .insert([{ tenant_id: tenantId, chunk_id: chunkId, embedding }]);
  if (error) throw error;
}

export async function queryEmbeddings({ tenantId, vector, topK = 5 }: { tenantId: string; vector: number[]; topK?: number }) {
  // Use pgvector similarity search
  const { data, error } = await supabase.rpc('match_embeddings', {
    tenant_id: tenantId,
    query_embedding: vector,
    match_count: topK,
  });
  if (error) throw error;
  return data;
}
