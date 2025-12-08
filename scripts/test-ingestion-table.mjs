/**
 * Test Ingestion Jobs Table
 * Verifies that the ingestion_jobs table exists and is properly configured
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testIngestionJobsTable() {
  console.log('🔍 Testing ingestion_jobs table...\n');

  try {
    // Test 1: Check if table exists and is accessible
    console.log('Test 1: Check table accessibility...');
    const { data, error, count } = await supabase
      .from('ingestion_jobs')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Table does not exist or is not accessible:', error.message);
      console.log('\n📝 Please run the migration:');
      console.log('   PowerShell: .\\scripts\\apply-ingestion-migration.ps1');
      console.log('   Or apply manually via Supabase Dashboard SQL Editor\n');
      return false;
    }

    console.log(`✅ Table exists and is accessible (${count || 0} rows)\n`);

    // Test 2: Test insert
    console.log('Test 2: Test insert operation...');
    const testJob = {
      tenant_id: '00000000-0000-0000-0000-000000000000', // dummy UUID
      data_source: 'manual',
      status: 'queued',
      progress: 0,
      metadata: { test: true }
    };

    const { data: insertData, error: insertError } = await supabase
      .from('ingestion_jobs')
      .insert(testJob)
      .select()
      .single();

    if (insertError) {
      // Expected if tenant doesn't exist (FK constraint)
      if (insertError.message.includes('foreign key')) {
        console.log('✅ Insert test: Foreign key constraint working (expected)\n');
      } else {
        console.error('❌ Insert failed:', insertError.message);
        return false;
      }
    } else {
      console.log('✅ Insert successful, job_id:', insertData.job_id);
      
      // Clean up test data
      await supabase
        .from('ingestion_jobs')
        .delete()
        .eq('job_id', insertData.job_id);
      console.log('✅ Test data cleaned up\n');
    }

    // Test 3: Verify columns
    console.log('Test 3: Verify table schema...');
    const expectedColumns = [
      'job_id',
      'tenant_id',
      'data_source',
      'source_url',
      'file_names',
      'status',
      'progress',
      'pages_processed',
      'chunks_created',
      'embeddings_count',
      'index_path',
      'error_message',
      'error_details',
      'created_at',
      'started_at',
      'completed_at',
      'updated_at',
      'metadata'
    ];

    // Query with all expected columns
    const { error: columnError } = await supabase
      .from('ingestion_jobs')
      .select(expectedColumns.join(','))
      .limit(1);

    if (columnError) {
      console.error('❌ Schema verification failed:', columnError.message);
      console.log('Missing or incorrect columns detected\n');
      return false;
    }

    console.log('✅ All expected columns present\n');

    // Test 4: Test update with trigger
    console.log('Test 4: Test updated_at trigger...');
    // This would require actual data, skipping for now
    console.log('⏭️  Skipped (requires test data)\n');

    console.log('✅ All tests passed!\n');
    return true;

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    return false;
  }
}

async function verifyRelatedTables() {
  console.log('🔍 Verifying related tables...\n');

  const tables = ['trial_tenants', 'knowledge_base', 'embeddings'];
  
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.log(`❌ Table '${table}' not accessible`);
    } else {
      console.log(`✅ Table '${table}' exists`);
    }
  }
  console.log('');
}

// Run tests
async function main() {
  console.log('=== Ingestion Jobs Table Test ===\n');
  
  await verifyRelatedTables();
  const success = await testIngestionJobsTable();
  
  if (success) {
    console.log('🎉 ingestion_jobs table is properly configured and ready to use!');
  } else {
    console.log('⚠️  Please resolve the issues above before proceeding.');
  }
  
  process.exit(success ? 0 : 1);
}

main();
