import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = process.cwd();
const envLocalPath = path.join(root, '.env.local');
const envPath = path.join(root, '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function required(name, hint) {
  const value = process.env[name];
  return {
    name,
    ok: Boolean(value && String(value).trim().length > 0),
    hint,
  };
}

function optional(name, hint) {
  const value = process.env[name];
  return {
    name,
    ok: Boolean(value && String(value).trim().length > 0),
    hint,
    optional: true,
  };
}

const checks = [
  required('NEXT_PUBLIC_SUPABASE_URL', 'Supabase project URL (https://xxxx.supabase.co)'),
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase anon key'),
  required('SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key (server-only)'),
  optional('UPSTASH_REDIS_REST_URL', 'Upstash REST URL (https://...) for rate limiting'),
  optional('UPSTASH_REDIS_REST_TOKEN', 'Upstash REST token for rate limiting'),
  required(
    'BULLMQ_REDIS_URL',
    'Redis protocol URL for BullMQ worker (redis:// or rediss://). For Upstash use the “TLS URL / Redis URL”, not the REST URL.'
  ),
  optional('BGE_EMBEDDING_SERVICE_URL', 'Embedding service base URL (default http://localhost:8000)'),
];

const missing = checks.filter((c) => !c.ok && !c.optional);

console.log('Env file detected:', fs.existsSync(envLocalPath) ? '.env.local' : fs.existsSync(envPath) ? '.env' : 'none');

for (const c of checks) {
  const status = c.ok ? 'OK' : c.optional ? 'MISSING (optional)' : 'MISSING';
  console.log(`- ${c.name}: ${status}`);
  if (!c.ok) console.log(`  hint: ${c.hint}`);
}

const bull = process.env.BULLMQ_REDIS_URL;
if (bull && !(bull.startsWith('redis://') || bull.startsWith('rediss://'))) {
  console.log(`\nBULLMQ_REDIS_URL looks invalid (must start with redis:// or rediss://).`);
}

if (missing.length) {
  console.log(`\n❌ Missing ${missing.length} required env var(s). Fix them and retry.`);
  process.exit(1);
}

console.log('\n✅ Required env vars are present.');
