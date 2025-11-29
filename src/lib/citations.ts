/**
 * Citation utilities: extract and persist citations from RAG pipeline responses
 */

import { createLazyServiceClient } from './supabase-client';
import type { Citation as CitationType } from '../types/multi-plan.js';

export type CitationInsert = Partial<Omit<CitationType, 'id' | 'created_at' | 'updated_at'>> & {
  tenant_id: string;
};

/**
 * Map rag pipeline sources to citation records suitable for DB insertion
 */
export function mapRagSourcesToCitations(sources: any[], opts: { tenantId: string; conversationId?: string | null; messageId?: string | null; } = { tenantId: '' }): CitationInsert[] {
  return (sources || []).map((s: any) => ({
    tenant_id: opts.tenantId,
    conversation_id: opts.conversationId ?? undefined,
    message_id: opts.messageId ?? undefined,
    source_title: s.title || (s.metadata && s.metadata.title) || null,
    source_url: (s.metadata && (s.metadata.source_url || s.metadata.url)) || null,
    excerpt: s.chunk ? (typeof s.chunk === 'string' ? s.chunk.substring(0, 2000) : JSON.stringify(s.chunk).substring(0, 2000)) : null,
    confidence_score: typeof s.similarity === 'number' ? Math.max(0, Math.min(1, s.similarity)) : 0.5,
    metadata: s.metadata || {},
  }));
}

/**
 * Persist an array of citation records into the `citations` table.
 * Returns success boolean and optional error for logging.
 */
export async function trackCitations(records: CitationInsert[]): Promise<{ success: boolean; error?: any }> {
  if (!records || records.length === 0) return { success: true };
  const supabase = createLazyServiceClient();
  try {
    const { error } = await supabase.from('citations').insert(records as any);
    if (error) {
      console.warn('[citations] insert error', error);
      return { success: false, error };
    }
    return { success: true };
  } catch (err) {
    console.warn('[citations] unexpected error', err instanceof Error ? err.message : err);
    return { success: false, error: err };
  }
}

export default {
  mapRagSourcesToCitations,
  trackCitations,
};
