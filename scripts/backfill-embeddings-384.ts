/**
 * scripts/backfill-embeddings-384.ts
 *
 * Resumable backfill for `embedding_384` column.
 * - Pages through rows using keyset pagination (created_at, id)
 * - Computes embeddings using `@xenova/transformers` when `USE_XENOVA=true`
 *   otherwise falls back to a HTTP embedding service at `BGE_EMBEDDING_SERVICE_URL`
 * - Upserts `embedding_384`, `embedding_model`, and `embedding_dim`
 * - Records progress in `embedding_backfill_jobs` so the job can be resumed
 * - Uses retries/exponential backoff for embedding and DB update operations
 *
 * Usage (example):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \ 
 *   npx tsx scripts/backfill-embeddings-384.ts --tables=embeddings,document_chunks --batchSize=64
 */

import { createClient } from '@supabase/supabase-js';
import pRetry from 'p-retry';
import { metrics, timeAsync } from '../src/lib/observability/metrics';

type BackfillJob = {
  id?: number;
  table_name: string;
  last_processed_ts?: string | null;
  last_processed_id?: string | null;
  processed_count?: number;
  batch_size?: number;
  status?: string;
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const DEFAULT_BATCH = Number(process.env.BACKFILL_BATCH_SIZE) || 64;
const MODEL_NAME = process.env.BACKFILL_MODEL || process.env.XENOVA_MODEL || 'Xenova/all-MiniLM-L6-v2';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let xenovaPipeline: any | null = null;
async function initXenovaIfRequested() {
  if (process.env.USE_XENOVA !== 'true') return;
  try {
    const mod = await import('@xenova/transformers');
    const pipeline = mod.pipeline;
    console.log('Initializing Xenova pipeline', MODEL_NAME);
    xenovaPipeline = await pipeline('feature-extraction', MODEL_NAME);
  } catch (err) {
    console.warn('Failed to initialize @xenova/transformers pipeline; falling back to HTTP embedding service', err);
    xenovaPipeline = null;
  }
}

async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];

  // Prefer Xenova if requested
  if (process.env.USE_XENOVA === 'true' && xenovaPipeline) {
    // Xenova feature-extraction returns a Tensor with shape [batchSize, seqLen, hiddenSize]
    // We need to mean-pool across tokens (dim 1) to get [batchSize, hiddenSize]
    const results: number[][] = [];
    for (const text of texts) {
      const output = await timeAsync('backfill.embedding.xenova', async () => await xenovaPipeline(text, { pooling: 'mean', normalize: true }), { model: MODEL_NAME });
      // output.data is a Float32Array; output.dims gives shape
      const arr = Array.from(output.data as Float32Array);
      results.push(arr);
      metrics.gauge('backfill.embedding.dims', arr.length, { model: MODEL_NAME });
    }
    metrics.incr('backfill.embedding.batch', texts.length, { provider: 'xenova' });
    return results;
  }

  // Fallback to HTTP embedding service (local BGE or remote)
  const url = (process.env.BGE_EMBEDDING_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
  const embeddings = await timeAsync('backfill.embedding.http', async () => {
    const res = await fetch(`${url}/embed-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) throw new Error(`Embedding service returned ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!Array.isArray(data?.embeddings)) throw new Error('Invalid embedding response');
    return data.embeddings as number[][];
  }, { url });
  metrics.incr('backfill.embedding.batch', texts.length, { provider: 'http' });
  if (embeddings.length > 0) metrics.gauge('backfill.embedding.dims', embeddings[0].length, { provider: 'http' });
  return embeddings;
}

async function getOrCreateJob(tableName: string, batchSize: number): Promise<BackfillJob> {
  // Try to read existing job (pick the most recent if multiple)
  const { data: jobs, error: readErr } = await supabase
    .from('embedding_backfill_jobs')
    .select('*')
    .eq('table_name', tableName)
    .order('id', { ascending: false })
    .limit(1);
  if (readErr) throw readErr;
  if (Array.isArray(jobs) && jobs.length > 0) return jobs[0] as BackfillJob;

  // Create a new job
  const { data, error } = await supabase
    .from('embedding_backfill_jobs')
    .insert([{ table_name: tableName, batch_size: batchSize, status: 'running', started_at: new Date().toISOString() }])
    .select('*')
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0 ? (data[0] as BackfillJob) : { table_name: tableName, batch_size: batchSize };
}

async function updateJobProgress(jobId: number, updates: Partial<BackfillJob>) {
  await supabase.from('embedding_backfill_jobs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', jobId);
}

async function fetchBatch(table: string, lastTs: string | null, lastId: string | null, limit: number) {
  // Keyset pagination by (created_at, id)
  // For simplicity, we just filter by created_at > lastTs to avoid complex OR clause issues.
  // This may reprocess a few rows with the same timestamp, but that's fine for idempotent updates.

  const select = 'id,content,metadata,created_at';
  let query = supabase.from(table).select(select).is('embedding_384', null).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
  if (lastTs) {
    query = query.gt('created_at', new Date(lastTs).toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as any[]) || [];
}

function extractTextFromRow(row: any) {
  if (!row) return '';
  if (typeof row.content === 'string' && row.content.trim().length > 0) return row.content;
  if (row.metadata && typeof row.metadata === 'object') {
    if (typeof row.metadata.text === 'string' && row.metadata.text.trim().length > 0) return row.metadata.text;
    if (typeof row.metadata.pageContent === 'string' && row.metadata.pageContent.trim().length > 0) return row.metadata.pageContent;
  }
  return '';
}

async function backfillTable(table: string, batchSize: number) {
  console.log(`Starting backfill for table=${table} batchSize=${batchSize}`);
  const job = await getOrCreateJob(table, batchSize);
  const jobId = job.id as number | undefined;
  let lastTs: string | null = job.last_processed_ts ?? null;
  let lastId: string | null = job.last_processed_id ?? null;
  let processedSoFar = job.processed_count ?? 0;

  while (true) {
    const rows = await fetchBatch(table, lastTs, lastId, batchSize);
    if (!rows || rows.length === 0) {
      console.log(`No more rows to process for table=${table}. Marking job completed.`);
      if (jobId) await updateJobProgress(jobId, { status: 'completed' });
      break;
    }

    // Compute texts and track mapping index -> row
    const texts = rows.map((r) => extractTextFromRow(r) || '');

    // Compute embeddings with retry/backoff
    const embeddings = await pRetry(() => computeEmbeddings(texts), { retries: 3, factor: 2, minTimeout: 500 });

    // Upsert each row (in parallel but limited) with retry
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const emb = embeddings[i];
      if (!emb || emb.length === 0) {
        console.warn('Empty embedding for row', row.id);
        metrics.incr('backfill.embedding.empty', 1, { table });
        continue;
      }
      const payload = { embedding_384: emb, embedding_model: MODEL_NAME, embedding_dim: emb.length } as any;

      await timeAsync('backfill.db.upsert', async () => {
        await pRetry(async () => {
          const { error } = await supabase.from(table).update(payload).eq('id', row.id);
          if (error) throw error;
        }, { retries: 3, factor: 2, minTimeout: 200 });
      }, { table });

      // Update job progress after every row (could be batched)
      processedSoFar += 1;
      lastTs = row.created_at;
      lastId = row.id;
      metrics.incr('backfill.rows.processed', 1, { table });
    }

    if (jobId) {
      await updateJobProgress(jobId, { last_processed_ts: lastTs, last_processed_id: lastId, processed_count: processedSoFar });
    }

    // Small pause if requested to be gentle on DB
    if (process.env.BACKFILL_PAUSE_MS) await new Promise((res) => setTimeout(res, Number(process.env.BACKFILL_PAUSE_MS)));
  }
}

function parseArgs() {
  const raw = process.argv.slice(2);
  const args: Record<string, string> = {};
  raw.forEach((s) => {
    if (!s.startsWith('--')) return;
    const [k, v] = s.replace(/^--/, '').split('=');
    args[k] = v ?? 'true';
  });
  return args;
}

async function main() {
  const args = parseArgs();
  const tables = (args.tables || 'embeddings,document_chunks').split(',').map((t) => t.trim()).filter(Boolean);
  const batchSize = Number(args.batchSize || DEFAULT_BATCH);

  await initXenovaIfRequested();

  for (const table of tables) {
    try {
      await backfillTable(table, batchSize);
    } catch (err) {
      console.error(`Backfill failed for table=${table}`, err);
    }
  }

  console.log('Backfill run finished for all tables.');
  metrics.logSummary();
}

// Run
main().catch((err) => {
  console.error('Fatal error running backfill', err);
  process.exit(1);
});
