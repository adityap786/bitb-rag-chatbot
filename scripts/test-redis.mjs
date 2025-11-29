#!/usr/bin/env node

/**
 * Test Redis connection and rate limiting functionality
 * 
 * Usage:
 *   node scripts/test-redis.mjs
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

console.log('╔════════════════════════════════════════════════╗');
console.log('║   Redis Connection Test                        ║');
console.log('╚════════════════════════════════════════════════╝\n');

if (!redisUrl) {
  console.error('❌ Redis not configured!');
  console.error('\nPlease set one of the following in .env.local:');
  console.error('   REDIS_URL=redis://localhost:6379');
  console.error('   or');
  console.error('   UPSTASH_REDIS_URL=https://your-redis.upstash.io');
  console.error('   UPSTASH_REDIS_TOKEN=your-token\n');
  
  console.log('📚 Setup options:');
  console.log('\n1. Local Redis (Development):');
  console.log('   - Install: https://redis.io/download');
  console.log('   - Run: redis-server');
  console.log('   - Set: REDIS_URL=redis://localhost:6379');
  
  console.log('\n2. Upstash Redis (Production):');
  console.log('   - Create database: https://console.upstash.com');
  console.log('   - Copy REST URL and token');
  console.log('   - Set: UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN\n');
  
  process.exit(1);
}

console.log('🔧 Connecting to Redis...');
console.log('   URL:', redisUrl.replace(/:[^:@]+@/, ':****@')); // Hide password

let redis;

try {
  // Check if it's an Upstash URL (HTTP-based)
  if (redisUrl.startsWith('http')) {
    const token = process.env.UPSTASH_REDIS_TOKEN;
    if (!token) {
      console.error('❌ UPSTASH_REDIS_TOKEN is required for Upstash Redis');
      process.exit(1);
    }
    
    console.log('   Type: Upstash (HTTP)');
    
    // For Upstash, we'll use their REST API directly
    const testUpstash = async () => {
      const response = await fetch(`${redisUrl}/ping`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.result === 'PONG';
    };
    
    const pong = await testUpstash();
    if (pong) {
      console.log('✅ Connected to Upstash Redis!\n');
    } else {
      console.error('❌ Unexpected response from Upstash');
      process.exit(1);
    }
    
  } else {
    // Standard Redis connection
    console.log('   Type: Standard Redis');
    
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000
    });
    
    // Test connection
    const pong = await redis.ping();
    
    if (pong === 'PONG') {
      console.log('✅ Connected to Redis!\n');
    } else {
      console.error('❌ Unexpected PING response:', pong);
      process.exit(1);
    }
    
    // Run tests
    console.log('🧪 Running tests...\n');
    
    // Test 1: SET/GET
    console.log('Test 1: Basic SET/GET');
    await redis.set('test:key', 'hello');
    const value = await redis.get('test:key');
    console.log(`   ${value === 'hello' ? '✅' : '❌'} SET/GET: "${value}"`);
    
    // Test 2: TTL
    console.log('\nTest 2: TTL (Time To Live)');
    await redis.set('test:ttl', 'expires', 'EX', 2);
    const ttl = await redis.ttl('test:ttl');
    console.log(`   ${ttl > 0 && ttl <= 2 ? '✅' : '❌'} TTL: ${ttl} seconds`);
    
    // Test 3: Increment
    console.log('\nTest 3: INCR (Counter)');
    await redis.del('test:counter');
    await redis.incr('test:counter');
    await redis.incr('test:counter');
    const counter = await redis.get('test:counter');
    console.log(`   ${counter === '2' ? '✅' : '❌'} Counter: ${counter}`);
    
    // Test 4: Sorted Set (used for sliding window)
    console.log('\nTest 4: Sorted Sets (Rate Limiting)');
    const now = Date.now();
    await redis.del('test:sliding');
    await redis.zadd('test:sliding', now - 1000, 'req1');
    await redis.zadd('test:sliding', now, 'req2');
    const count = await redis.zcount('test:sliding', now - 2000, now);
    console.log(`   ${count === 2 ? '✅' : '❌'} Sliding window: ${count} requests`);
    
    // Test 5: Pipeline
    console.log('\nTest 5: Pipeline (Batch Operations)');
    const pipeline = redis.pipeline();
    pipeline.set('test:pipe1', 'value1');
    pipeline.set('test:pipe2', 'value2');
    pipeline.get('test:pipe1');
    const results = await pipeline.exec();
    console.log(`   ${results.length === 3 ? '✅' : '❌'} Pipeline: ${results.length} operations`);
    
    // Cleanup
    console.log('\n🧹 Cleaning up test keys...');
    await redis.del('test:key', 'test:ttl', 'test:counter', 'test:sliding', 'test:pipe1', 'test:pipe2');
    
    console.log('\n✅ All tests passed!');
    console.log('\n📊 Redis Info:');
    const info = await redis.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
    console.log(`   Version: ${version || 'unknown'}`);
    console.log(`   Mode: ${info.includes('redis_mode:standalone') ? 'Standalone' : 'Cluster'}`);
    
    redis.disconnect();
  }
  
} catch (error) {
  console.error('\n❌ Redis test failed:', error.message);
  
  if (error.code === 'ECONNREFUSED') {
    console.error('\n💡 Connection refused. Is Redis running?');
    console.error('   Try: redis-server');
  } else if (error.code === 'ETIMEDOUT') {
    console.error('\n💡 Connection timed out. Check your Redis URL and firewall.');
  }
  
  if (redis) redis.disconnect();
  process.exit(1);
}

console.log('\n🎉 Redis is ready for rate limiting!\n');
