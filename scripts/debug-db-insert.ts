
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    const tenantId = 'tn_debug_' + Date.now();
    console.log(`Testing insert for tenant: ${tenantId}`);

    // Create dummy vector (768 dim)
    const embedding = new Array(768).fill(0.1);

    // Payload matching the current BROKEN code in rag-pipeline.ts
    const brokenPayload = {
        kb_id: 'kb_debug_123',
        tenant_id: tenantId,
        content: 'debug content',
        chunk_text: 'debug content',
        embedding_768: embedding,
        metadata: { source: 'debug' }
    };

    console.log('Attempting insert with BROKEN payload (embedding_768, kb_id)...');
    const { error: error1 } = await supabase.from('embeddings').insert([brokenPayload]);
    if (error1) {
        console.log('❌ Expected Failure:', error1.message, error1.code, error1.details);
    } else {
        console.log('✅ Unexpected Success with broken payload');
    }

    // Payload matching the SCHEMA (001_create... + 2025...alter)
    const fixedPayload = {
        tenant_id: tenantId,
        chunk_text: 'debug content',
        embedding: embedding, // column name is 'embedding'
        metadata: { source: 'debug', kb_id: 'kb_debug_123' } // moved kb_id to metadata
    };

    console.log('Attempting insert with FIXED payload (embedding, kb_id in metadata)...');
    const { error: error2 } = await supabase.from('embeddings').insert([fixedPayload]);
    if (error2) {
        console.error('❌ Failed with FIXED payload:', error2.message);
    } else {
        console.log('✅ Success with FIXED payload');
    }
}

testInsert();
