/**
 * Isolated test: Verify embeddings table insert works with correct schema
 * This bypasses the full pipeline to test just the DB insert logic
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
    console.log('Loaded .env.local');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEmbeddingsInsert() {
    console.log('\n🧪 Testing embeddings table insert...\n');

    // Step 1: Create a test tenant
    // Generate valid tenant_id: tn_ + 32 hex chars
    const hexChars = 'abcdef0123456789';
    let hex32 = '';
    for (let i = 0; i < 32; i++) {
        hex32 += hexChars[Math.floor(Math.random() * 16)];
    }
    const testTenantId = `tn_${hex32}`;
    console.log(`1. Creating test tenant: ${testTenantId}`);

    const { error: tenantError } = await supabase.from('tenants').insert({
        tenant_id: testTenantId,
        email: `test-${Date.now()}@example.com`,
        name: 'E2E Test Tenant',
        status: 'active',
        plan: 'trial',
    });

    if (tenantError) {
        console.error('❌ Failed to create tenant:', tenantError.message);
        return;
    }
    console.log('   ✅ Tenant created');

    // Step 2: Create a knowledge base entry (required for FK constraint)
    const kbId = crypto.randomUUID();
    console.log(`2. Creating knowledge base entry: ${kbId}`);

    const { error: kbError } = await supabase.from('knowledge_base').insert({
        kb_id: kbId,
        tenant_id: testTenantId,
        source_type: 'manual',
        raw_text: 'Test content for embedding verification',
        metadata: { test: true },
    });

    if (kbError) {
        console.error('❌ Failed to create KB entry:', kbError.message);
        // Cleanup tenant
        await supabase.from('tenants').delete().eq('tenant_id', testTenantId);
        return;
    }
    console.log('   ✅ KB entry created');

    // Step 3: Create a 768-dim vector (simulating MPNet output)
    const testVector = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
    console.log(`3. Inserting embedding with 768-dim vector...`);

    const { error: embedError } = await supabase.from('embeddings').insert({
        kb_id: kbId,
        tenant_id: testTenantId,
        content: 'Test chunk content',
        chunk_text: 'Test chunk content',
        embedding_768: testVector,
        metadata: { chunk_index: 0, test: true },
    });

    if (embedError) {
        console.error('❌ Failed to insert embedding:', embedError.message, embedError.code, embedError.details);
        // Cleanup
        await supabase.from('knowledge_base').delete().eq('kb_id', kbId);
        await supabase.from('tenants').delete().eq('tenant_id', testTenantId);
        return;
    }

    console.log('   ✅ Embedding inserted successfully!');

    // Step 4: Verify by reading back
    const { data: readBack, error: readError } = await supabase
        .from('embeddings')
        .select('id, content, chunk_text, metadata, embedding_768')
        .eq('tenant_id', testTenantId)
        .single();

    if (readError) {
        console.error('❌ Failed to read back:', readError.message);
    } else {
        console.log('   ✅ Read back successful:');
        console.log(`      - ID: ${readBack.id}`);
        console.log(`      - Content: ${readBack.content?.substring(0, 50)}...`);
        console.log(`      - Vector dims: ${readBack.embedding_768?.length || 'null'}`);
    }

    // Step 5: Cleanup
    console.log('4. Cleaning up test data...');
    await supabase.from('embeddings').delete().eq('tenant_id', testTenantId);
    await supabase.from('knowledge_base').delete().eq('kb_id', kbId);
    await supabase.from('tenants').delete().eq('tenant_id', testTenantId);
    console.log('   ✅ Cleanup complete');

    console.log('\n✅ All tests passed! DB insert is working correctly.\n');
}

testEmbeddingsInsert().catch(console.error);
