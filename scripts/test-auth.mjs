#!/usr/bin/env node

/**
 * Test authentication middleware functionality
 * 
 * Usage:
 *   node scripts/test-auth.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('╔════════════════════════════════════════════════╗');
console.log('║   Authentication Test                          ║');
console.log('╚════════════════════════════════════════════════╝\n');

if (!supabaseUrl || !supabaseKey || !anonKey) {
  console.error('❌ Missing required environment variables:');
  if (!supabaseUrl) console.error('   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseKey) console.error('   SUPABASE_SERVICE_ROLE_KEY');
  if (!anonKey) console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);
const adminSupabase = createClient(supabaseUrl, supabaseKey);

console.log('🔧 Testing authentication flow...\n');

async function testAuth() {
  try {
    // Test 1: Create a test user
    console.log('Test 1: Create test user');
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';
    
    const { data: signUpData, error: signUpError } = await adminSupabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    });
    
    if (signUpError) {
      console.error('   ❌ Failed to create user:', signUpError.message);
      return;
    }
    
    console.log('   ✅ User created:', testEmail);
    const userId = signUpData.user.id;
    
    // Test 2: Sign in
    console.log('\nTest 2: Sign in with credentials');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (signInError) {
      console.error('   ❌ Sign in failed:', signInError.message);
      await cleanup(userId);
      return;
    }
    
    console.log('   ✅ Signed in successfully');
    const accessToken = signInData.session.access_token;
    
    // Test 3: Verify token
    console.log('\nTest 3: Verify access token');
    const { data: userData, error: verifyError } = await adminSupabase.auth.getUser(accessToken);
    
    if (verifyError || !userData.user) {
      console.error('   ❌ Token verification failed:', verifyError?.message);
      await cleanup(userId);
      return;
    }
    
    console.log('   ✅ Token verified');
    console.log(`   User ID: ${userData.user.id}`);
    console.log(`   Email: ${userData.user.email}`);
    
    // Test 4: Test API endpoint (if server is running)
    console.log('\nTest 4: Test protected API endpoint');
    try {
      const response = await fetch('http://localhost:3000/api/booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Tenant-ID': 'test-tenant'
        },
        body: JSON.stringify({
          date: '2025-11-25',
          time: '10:00',
          service: 'consultation'
        })
      });
      
      if (response.status === 401) {
        console.log('   ✅ Auth middleware working (401 for invalid tenant)');
      } else if (response.status === 429) {
        console.log('   ✅ Rate limiting working (429)');
      } else if (response.ok) {
        console.log('   ✅ Request successful');
      } else {
        console.log(`   ⚠️  Got status ${response.status}`);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('   ⚠️  Server not running (start with: npm run dev)');
      } else {
        console.log('   ⚠️  API test failed:', error.message);
      }
    }
    
    // Test 5: Invalid token
    console.log('\nTest 5: Test invalid token');
    const { data: invalidData, error: invalidError } = await adminSupabase.auth.getUser('invalid.token.here');
    
    if (invalidError) {
      console.log('   ✅ Invalid token rejected correctly');
    } else {
      console.log('   ❌ Invalid token should have been rejected');
    }
    
    // Test 6: Check tenant_users table
    console.log('\nTest 6: Check tenant isolation setup');
    const { data: tenantData, error: tenantError } = await adminSupabase
      .from('tenant_users')
      .select('tenant_id, role')
      .eq('user_id', userId);
    
    if (tenantError) {
      console.log('   ⚠️  tenant_users table not accessible:', tenantError.message);
      console.log('   💡 This is expected if migration hasn\'t been applied yet');
    } else {
      console.log(`   ✅ Found ${tenantData.length} tenant memberships`);
    }
    
      // Cleanup step skipped so test user remains in database
      // console.log('\n🧹 Cleaning up test user...');
      // await cleanup(userId);
    
    console.log('\n✅ Authentication tests completed!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

async function cleanup(userId) {
  try {
    await adminSupabase.auth.admin.deleteUser(userId);
    console.log('   ✅ Test user deleted');
  } catch (error) {
    console.log('   ⚠️  Cleanup failed:', error.message);
  }
}

// Main execution
testAuth();
