/**
 * Simple Performance Test Script
 * 
 * Run with: npx tsx scripts/test-rag-performance.ts
 * 
 * This script tests the instrumented RAG pipeline and prints performance metrics
 */

import { chunkText } from '../src/lib/trial/rag-pipeline';
import { metrics } from '../src/lib/rag/performance-metrics';

async function main() {
    console.log('🔍 Testing RAG Performance Metrics\n');

    // Test 1: Chunking performance
    console.log('Test 1: Chunking 100 documents...');
    const docs = Array.from({ length: 100 }, (_, i) =>
        `Document ${i} - ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50)
    );

    const start = Date.now();
    const allChunks = docs.flatMap(doc => chunkText(doc, 512, 128));
    const elapsed = Date.now() - start;

    console.log(`  ✓ Chunked 100 docs into ${allChunks.length} chunks in ${elapsed}ms`);
    console.log(`  ✓ Average: ${(elapsed / 100).toFixed(2)}ms per document\n`);

    // Test 2: Check telemetry collection
    console.log('Test 2: Checking telemetry data...');
    const stats = metrics.dump();

    if (Object.keys(stats).length > 0) {
        console.log('  ✓ Telemetry is collecting data:');
        for (const [name, avg] of Object.entries(stats)) {
            console.log(`    - ${name}: ${avg.toFixed(2)}ms average`);
        }
    } else {
        console.log('  ℹ️  No telemetry data yet (run embedding/search operations to collect)');
    }

    console.log('\n📊 Detailed Stats:');
    metrics.logStats();

    console.log('✅ Performance test complete!\n');
    console.log('💡 To collect more metrics, run:');
    console.log('   1. Start the dev server: npm run dev');
    console.log('   2. Upload documents via onboarding flow');
    console.log('   3. Run queries via the playground');
    console.log('   4. Check server logs for performance metrics\n');
}

main().catch(console.error);
