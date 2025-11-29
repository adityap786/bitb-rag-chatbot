#!/usr/bin/env node

/**
 * Script to apply the Phase 3/4 database migration to Supabase
 * 
 * Usage:
 *   node scripts/apply-migration.mjs
 * 
 * Prerequisites:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - supabase CLI installed (or use Supabase dashboard)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

console.log('🔧 Connecting to Supabase...');
const supabase = createClient(supabaseUrl, supabaseKey);

// Read migration file
const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20251121000000_add_phase3_phase4_tables.sql');
const migrationSQL = readFileSync(migrationPath, 'utf-8');

console.log('📄 Migration file loaded:', migrationPath);
console.log('📊 SQL length:', migrationSQL.length, 'characters');

async function applyMigration() {
  try {
    console.log('\n🚀 Applying migration...');
    
    // Split SQL by statement and execute each one
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`   Found ${statements.length} SQL statements`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip comments and empty lines
      if (statement.trim().startsWith('--') || statement.trim() === ';') {
        continue;
      }
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          // Some errors are expected (e.g., table already exists)
          if (error.message.includes('already exists')) {
            console.log(`   ⚠️  Statement ${i + 1}: Already exists (skipping)`);
          } else {
            console.error(`   ❌ Statement ${i + 1} failed:`, error.message);
            errorCount++;
          }
        } else {
          successCount++;
          process.stdout.write(`\r   ✅ Progress: ${successCount}/${statements.length} statements applied`);
        }
      } catch (err) {
        console.error(`\n   ❌ Statement ${i + 1} exception:`, err.message);
        errorCount++;
      }
    }
    
    console.log('\n\n📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log('\n⚠️  Migration completed with some errors. Review the output above.');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

async function verifyTables() {
  console.log('\n🔍 Verifying tables...');
  
  const expectedTables = [
    'bookings',
    'conversation_scores',
    'analytics_metrics',
    'orders',
    'phi_detection_events',
    'audit_logs'
  ];
  
  try {
    const { data, error } = await supabase
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'public')
      .in('tablename', expectedTables);
    
    if (error) {
      console.error('   ❌ Query failed:', error.message);
      return;
    }
    
    console.log(`   Found ${data.length}/${expectedTables.length} tables:`);
    expectedTables.forEach(table => {
      const exists = data.some(t => t.tablename === table);
      console.log(`   ${exists ? '✅' : '❌'} ${table}`);
    });
    
  } catch (error) {
    console.error('   ❌ Verification failed:', error.message);
  }
}

// Main execution
console.log('╔════════════════════════════════════════════════╗');
console.log('║   Phase 3/4 Database Migration Tool           ║');
console.log('╚════════════════════════════════════════════════╝\n');

console.log('⚠️  NOTE: This script requires the exec_sql RPC function.');
console.log('   If you see errors, use the Supabase dashboard instead:');
console.log('   1. Go to: https://supabase.com/dashboard');
console.log('   2. Select your project');
console.log('   3. Go to SQL Editor');
console.log('   4. Paste the migration SQL');
console.log('   5. Click "Run"\n');

const readline = await import('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Continue with automated migration? (y/N): ', async (answer) => {
  rl.close();
  
  if (answer.toLowerCase() === 'y') {
    await applyMigration();
    await verifyTables();
  } else {
    console.log('\n📋 Manual migration steps:');
    console.log('   1. Open:', migrationPath);
    console.log('   2. Copy the SQL content');
    console.log('   3. Paste into Supabase SQL Editor');
    console.log('   4. Run the query');
  }
});
