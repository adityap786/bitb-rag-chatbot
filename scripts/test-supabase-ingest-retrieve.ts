// Test script: Ingest and retrieve using Supabase-backed pipeline
import 'dotenv/config';
import { SupabaseVectorStore } from '../src/lib/rag/supabase-vector-store.js';
import { SupabaseKeywordIndex } from '../src/lib/rag/supabase-keyword-index.js';
import { RetrievalPipeline } from '../src/lib/rag/retrieval-pipeline.js';
import { SentenceSplitter } from '../src/lib/rag/llamaindex-chunking.js';
import { generateEmbedding } from '../src/lib/rag/embedding-generator.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tenantId = 'tenant_demo';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

const vectorStore = new SupabaseVectorStore({ supabaseUrl, supabaseKey });
const keywordIndex = new SupabaseKeywordIndex({ supabaseUrl, supabaseKey });
const chunker = new SentenceSplitter({ chunkSize: 20 });
const pipeline = new RetrievalPipeline({ chunker, vectorStore, keywordIndex, tenantId });

async function main() {
  // Ingest a document
  const doc = {
    content: 'Supabase is a backend as a service. It provides a Postgres database, authentication, and storage. It supports vector search and full-text search.',
    metadata: { source: 'test' },
  };
  // Generate embeddings for each chunk (skip parsing for now, let pipeline handle)
  await pipeline.ingest(doc);
  console.log('Ingested document.');

  // Retrieve with a query
  const query = 'What is Supabase?';
  const queryEmbedding = await generateEmbedding(query);
  const results = await pipeline.retrieve(query, 5, { queryEmbedding });
  console.log('Retrieved:', results);
}

main().catch(console.error);
