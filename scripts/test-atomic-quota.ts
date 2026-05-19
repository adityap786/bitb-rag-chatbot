/**
 * Test script for atomic quota check
 * 
 * Prerequisites:
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * - Redis/Memurai running on localhost:6379
 * 
 * Run with: npx tsx scripts/test-atomic-quota.ts
 */

// Load environment variables from .env.local FIRST
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { TenantManager } from '../src/lib/tenant/tenant-manager';

async function testConcurrentQuota() {
    console.log('🧪 Testing Atomic Quota Check\n');
    console.log('='.repeat(60));

    const tenantManager = new TenantManager();

    // Create a test tenant with trial plan (1000 embedding quota)
    console.log('📝 Creating test tenant...');
    const testTenant = await tenantManager.provisionTenant({
        email: `test-${Date.now()}@atomic-quota-test.local`,
        name: 'Atomic Quota Test Tenant',
        plan: 'trial', // 1000 embeddings limit
    });

    const tenantId = testTenant.tenant_id;
    console.log(`✓ Test tenant created: ${tenantId}`);
    console.log(`  Plan: trial`);
    console.log(`  Quota: 1000 embeddings`);
    console.log(`  Per-worker request: 200 embeddings`);
    console.log(`  Number of workers: 6 (concurrent)`);
    console.log('');
    console.log('Expected: First 5 workers succeed, 6th fails (quota exceeded)');
    console.log('='.repeat(60));
    console.log('');

    try {
        // Simulate 6 workers trying to reserve quota concurrently
        // Limit is 1000 for trial plan, so only 5 x 200 should succeed
        const workers = Array.from({ length: 6 }, (_, i) => {
            return tenantManager.reserveQuota(tenantId, 'embedding', 200)
                .then((res) => {
                    console.log(`✓ Worker ${i + 1} SUCCESS: Reserved 200, new total = ${res.newCount}`);
                    return { worker: i + 1, status: 'success', count: res.newCount };
                })
                .catch((err: Error) => {
                    console.log(`✗ Worker ${i + 1} FAILED: ${err.message}`);
                    return { worker: i + 1, status: 'failed', error: err.message };
                });
        });

        const results = await Promise.all(workers);

        console.log('');
        console.log('='.repeat(60));
        console.log('Test Results:\n');

        const succeeded = results.filter(r => r.status === 'success');
        const failed = results.filter(r => r.status === 'failed');

        console.log(`✓ Successful: ${succeeded.length}/6`);
        console.log(`✗ Failed: ${failed.length}/6`);

        console.log('');
        if (succeeded.length === 5 && failed.length === 1) {
            console.log('✅ TEST PASSED: Atomic quota enforcement working correctly!');
            console.log('   - Exactly 5 workers succeeded (1000 quota / 200 each)');
            console.log('   - 6th worker correctly rejected (would exceed limit)');
            return true;
        } else {
            console.log('❌ TEST FAILED: Unexpected results');
            console.log(`   Expected 5 successes, got ${succeeded.length}`);
            console.log(`   Expected 1 failure, got ${failed.length}`);
            return false;
        }
    } finally {
        // Cleanup: delete test tenant
        console.log('');
        console.log('🧹 Cleaning up test tenant...');
        try {
            await tenantManager.deprovisionTenant(tenantId, 'test_complete');
            console.log('✓ Test tenant deleted');
        } catch (err) {
            console.warn('⚠️  Failed to delete test tenant:', err);
        }
        console.log('='.repeat(60));
    }
}

async function testRollback() {
    console.log('\n🧪 Testing Quota Rollback\n');
    console.log('='.repeat(60));

    const tenantManager = new TenantManager();

    // Create a test tenant
    console.log('📝 Creating test tenant for rollback test...');
    const testTenant = await tenantManager.provisionTenant({
        email: `test-rollback-${Date.now()}@atomic-quota-test.local`,
        name: 'Rollback Test Tenant',
        plan: 'trial',
    });

    const tenantId = testTenant.tenant_id;
    console.log(`✓ Test tenant created: ${tenantId}`);
    console.log('');

    try {
        // Reserve quota
        const { reservationId, newCount } = await tenantManager.reserveQuota(
            tenantId,
            'embedding',
            100
        );
        console.log(`✓ Reserved 100 embeddings (total: ${newCount})`);
        console.log(`  Reservation ID: ${reservationId}`);

        // Simulate processing failure
        console.log('\n❌ Simulating processing failure...');

        // Release quota
        await tenantManager.releaseQuota(tenantId, 'embedding', 100);
        console.log('✓ Released 100 embeddings (rollback successful)');

        // Try to reserve again - should work
        const { newCount: newCount2 } = await tenantManager.reserveQuota(
            tenantId,
            'embedding',
            100
        );
        console.log(`✓ Re-reserved 100 embeddings (total: ${newCount2})`);

        console.log('');
        console.log('✅ Rollback test PASSED!');

    } catch (error) {
        console.error('❌ Rollback test FAILED:', error);
    } finally {
        // Cleanup
        console.log('');
        console.log('🧹 Cleaning up test tenant...');
        try {
            await tenantManager.deprovisionTenant(tenantId, 'test_complete');
            console.log('✓ Test tenant deleted');
        } catch (err) {
            console.warn('⚠️  Failed to delete test tenant:', err);
        }
    }

    console.log('='.repeat(60));
}

async function main() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  Atomic Quota Check - Test Suite                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');

    try {
        await testConcurrentQuota();
        await testRollback();

        console.log('\n✅ All tests complete!\n');
    } catch (error) {
        console.error('\n❌ Test suite failed:', error);
        process.exit(1);
    }
}

main().catch(console.error);
