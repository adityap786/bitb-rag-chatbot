#!/usr/bin/env npx tsx
/**
 * Debug script to test match_embeddings_by_tenant RPC directly
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

console.log('=== Environment Check ===');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET (' + process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10) + '...)' : 'MISSING');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

console.log('Using URL:', url.substring(0, 30) + '...');

const supabase = createClient(url, key);

async function main() {
    // Step 1: Get embeddings count
    console.log('\n=== Step 1: Check Embeddings ===');
    const { count, error: countError } = await supabase
        .from('embeddings')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error('❌ Count error:', countError.message);
    } else {
        console.log('✅ Embeddings count:', count);
    }

    // Step 2: Get a sample embedding
    console.log('\n=== Step 2: Get Sample Embedding ===');
    const { data: embs, error: embError } = await supabase
        .from('embeddings')
        .select('tenant_id, id, embedding_768, content')
        .not('embedding_768', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

    if (embError) {
        console.error('❌ Embeddings error:', embError.message);
        return;
    }

    if (!embs || embs.length === 0) {
        console.log('⚠️ No embeddings with embedding_768 found');
        return;
    }

    const emb = embs[0];
    console.log('✅ Found embedding:');
    console.log('   Tenant:', emb.tenant_id);
    console.log('   ID:', emb.id);
    console.log('   embedding_768 dims:', emb.embedding_768?.length);
    console.log('   Content preview:', emb.content?.substring(0, 80) + '...');

    // Step 3: Test RPC
    console.log('\n=== Step 3: Test match_embeddings_by_tenant RPC ===');
    const startTime = Date.now();
    const { data, error } = await supabase.rpc('match_embeddings_by_tenant', {
        query_embedding: emb.embedding_768,
        match_count: 3,
        p_tenant_id: emb.tenant_id
    });
    const latency = Date.now() - startTime;

    if (error) {
        console.error('❌ RPC Error:');
        console.error('   Message:', error.message);
        console.error('   Details:', error.details);
        console.error('   Hint:', error.hint);
        console.error('   Code:', error.code);
    } else {
        console.log('✅ RPC Success! Latency:', latency, 'ms');
        console.log('   Results:', data?.length);
        if (data && data.length > 0) {
            console.log('   First result:');
            console.log('     ID:', data[0].id);
            console.log('     Similarity:', data[0].similarity);
            console.log('     Content:', data[0].content?.substring(0, 80) + '...');
        }
    }

    console.log('\n=== Done ===');
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
