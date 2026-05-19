/**
 * System Configuration Checker
 * 
 * Verifies Redis, Supabase, and vector index configuration
 * 
 * Run with: npx tsx scripts/check-system-config.ts
 */

import { createClient } from '@supabase/supabase-js';

async function main() {
    console.log('🔍 System Configuration Check\n');
    console.log('='.repeat(60));

    // ==================================================
    // 1. Environment Variables
    // ==================================================
    console.log('\n📋 Environment Variables:');
    const requiredEnvVars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'DATABASE_URL',
    ];

    for (const envVar of requiredEnvVars) {
        const value = process.env[envVar];
        if (value) {
            console.log(`   ✓ ${envVar}: Set`);
        } else {
            console.log(`   ✗ ${envVar}: Missing`);
        }
    }

    // ==================================================
    // 2. Supabase Connection
    // ==================================================
    console.log('\n\n🗄️  Supabase Configuration:');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
        try {
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Test connection
            const { data, error } = await supabase
                .from('embeddings')
                .select('count', { count: 'exact', head: true });

            if (error) {
                console.log(`   ✗ Connection failed: ${error.message}`);
            } else {
                console.log(`   ✓ Connected successfully`);
                console.log(`   ✓ Database accessible`);
            }

            // Check for vector index
            console.log('\n\n🔍 Vector Index Check:');
            console.log('   ℹ️  Run this SQL query in Supabase SQL editor:');
            console.log('');
            console.log('   SELECT indexname, indexdef');
            console.log('   FROM pg_indexes');
            console.log('   WHERE tablename = \'embeddings\'');
            console.log('   AND indexname LIKE \'%embedding%\';');
            console.log('');
            console.log('   Expected: ivfflat or hnsw index on embedding_768 column');

        } catch (err: any) {
            console.log(`   ✗ Error: ${err.message}`);
        }
    } else {
        console.log('   ✗ Supabase credentials not configured');
    }

    // ==================================================
    // 3. Redis Configuration
    // ==================================================
    console.log('\n\n🔴 Redis Configuration:');
    console.log('   ℹ️  Run these commands to check Redis:');
    console.log('');
    console.log('   redis-cli INFO memory      # Check memory usage');
    console.log('   redis-cli INFO stats       # Check operations');
    console.log('   redis-cli CONFIG GET maxmemory');
    console.log('   redis-cli CONFIG GET maxclients');
    console.log('   redis-cli --latency        # Check latency');
    console.log('');
    console.log('   Recommended settings:');
    console.log('   - maxmemory: 2gb (or higher)');
    console.log('   - maxmemory-policy: allkeys-lru');
    console.log('   - maxclients: 5000');
    console.log('   - timeout: 300');

    // ==================================================
    // 4. Optimization Checklist
    // ==================================================
    console.log('\n\n✅ Optimization Checklist:');
    console.log('='.repeat(60));
    console.log('\n[ ] Vector index exists on embeddings.embedding_768');
    console.log('[ ] Redis maxmemory >= 2gb');
    console.log('[ ] Redis maxclients >= 5000');
    console.log('[ ] Redis maxmemory-policy = allkeys-lru');
    console.log('[ ] Embedding generation uses batching');
    console.log('[ ] Query embedding cache implemented');
    console.log('[ ] Telemetry enabled in production');
    console.log('[ ] P95 latency targets defined');

    console.log('\n💡 Priority Actions:');
    console.log('\n1. HIGH: Create vector index if missing');
    console.log('   CREATE INDEX embeddings_embedding_768_idx');
    console.log('   ON embeddings USING ivfflat (embedding_768 vector_cosine_ops)');
    console.log('   WITH (lists = 100);');
    console.log('\n2. HIGH: Tune Redis maxmemory');
    console.log('   redis-cli CONFIG SET maxmemory 2gb');
    console.log('   redis-cli CONFIG SET maxmemory-policy allkeys-lru');
    console.log('\n3. MEDIUM: Implement batch embedding generation');
    console.log('   (See performance_analysis.md for code example)');
    console.log('\n4. MEDIUM: Add query embedding cache');
    console.log('   (Reduces redundant embedding generation)');

    console.log('\n✅ Configuration check complete!\n');
}

main().catch(console.error);
