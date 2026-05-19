import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function retrieveDocuments({ tenantId, queryVector, topK = 5 }: { tenantId: string; queryVector: number[]; topK?: number }) {
  // Query embeddings for tenant
  const matches = await supabase.rpc('match_embeddings', {
    tenant_id: tenantId,
    query_embedding: queryVector,
    match_count: topK,
  });
  if (matches.error) throw matches.error;
  // Fetch chunk texts
  const chunkIds = matches.data.map((m: any) => m.chunk_id);
  const { data: chunks, error: chunkError } = await supabase
    .from('document_chunks')
    .select('id, text, document_id')
    .in('id', chunkIds);
  if (chunkError) throw chunkError;
  return chunks;
}
