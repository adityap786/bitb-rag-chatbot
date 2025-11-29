/**
 * Simple check for ingestion_jobs table via REST API
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

console.log('🔍 Checking ingestion_jobs table via REST API...\n');
console.log(`URL: ${supabaseUrl}`);

try {
  const response = await fetch(`${supabaseUrl}/rest/v1/ingestion_jobs?limit=1`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  if (response.ok) {
    const data = await response.json();
    console.log('✅ ingestion_jobs table exists and is accessible');
    console.log(`   Found ${data.length} row(s) in test query`);
    console.log('');
    
    // Test schema by attempting to insert (will fail due to FK but shows columns work)
    console.log('Testing table schema...');
    const testInsert = await fetch(`${supabaseUrl}/rest/v1/ingestion_jobs`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        tenant_id: '00000000-0000-0000-0000-000000000000',
        data_source: 'manual',
        status: 'queued',
        progress: 0
      })
    });

    if (testInsert.status === 409 || testInsert.status === 400) {
      const error = await testInsert.json();
      if (error.message.includes('foreign key') || error.message.includes('violates')) {
        console.log('✅ Table schema verified (FK constraint working as expected)');
      } else {
        console.log('⚠️  Unexpected error:', error.message);
      }
    } else if (testInsert.ok) {
      console.log('✅ Test insert successful (cleaning up...)');
      const inserted = await testInsert.json();
      // Clean up
      await fetch(`${supabaseUrl}/rest/v1/ingestion_jobs?job_id=eq.${inserted[0].job_id}`, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });
    }
    
    console.log('\n✅ ingestion_jobs table is ready!');
    process.exit(0);
  } else {
    const error = await response.text();
    console.log('❌ Table not found or not accessible');
    console.log('   Status:', response.status);
    console.log('   Error:', error);
    console.log('\n📝 Please apply the migration:');
    console.log('   File: supabase/migrations/20251121000001_create_ingestion_jobs.sql');
    console.log('   Via Supabase Dashboard SQL Editor or CLI');
    process.exit(1);
  }
} catch (err) {
  console.error('❌ Connection error:', err.message);
  process.exit(1);
}
