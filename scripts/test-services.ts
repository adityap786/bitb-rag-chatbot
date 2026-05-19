#!/usr/bin/env npx tsx
/**
 * Service Health Verification Test
 * Tests all critical services in the BiTB RAG Chatbot system
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ServiceResult {
    service: string;
    status: 'ok' | 'error' | 'skip';
    latency?: number;
    details?: string;
    error?: string;
}

const results: ServiceResult[] = [];

async function testService(name: string, testFn: () => Promise<{ ok: boolean; details?: string }>): Promise<void> {
    const start = Date.now();
    try {
        const result = await testFn();
        results.push({
            service: name,
            status: result.ok ? 'ok' : 'error',
            latency: Date.now() - start,
            details: result.details,
        });
        console.log(`${result.ok ? '✅' : '❌'} ${name} (${Date.now() - start}ms)${result.details ? ` - ${result.details}` : ''}`);
    } catch (error: any) {
        results.push({
            service: name,
            status: 'error',
            latency: Date.now() - start,
            error: error.message,
        });
        console.log(`❌ ${name} (${Date.now() - start}ms) - ${error.message}`);
    }
}

async function main() {
    console.log('\n========================================');
    console.log('🔍 Service Health Verification');
    console.log('========================================\n');

    // 1. Redis Connection
    await testService('Redis Connection', async () => {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            connectTimeout: 5000,
            maxRetriesPerRequest: 1,
        });

        await redis.ping();
        const info = await redis.info('server');
        const version = info.match(/redis_version:(\S+)/)?.[1] || 'unknown';
        await redis.quit();

        return { ok: true, details: `v${version}` };
    });

    // 2. Supabase Connection
    await testService('Supabase Connection', async () => {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        if (!supabaseUrl || !supabaseKey) {
            return { ok: false, details: 'Missing credentials' };
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { count, error } = await supabase.from('tenants').select('*', { count: 'exact', head: true });

        if (error) throw new Error(error.message);
        return { ok: true, details: `${count} tenants` };
    });

    // 3. Embeddings Table
    await testService('Embeddings Table', async () => {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { count, error } = await supabase.from('embeddings').select('*', { count: 'exact', head: true });

        if (error) throw new Error(error.message);
        return { ok: true, details: `${count} embeddings` };
    });

    // 4. Next.js Dev Server
    await testService('Next.js Dev Server', async () => {
        const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(5000) });

        if (!res.ok) {
            return { ok: false, details: `HTTP ${res.status}` };
        }

        return { ok: true, details: 'Responding' };
    });

    // 5. Embedding API Route
    await testService('Embedding API (768-dim)', async () => {
        const res = await fetch(`${BASE_URL}/api/embed-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: ['test embedding'] }),
            signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
            const error = await res.json();
            return { ok: false, details: error.error || `HTTP ${res.status}` };
        }

        const data = await res.json();
        const dims = data.embeddings?.[0]?.length || 0;
        return { ok: dims === 768, details: `${dims} dimensions` };
    });

    // 6. BullMQ Worker (via Redis queue check)
    await testService('BullMQ Worker', async () => {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            connectTimeout: 5000,
            maxRetriesPerRequest: 1,
        });

        // Check if worker is registered by looking at queue keys
        const keys = await redis.keys('bull:tenant_pipeline:*');
        await redis.quit();

        return { ok: keys.length > 0, details: `${keys.length} queue keys` };
    });

    // 7. Groq LLM (if key exists)
    await testService('Groq LLM', async () => {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return { ok: false, details: 'GROQ_API_KEY not set' };
        }

        // Verify API key format
        if (!apiKey.startsWith('gsk_')) {
            return { ok: false, details: 'Invalid key format (should start with gsk_)' };
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const res = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                if (res.status === 401) return { ok: false, details: 'Invalid API key' };
                return { ok: false, details: `HTTP ${res.status}` };
            }

            const data = await res.json();
            return { ok: true, details: `${data.data?.length || 0} models available` };
        } catch (err: any) {
            if (err.name === 'AbortError') {
                return { ok: false, details: 'Timeout (10s) - network issue' };
            }
            return { ok: false, details: `Network: ${err.cause?.code || err.message}` };
        }
    });

    // 8. Trial Start API
    await testService('Trial Start API', async () => {
        const res = await fetch(`${BASE_URL}/api/trial/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: `healthcheck-${Date.now()}@test.com`,
                businessName: 'Health Check',
                businessType: 'service',
            }),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            const error = await res.json();
            return { ok: false, details: error.error || `HTTP ${res.status}` };
        }

        const data = await res.json();
        return { ok: !!data.tenantId, details: data.tenantId?.substring(0, 20) + '...' };
    });

    // Summary
    console.log('\n========================================');
    console.log('📊 Summary');
    console.log('========================================\n');

    const passed = results.filter(r => r.status === 'ok').length;
    const failed = results.filter(r => r.status === 'error').length;
    const skipped = results.filter(r => r.status === 'skip').length;

    for (const r of results) {
        const icon = r.status === 'ok' ? '✅' : r.status === 'error' ? '❌' : '⏭️';
        console.log(`${icon} ${r.service}: ${r.status}${r.latency ? ` (${r.latency}ms)` : ''}${r.error ? ` - ${r.error}` : ''}`);
    }

    console.log(`\nTotal: ${passed}/${results.length} passed, ${failed} failed, ${skipped} skipped`);

    if (failed > 0) {
        console.log('\n⚠️  Some services failed. Check the output above.');
        process.exit(1);
    } else {
        console.log('\n🎉 All services healthy!');
        process.exit(0);
    }
}

main().catch(console.error);
