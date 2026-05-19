/**
 * Reset trial quota for testing
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetQuota() {
    console.log('Resetting trial quotas for recent test tenants...');

    // Get recent test tenants
    const { data: tenants, error } = await supabase
        .from('tenants')
        .select('tenant_id, email')
        .like('email', 'test-%@example.com')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching tenants:', error.message);
        return;
    }

    console.log(`Found ${tenants?.length || 0} recent test tenants`);

    for (const tenant of tenants || []) {
        // Reset trials table queries_used
        const { error: trialError } = await supabase
            .from('trials')
            .update({ queries_used: 0, queries_limit: 100 })
            .eq('tenant_id', tenant.tenant_id);

        if (trialError) {
            console.log(`  ❌ ${tenant.tenant_id}: ${trialError.message}`);
        } else {
            console.log(`  ✅ ${tenant.tenant_id}: quota reset`);
        }
    }

    console.log('\nDone!');
}

resetQuota();
