// SupabaseKeywordIndex: Implements KeywordIndex for Supabase Postgres full-text search
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { KeywordIndex } from './retrieval-pipeline';

export interface SupabaseKeywordIndexOptions {
  supabaseUrl: string;
  supabaseKey: string;
  tableName?: string;
}

export class SupabaseKeywordIndex implements KeywordIndex {
  private client: SupabaseClient;
  private table: string;

  constructor(options: SupabaseKeywordIndexOptions) {
    this.client = createClient(options.supabaseUrl, options.supabaseKey);
    this.table = options.tableName ?? 'documents';
  }

  async upsertChunks(tenantId: string, chunks: any[]): Promise<void> {
    const rows = chunks.map(chunk => ({
      tenant_id: tenantId,
      content: chunk.content,
      metadata: chunk.metadata,
    }));
    await this.client.from(this.table).upsert(rows, { onConflict: 'tenant_id,content' });
  }

  async query(tenantId: string, query: string, topK: number, filter?: Record<string, any>): Promise<any[]> {
    // Use Postgres full-text search
    let q = this.client.from(this.table).select('*').eq('tenant_id', tenantId);
    if (query) {
      q = q.textSearch('content', query, { type: 'plain' });
    }
    if (filter) {
      for (const [k, v] of Object.entries(filter)) {
        q = q.eq(k, v);
      }
    }
    const { data, error } = await q.limit(topK);
    if (error) throw error;
    return data;
  }
}
