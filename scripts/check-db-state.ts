import { createClient } from '@supabase/supabase-js';

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    process.exit(2);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log('Checking `embeddings` table columns...');
  try {
    const colChecks: Array<{ name: string; exists: boolean; message?: string }> = [];
    // Check embedding_384
    try {
      const { error } = await supabase.from('embeddings').select('embedding_384').limit(1);
      colChecks.push({ name: 'embedding_384', exists: !error, message: error?.message });
    } catch (e: any) {
      colChecks.push({ name: 'embedding_384', exists: false, message: e.message });
    }

    // Check embedding_1536_archive
    try {
      const { error } = await supabase.from('embeddings').select('embedding_1536_archive').limit(1);
      colChecks.push({ name: 'embedding_1536_archive', exists: !error, message: error?.message });
    } catch (e: any) {
      colChecks.push({ name: 'embedding_1536_archive', exists: false, message: e.message });
    }

    // Also check legacy `embedding` column presence
    try {
      const { error } = await supabase.from('embeddings').select('embedding').limit(1);
      colChecks.push({ name: 'embedding (legacy)', exists: !error, message: error?.message });
    } catch (e: any) {
      colChecks.push({ name: 'embedding (legacy)', exists: false, message: e.message });
    }

    for (const c of colChecks) console.log(`  - ${c.name}: ${c.exists ? 'FOUND' : 'MISSING'}${c.message ? ' (' + c.message + ')' : ''}`);
  } catch (err: any) {
    console.error('Failed checking columns:', err.message);
  }

  console.log('\nChecking indexes on `embeddings` via pg_indexes view...');
  try {
    const { data, error } = await supabase.from('pg_indexes').select('indexname,indexdef').eq('tablename', 'embeddings');
    if (error) {
      console.warn('pg_indexes view not accessible via PostgREST or returned error:', error.message);
    } else {
      const names = (data || []).map((r: any) => r.indexname);
      console.log('  - Indexes found:', names.length ? names.join(', ') : '(none)');
      const has384 = (data || []).some((r: any) => (r.indexdef || '').includes('embedding_384') || (r.indexname || '').includes('embedding_384'));
      console.log('  - Index on embedding_384 present:', has384);
    }
  } catch (err: any) {
    console.warn('Index check error:', err.message);
  }

  console.log('\nChecking RPC `match_embeddings_by_tenant_384` is callable...');
  try {
    const vec = Array(384).fill(0.001);
    const { data, error } = await supabase.rpc('match_embeddings_by_tenant_384', { query_embedding: vec, match_count: 1, match_tenant_id: null } as any as object);
    if (error) {
      console.log('  - RPC call error:', error.message);
    } else {
      console.log('  - RPC callable, returned rows:', (data || []).length);
    }
  } catch (err: any) {
    console.log('  - RPC call exception:', err.message);
  }

  console.log('\nDone. If everything is FOUND and RPC is callable, your SQL snippets applied successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error checking DB state:', err?.message || err);
  process.exit(3);
});
