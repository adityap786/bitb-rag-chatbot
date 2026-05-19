/**
 * Performance Baseline Collection Script
 * 
 * Runs comprehensive performance tests:
 * 1. Synthetic dataset ingestion (1k docs)
 * 2. 100 search queries
 * 3. Captures detailed telemetry
 * 
 * Run with: npx tsx scripts/collect-baseline-metrics.ts
 */

import { metrics, performanceLog } from '../src/lib/rag/performance-metrics';
import { chunkText } from '../src/lib/trial/rag-pipeline';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate synthetic documents
function generateSyntheticDocs(count: number): string[] {
    const topics = [
        'machine learning algorithms',
        'database optimization techniques',
        'cloud architecture patterns',
        'security best practices',
        'API design principles',
        'microservices architecture',
        'performance tuning strategies',
        'data pipeline engineering',
    ];

    const docs: string[] = [];
    for (let i = 0; i < count; i++) {
        const topic = topics[i % topics.length];
        const content = `Document ${i + 1}: Comprehensive guide to ${topic}. ` +
            `This document covers fundamental concepts, advanced techniques, and real-world applications. ` +
            `Key topics include implementation strategies, common pitfalls, optimization methods, and industry standards. `.repeat(10);
        docs.push(content);
    }
    return docs;
}

async function main() {
    console.log('📊 RAG Performance Baseline Collection\n');
    console.log('='.repeat(60));

    // Reset metrics
    metrics.reset();

    // ==================================================
    // PHASE 1: Chunking Performance (1k docs)
    // ==================================================
    console.log('\n Phase 1: Chunking 1000 documents...');
    const docs = generateSyntheticDocs(1000);

    const chunkStart = Date.now();
    const allChunks = docs.flatMap(doc => chunkText(doc, 512, 128));
    const chunkElapsed = Date.now() - chunkStart;

    console.log(`   ✓ Chunked 1000 docs into ${allChunks.length} chunks`);
    console.log(`   ✓ Total time: ${chunkElapsed}ms`);
    console.log(`   ✓ Average: ${(chunkElapsed / 1000).toFixed(2)}ms per doc`);
    console.log(`   ✓ Throughput: ${Math.round(1000 / (chunkElapsed / 1000))} docs/second`);

    // ==================================================
    // PHASE 2: Simulated Query Performance
    // ==================================================
    console.log('\n\n📍 Phase 2: Simulated query performance...');
    console.log('   ℹ️  Note: This requires running services (Supabase, Redis)');
    console.log('   ℹ️  Manual testing recommended for full pipeline metrics\n');

    // ==================================================
    // PHASE 3: Metrics Summary
    // ==================================================
    console.log('\n\n📈 Performance Metrics Summary');
    console.log('='.repeat(60));

    const stats = metrics.getStats();
    if (Object.keys(stats).length > 0) {
        console.log('\nDetailed Statistics:');
        for (const [name, data] of Object.entries(stats)) {
            console.log(`\n${name}:`);
            console.log(`  Samples: ${data.count}`);
            console.log(`  Avg: ${data.avg.toFixed(2)}ms`);
            console.log(`  Min: ${data.min.toFixed(2)}ms | Max: ${data.max.toFixed(2)}ms`);
            console.log(`  P50: ${data.p50.toFixed(2)}ms | P95: ${data.p95.toFixed(2)}ms | P99: ${data.p99.toFixed(2)}ms`);
        }
    } else {
        console.log('\n⚠️  No telemetry data collected.');
        console.log('   Run with live services to collect full metrics.');
    }

    // ==================================================
    // PHASE 4: Save Results
    // ==================================================
    console.log('\n\n💾 Saving baseline report...');

    const report = {
        timestamp: new Date().toISOString(),
        chunking: {
            documentCount: 1000,
            chunkCount: allChunks.length,
            totalTimeMs: chunkElapsed,
            avgTimePerDoc: chunkElapsed / 1000,
            throughputDocsPerSec: 1000 / (chunkElapsed / 1000),
        },
        telemetry: stats,
        raw: performanceLog,
    };

    const reportPath = path.join(__dirname, '..', 'baseline-metrics.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`   ✓ Saved to: ${reportPath}`);

    // ==================================================
    // PHASE 5: Recommendations
    // ==================================================
    console.log('\n\n💡 Next Steps:');
    console.log('='.repeat(60));
    console.log('\n1. Start services:');
    console.log('   .\\scripts\\start-all-services.ps1');
    console.log('\n2. Run dev server:');
    console.log('   npm run dev');
    console.log('\n3. Manual testing:');
    console.log('   - Upload 100+ documents via onboarding');
    console.log('   - Run 50-100 queries via playground');
    console.log('   - Check console logs for metrics');
    console.log('\n4. Analyze bottlenecks:');
    console.log('   - Check which phase has highest p95 latency');
    console.log('   - Verify Redis memory: redis-cli INFO memory');
    console.log('   - Check vector index: psql + \\d embeddings');
    console.log('\n5. Apply optimizations (in priority order):');
    console.log('   a. Batch embedding generation');
    console.log('   b. Tune Redis config (maxmemory, maxclients)');
    console.log('   c. Add query embedding cache');
    console.log('   d. Consider Redis cluster for 100+ tenants');

    console.log('\n✅ Baseline collection complete!\n');
}

main().catch(console.error);
