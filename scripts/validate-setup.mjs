#!/usr/bin/env node

/**
 * Simple validation script to check setup status
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

console.log('╔════════════════════════════════════════════════╗');
console.log('║   Setup Validation                             ║');
console.log('╚════════════════════════════════════════════════╝\n');

let issuesFound = 0;

// Check Supabase
console.log('🔍 Checking Supabase Configuration...');
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (supabaseUrl) {
  console.log('   ✅ SUPABASE_URL:', supabaseUrl);
} else {
  console.log('   ❌ SUPABASE_URL: Missing');
  issuesFound++;
}

if (serviceKey) {
  if (serviceKey.length < 100) {
    console.log('   ⚠️  SUPABASE_SERVICE_ROLE_KEY: Looks truncated (too short)');
    console.log('      Current length:', serviceKey.length, 'characters');
    console.log('      Expected: ~200+ characters');
    issuesFound++;
  } else {
    console.log('   ✅ SUPABASE_SERVICE_ROLE_KEY: Set (length:', serviceKey.length, ')');
  }
} else {
  console.log('   ❌ SUPABASE_SERVICE_ROLE_KEY: Missing');
  issuesFound++;
}

if (anonKey) {
  if (anonKey.length < 100) {
    console.log('   ⚠️  NEXT_PUBLIC_SUPABASE_ANON_KEY: Looks truncated');
    issuesFound++;
  } else {
    console.log('   ✅ NEXT_PUBLIC_SUPABASE_ANON_KEY: Set (length:', anonKey.length, ')');
  }
} else {
  console.log('   ❌ NEXT_PUBLIC_SUPABASE_ANON_KEY: Missing');
  issuesFound++;
}

// Check Redis
console.log('\n🔍 Checking Redis Configuration...');
const redisUrl = process.env.REDIS_URL;
const upstashUrl = process.env.UPSTASH_REDIS_URL;
const upstashToken = process.env.UPSTASH_REDIS_TOKEN;

if (redisUrl) {
  console.log('   ✅ REDIS_URL:', redisUrl);
} else if (upstashUrl && upstashToken) {
  console.log('   ✅ UPSTASH_REDIS_URL:', upstashUrl);
  console.log('   ✅ UPSTASH_REDIS_TOKEN: Set');
} else {
  console.log('   ⚠️  Redis not configured (required for rate limiting)');
  console.log('      Add one of:');
  console.log('      - REDIS_URL=redis://localhost:6379');
  console.log('      - UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN');
  issuesFound++;
}

// Check files
console.log('\n🔍 Checking Required Files...');
const fs = await import('fs');
const files = [
  'supabase/migrations/20251121000000_add_phase3_phase4_tables.sql',
  'src/middleware/auth.ts',
  'src/middleware/rate-limit.ts',
  'src/app/api/booking/route.ts',
  'src/app/api/analytics/scoring/route.ts',
  'src/app/api/analytics/metrics/route.ts',
  'src/app/api/ecommerce/checkout/route.ts'
];

files.forEach(file => {
  const fullPath = join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    console.log('   ✅', file);
  } else {
    console.log('   ❌', file, '(missing)');
    issuesFound++;
  }
});

// Summary
console.log('\n' + '═'.repeat(50));
if (issuesFound === 0) {
  console.log('✅ All checks passed! You\'re ready to proceed.\n');
  console.log('Next steps:');
  console.log('1. Apply database migration (see QUICKSTART.md)');
  console.log('2. Test authentication: node scripts/test-auth.mjs');
  console.log('3. Test Redis: node scripts/test-redis.mjs');
  console.log('4. Start dev server: npm run dev\n');
} else {
  console.log(`⚠️  Found ${issuesFound} issue(s) that need attention.\n`);
  
  if (serviceKey && serviceKey.length < 100) {
    console.log('🔧 To fix Supabase keys:');
    console.log('1. Go to: https://supabase.com/dashboard/project/xabwdfohkeluojktnnic/settings/api');
    console.log('2. Copy the COMPLETE service_role key (should be 200+ characters)');
    console.log('3. Update .env.local with the full key');
    console.log('4. Also verify the anon key is complete\n');
  }
  
  if (!redisUrl && !upstashUrl) {
    console.log('🔧 To setup Redis:');
    console.log('Option 1 (Local): Install Redis and add REDIS_URL=redis://localhost:6379');
    console.log('Option 2 (Cloud): Create Upstash account and add credentials');
    console.log('See QUICKSTART.md Step 2 for details\n');
  }
}
