/**
 * Apply ingestion_jobs migration directly to Supabase
 * Uses Supabase Management API or direct SQL execution
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('=== Applying ingestion_jobs Migration ===\n');

// Read migration SQL
const migrationSQL = readFileSync('supabase/migrations/20251121000001_create_ingestion_jobs.sql', 'utf-8');

console.log('📄 Migration file loaded');
console.log(`📏 SQL length: ${migrationSQL.length} characters\n`);

console.log('🚀 Executing migration via Supabase RPC...\n');

try {
  // Execute raw SQL via rpc
  const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
  
  if (error) {
    // RPC might not exist, try alternative approach
    console.log('⚠️  RPC method not available');
    console.log('');
    console.log('📝 Please apply the migration manually:\n');
    console.log('Option 1: Supabase Dashboard');
    console.log(`  1. Open: ${supabaseUrl.replace('/rest/v1', '')}/project/default/sql`);
    console.log('  2. Copy contents from: supabase/migrations/20251121000001_create_ingestion_jobs.sql');
    console.log('  3. Paste into SQL Editor and click "Run"\n');
    
    console.log('Option 2: Supabase CLI');
    console.log('  npm install -g supabase');
    console.log('  supabase login');
    console.log('  supabase link --project-ref YOUR_PROJECT_REF');
    console.log('  supabase db push\n');
    
    console.log('Option 3: psql (Direct Connection)');
    console.log('  Get connection string from Dashboard → Settings → Database');
    console.log('  psql "YOUR_CONNECTION_STRING" -f supabase/migrations/20251121000001_create_ingestion_jobs.sql\n');
    
    process.exit(1);
  }
  
  console.log('✅ Migration applied successfully!');
  console.log('');
  
  // Verify the table was created
  const { error: checkError } = await supabase
    .from('ingestion_jobs')
    .select('*', { count: 'exact', head: true });
  
  if (checkError) {
    console.log('⚠️  Table verification failed:', checkError.message);
    console.log('   The migration may have been applied but the schema cache needs refresh');
  } else {
    console.log('✅ Table verified and accessible!');
  }
  
} catch (err) {
  console.error('❌ Error:', err.message);
  console.log('\n📝 Please apply migration manually using one of the methods above');
  process.exit(1);
}
