#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function generateTenantId(): string {
  return `tn_${crypto.randomBytes(16).toString('hex')}`; // 32 hex chars
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const demoTenantId = process.env.DEMO_TENANT_ID || generateTenantId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (!/^tn_[a-f0-9]{32}$/.test(demoTenantId)) {
    throw new Error(`DEMO_TENANT_ID must match tn_[a-f0-9]{32}, got: ${demoTenantId}`);
  }

  const client = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await client
    .from('trial_tenants')
    .upsert({
      tenant_id: demoTenantId,
      status: 'active',
      trial_expires_at: expiresAt,
      name: 'Demo Tenant (local)',
    }, { onConflict: 'tenant_id' })
    .select('tenant_id, status, trial_expires_at')
    .single();

  if (error) throw error;

  console.log(JSON.stringify({
    message: 'Demo tenant ready',
    tenant_id: data?.tenant_id,
    status: data?.status,
    trial_expires_at: data?.trial_expires_at,
  }, null, 2));
}

main().catch((err) => {
  console.error('Failed to seed demo tenant:', err.message || err);
  process.exit(1);
});
