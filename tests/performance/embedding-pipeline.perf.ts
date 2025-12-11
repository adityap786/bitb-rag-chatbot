/**
 * Performance test suite for embedding pipeline
 * 
 * Run with: npm run test:perf
 */

import { generateEmbeddingsBatched } from '@/lib/embeddings/batched-generator';
import { VectorStorageAdapter } from '@/lib/embeddings/vector-storage';
import { createClient } from '@supabase/supabase-js';
import { calculateVectorMemory, BENCHMARK_DATA } from '@/lib/embeddings/config';

// Test data generator
function generateTestTexts(count: number): string[] {
  const samples = [
    'The quick brown fox jumps over the lazy dog.',
    'Machine learning models require large datasets for training.',
    'Enterprise software solutions must prioritize security and scalability.',
    'Cloud computing enables flexible infrastructure deployment.',
    'Natural language processing transforms text into structured data.',
  ];

  return Array.from({ length: count }, (_, i) => 
    `${samples[i % samples.length]} Document ${i + 1}.`
  );
}

async function benchmarkEmbedding(
  textCount: number,
  config: {
    batchSize: number;
    maxParallel: number;
    quantize: boolean;
  }
) {
  console.log(`\n=== Embedding Benchmark: ${textCount} texts ===`);
  console.log(`Config: batch=${config.batchSize}, parallel=${config.maxParallel}, quantize=${config.quantize}`);

  const texts = generateTestTexts(textCount);
  const startTime = Date.now();

  try {
    const embeddings = await generateEmbeddingsBatched(texts, config);
    const duration = Date.now() - startTime;
    const throughput = textCount / (duration / 1000);

    const quantMode = config.quantize ? 'int8' : 'fp32';
    const memory = calculateVectorMemory(textCount, quantMode);

    console.log(`✓ Complete in ${(duration / 1000).toFixed(2)}s`);
    console.log(`  Throughput: ${throughput.toFixed(2)} vectors/sec`);
    console.log(`  Memory: ${memory.totalMB} MB (${quantMode})`);
    console.log(`  Avg per vector: ${(duration / textCount).toFixed(0)}ms`);

    return {
      textCount,
      duration,
      throughput,
      memoryMB: memory.totalMB,
      quantization: quantMode,
    };
  } catch (error) {
    console.error(`✗ Failed:`, error);
    throw error;
  }
}

async function benchmarkStorage(vectorCount: number, batchSize: number) {
  console.log(`\n=== Storage Benchmark: ${vectorCount} vectors ===`);
  console.log(`Batch size: ${batchSize}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials not set');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const storage = new VectorStorageAdapter(supabase, 'int8');

  // Generate test vectors
  const vectors = Array.from({ length: vectorCount }, (_, i) => ({
    tenant_id: 'tn_perftest',
    kb_id: `kb_test_${i}`,
    content: `Test document ${i}`,
    embedding: new Array(768).fill(0).map(() => Math.random() * 2 - 1),
    metadata: { test: true, index: i },
  }));

  const startTime = Date.now();

  try {
    await storage.storeVectorsBatched(vectors, batchSize);
    const duration = Date.now() - startTime;
    const throughput = vectorCount / (duration / 1000);

    console.log(`✓ Complete in ${(duration / 1000).toFixed(2)}s`);
    console.log(`  Throughput: ${throughput.toFixed(2)} vectors/sec`);
    console.log(`  Avg per batch: ${(duration / (vectorCount / batchSize)).toFixed(0)}ms`);

    // Cleanup
    await supabase.from('embeddings').delete().eq('tenant_id', 'tn_perftest');

    return {
      vectorCount,
      duration,
      throughput,
      batchSize,
    };
  } catch (error) {
    console.error(`✗ Failed:`, error);
    throw error;
  }
}

async function runComparisonTests() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Embedding Pipeline Performance Test Suite      ║');
  console.log('╚══════════════════════════════════════════════════╝');

  console.log('\n📊 Benchmark Data (Reference):');
  console.log(JSON.stringify(BENCHMARK_DATA, null, 2));

  const results = [];

  // Test 1: Small batch (100 texts)
  results.push(
    await benchmarkEmbedding(100, {
      batchSize: 32,
      maxParallel: 2,
      quantize: true,
    })
  );

  // Test 2: Medium batch (1000 texts)
  results.push(
    await benchmarkEmbedding(1000, {
      batchSize: 64,
      maxParallel: 4,
      quantize: true,
    })
  );

  // Test 3: Large batch (5000 texts) - int8
  results.push(
    await benchmarkEmbedding(5000, {
      batchSize: 64,
      maxParallel: 4,
      quantize: true,
    })
  );

  // Test 4: Large batch (5000 texts) - fp32 comparison
  results.push(
    await benchmarkEmbedding(5000, {
      batchSize: 64,
      maxParallel: 4,
      quantize: false,
    })
  );

  // Storage benchmarks
  await benchmarkStorage(500, 50);
  await benchmarkStorage(1000, 100);

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Summary                                         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  console.table(results);

  console.log('\n✓ Performance tests complete!\n');
}

// Run if called directly
if (require.main === module) {
  runComparisonTests().catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export { benchmarkEmbedding, benchmarkStorage, runComparisonTests };
