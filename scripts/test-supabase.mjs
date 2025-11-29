import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local (dotenv/config) — see docs
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const requiredEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const missingVars = Object.entries(requiredEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingVars.length) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  if (fs.existsSync(envPath)) {
    console.error(`Found ${envPath} — ensure the values are set and not truncated (no '...')`);
  } else {
    console.error(`Did not find ${envPath}. Put keys in .env.local or set them in your shell.`);
  }
  process.exitCode = 1;
  throw new Error('Missing Supabase environment vars');
}

const supabase = createClient(requiredEnv.SUPABASE_URL, requiredEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runChecks() {
  console.log('Running Supabase smoke test...');

  const { data, error } = await supabase.from('trial_tenants').select('tenant_id').limit(1);
  if (error) {
    console.error('Failed to query trial_tenants table:', error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Connected to Supabase. Found ${data?.length ?? 0} tenant rows.`);

  const testTenantId = 'tn_' + '0'.repeat(32);
  const { error: contextError } = await supabase.rpc('set_tenant_context', { p_tenant_id: testTenantId });
  if (contextError) {
    console.error('Failed to set tenant context:', contextError.message);
    process.exitCode = 1;
    return;
  }

  console.log('Tenant context set successfully. Supabase smoke test passed.');
}

runChecks().catch((err) => {
  console.error('Supabase smoke test failed:', err);
  process.exitCode = 1;
});