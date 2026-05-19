import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env.local explicitly
const envLocal = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
    console.log('Loaded .env.local');
} else {
    console.log('.env.local not found');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTenantState(tenantId: string) {
    console.log(`\n=== Checking tenant: ${tenantId} ===\n`);

    // Check ingestion jobs
    const { data: jobs, error: jobError } = await supabase
        .from('ingestion_jobs')
        .select('job_id, status, progress, error_message, started_at, embeddings_count')
        .eq('tenant_id', tenantId)
        .order('started_at', { ascending: false })
        .limit(5);

    console.log('Ingestion Jobs:', jobError ? jobError.message : JSON.stringify(jobs, null, 2));

    // Check knowledge base
    const { data: kb, error: kbError } = await supabase
        .from('knowledge_base')
        .select('kb_id, source_type, created_at')
        .eq('tenant_id', tenantId);

    console.log('\nKnowledge Base:', kbError ? kbError.message : JSON.stringify(kb, null, 2));

    // Check embeddings count
    const { count, error: embError } = await supabase
        .from('embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

    console.log('\nEmbeddings Count:', embError ? embError.message : count);

    // Check tenant status
    const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('status, plan')
        .eq('tenant_id', tenantId)
        .single();

    console.log('\nTenant Status:', tenantError ? tenantError.message : JSON.stringify(tenant));
}

// Get latest tenants
async function getLatestTenants() {
    const { data: tenants } = await supabase
        .from('tenants')
        .select('tenant_id, email, created_at')
        .order('created_at', { ascending: false })
        .limit(3);

    console.log('Latest tenants:', JSON.stringify(tenants, null, 2));
    return tenants;
}

async function main() {
    const tenants = await getLatestTenants();
    if (tenants && tenants.length > 0) {
        await checkTenantState(tenants[0].tenant_id);
    }
}

main().catch(console.error);
