import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function chunkDocument({ tenantId, documentId, chunkSize = 512, overlap = 64 }: { tenantId: string; documentId: string; chunkSize?: number; overlap?: number }) {
  // 1. Fetch document
  const { data: doc, error } = await supabase
    .from('documents')
    .select('content')
    .eq('id', documentId)
    .eq('tenant_id', tenantId)
    .single();
  if (error) throw error;
  // 2. Chunk content
  const content = doc.content;
  const chunks = [];
  for (let i = 0; i < content.length; i += chunkSize - overlap) {
    chunks.push(content.slice(i, i + chunkSize));
  }
  // 3. Store chunks
  const { error: chunkError } = await supabase
    .from('document_chunks')
    .insert(chunks.map(text => ({ tenant_id: tenantId, document_id: documentId, text })));
  if (chunkError) throw chunkError;
  return chunks;
}
