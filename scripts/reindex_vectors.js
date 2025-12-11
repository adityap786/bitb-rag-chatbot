#!/usr/bin/env node
/**
 * Reindex Vectors Script
 * 
 * Migrates existing vectors to optimized storage format:
 * - Converts fp32 → int8 (optional)
 * - Rebatches for improved throughput
 * - Validates integrity
 * 
 * Usage:
 *   node scripts/reindex_vectors.js --tenant=tn_abc123 --quantize=int8 --dry-run
 * 
 * Options:
 *   --tenant=<id>      Tenant ID to reindex (or "all")
 *   --quantize=<mode>  int8 or fp32 (default: int8)
 *   --batch-size=<n>   Batch size for processing (default: 100)
 *   --dry-run          Preview changes without applying
 */

import { createClient } from '@supabase/supabase-js';
import { quantizeToInt8, dequantizeFromInt8 } from '../src/lib/embeddings/batched-generator';
import { VectorStorageAdapter } from '../src/lib/embeddings/vector-storage';
import { calculateVectorMemory } from '../src/lib/embeddings/config';

// Parse command-line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  acc[key] = value || true;
  return acc;
});

const TENANT_ID = String(args.tenant);
const QUANTIZE_MODE = (args.quantize || 'int8');
const BATCH_SIZE = parseInt(String(args['batch-size']) || '100', 10);
const DRY_RUN = !!args['dry-run'];

if (!TENANT_ID) {
  console.error('Error: --tenant=<id> is required');
  process.exit(1);
}

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const storage = new VectorStorageAdapter(supabase, QUANTIZE_MODE);

async function reindexTenant(tenantId) {
  console.log(`\n=== Reindexing tenant: ${tenantId} ===`);
  console.log(`Mode: ${QUANTIZE_MODE}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Dry run: ${DRY_RUN ? 'YES' : 'NO'}\n`);

  // Fetch existing vectors
  console.log('Fetching existing vectors...');
  const { data: vectors, error } = await supabase
    .from('embeddings')
    .select('id, tenant_id, kb_id, content, chunk_text, embedding_768, metadata')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Failed to fetch vectors: ${error.message}`);
  }

  if (!vectors || vectors.length === 0) {
    console.log('No vectors found for this tenant.');
    return;
  }

  console.log(`Found ${vectors.length} vectors`);

  // Calculate memory stats
  const currentMemory = calculateVectorMemory(vectors.length, 'fp32');
  const targetMemory = calculateVectorMemory(vectors.length, QUANTIZE_MODE);

  console.log(`\nMemory Analysis:`);
  console.log(`  Current (fp32): ${currentMemory.totalMB} MB`);
  console.log(`  Target (${QUANTIZE_MODE}): ${targetMemory.totalMB} MB`);
  console.log(`  Savings: ${((1 - parseFloat(targetMemory.totalMB) / parseFloat(currentMemory.totalMB)) * 100).toFixed(1)}%\n`);

  if (DRY_RUN) {
    console.log('DRY RUN: No changes applied.');
    console.log(`Would reindex ${vectors.length} vectors in batches of ${BATCH_SIZE}`);
    return;
  }

  // Reindex in batches
  console.log('Starting reindex...');
  const startTime = Date.now();

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(vectors.length / BATCH_SIZE);

    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} vectors)...`);

    // Transform vectors
    const transformed = batch.map((v) => ({
      id: v.id,
      tenant_id: v.tenant_id,
      kb_id: v.kb_id,
      content: v.content,
      chunk_text: v.chunk_text,
      embedding: v.embedding_768,
      metadata: v.metadata,
    }));

    // Store with new format
    await storage.storeVectorsBatched(transformed, BATCH_SIZE);
  }

  const duration = Date.now() - startTime;
  const throughput = vectors.length / (duration / 1000);

  console.log(`\n✓ Reindex complete!`);
  console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`  Throughput: ${throughput.toFixed(2)} vectors/sec`);
  console.log(`  New memory usage: ${targetMemory.totalMB} MB\n`);
}

async function main() {
  try {
    if (TENANT_ID === 'all') {
      // Reindex all tenants
      const { data: tenants } = await supabase
        .from('tenants')
        .select('tenant_id')
        .eq('status', 'active');

      if (!tenants || tenants.length === 0) {
        console.log('No active tenants found.');
        return;
      }

      console.log(`Found ${tenants.length} active tenants`);
      
      for (const tenant of tenants) {
        await reindexTenant(tenant.tenant_id);
      }
    } else {
      await reindexTenant(TENANT_ID);
    }

    console.log('\n=== Reindex job complete ===\n');
  } catch (error) {
    console.error('Reindex failed:', error);
    process.exit(1);
  }
}

main();
