#!/usr/bin/env npx tsx
/**
 * End-to-End Onboarding Architecture Test
 * 
 * Tests the complete flow:
 * 1. Account Creation (/api/trial/start)
 * 2. Knowledge Base Ingestion (/api/trial/kb/manual)
 * 3. Branding Configuration (/api/trial/branding)
 * 4. Pipeline Readiness (/api/tenants/{id}/pipeline-ready)
 * 5. Widget Generation (/api/trial/generate-widget)
 * 6. Playground Query (/api/ask)
 * 7. Streaming Chat (/api/widget/chat?stream=true)
 */

import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface TestResult {
    step: string;
    success: boolean;
    duration: number;
    details: any;
    error?: string;
}

const results: TestResult[] = [];

async function recordTest(step: string, fn: () => Promise<any>): Promise<any> {
    const start = Date.now();
    try {
        const result = await fn();
        results.push({
            step,
            success: true,
            duration: Date.now() - start,
            details: result,
        });
        console.log(`✅ ${step} (${Date.now() - start}ms)`);
        return result;
    } catch (error: any) {
        results.push({
            step,
            success: false,
            duration: Date.now() - start,
            details: null,
            error: error.message,
        });
        console.log(`❌ ${step}: ${error.message}`);
        throw error;
    }
}

async function main() {
    console.log('\n========================================');
    console.log('🧪 E2E Onboarding Architecture Test');
    console.log('========================================\n');

    let tenantId: string = '';
    let setupToken: string = '';
    let embedCode: string = '';

    // Step 1: Start Trial (Account Creation)
    const trialData = await recordTest('1. Start Trial', async () => {
        const res = await fetch(`${BASE_URL}/api/trial/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: `test-${Date.now()}@example.com`,
                businessName: 'E2E Test Business',
                businessType: 'service',
            }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || `HTTP ${res.status}`);
        }

        return await res.json();
    });

    tenantId = trialData.tenantId;
    setupToken = trialData.setupToken;
    console.log(`   Tenant ID: ${tenantId}`);

    // Step 2: Submit Knowledge Base (Manual)
    await recordTest('2. Submit Knowledge Base', async () => {
        const res = await fetch(`${BASE_URL}/api/trial/kb/manual`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${setupToken}`,
            },
            body: JSON.stringify({
                companyInfo: `
          E2E Test Company is a software development agency specializing in AI solutions.
          
          Our Services:
          - Custom AI chatbot development
          - RAG pipeline implementation
          - Machine learning model training
          - Data pipeline engineering
          
          Pricing:
          - Basic plan: $99/month
          - Pro plan: $299/month
          - Enterprise: Custom pricing
          
          Contact us at support@e2etest.com for more information.
          Our team is available Monday through Friday, 9 AM to 5 PM EST.
        `,
                knowledgeBaseSources: ['website', 'manual'],
            }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || `HTTP ${res.status}`);
        }

        return await res.json();
    });

    // Step 3: Configure Branding
    await recordTest('3. Configure Branding', async () => {
        const res = await fetch(`${BASE_URL}/api/trial/branding`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${setupToken}`,
            },
            body: JSON.stringify({
                primaryColor: '#6366f1',
                secondaryColor: '#8b5cf6',
                tone: 'professional',
                welcomeMessage: 'Hello! How can I help you today?',
                platform: 'playground',
                framework: 'react',
            }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || `HTTP ${res.status}`);
        }

        return await res.json();
    });

    // Step 4: Wait for Pipeline Readiness
    await recordTest('4. Check Pipeline Readiness', async () => {
        const maxAttempts = 30;
        let attempt = 0;

        while (attempt < maxAttempts) {
            const res = await fetch(`${BASE_URL}/api/tenants/${tenantId}/pipeline-ready`, {
                headers: { 'Authorization': `Bearer ${setupToken}` },
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            console.log(`   Attempt ${attempt + 1}: ready=${data.ready}, ragStatus=${data.ragStatus}, vectors=${data.vectorCount}`);

            if (data.ready) {
                return data;
            }

            attempt++;
            await new Promise(r => setTimeout(r, 2000));
        }

        throw new Error('Pipeline did not become ready within timeout');
    });

    // Step 5: Generate Widget
    const widgetData = await recordTest('5. Generate Widget', async () => {
        const res = await fetch(`${BASE_URL}/api/trial/generate-widget`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${setupToken}`,
            },
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || `HTTP ${res.status}`);
        }

        return await res.json();
    });

    embedCode = widgetData.embedCode || '';
    console.log(`   Embed code generated: ${embedCode ? embedCode.substring(0, 50) + '...' : '(none)'}`);

    // Step 6: Query Playground (non-streaming)
    await recordTest('6. Playground Query (/api/ask)', async () => {
        const res = await fetch(`${BASE_URL}/api/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenant_id: tenantId,
                trial_token: setupToken,
                query: 'What services do you offer?',
            }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || error.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log(`   Answer: ${data.answer?.substring(0, 100)}...`);
        console.log(`   Sources: ${data.sources?.length || 0}`);
        return data;
    });

    // Step 7: Streaming Chat
    await recordTest('7. Streaming Chat (/api/widget/chat)', async () => {
        // First create a session
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const sessionId = `e2e-${Date.now()}`;

        const { error: sessionError } = await supabase.from('chat_sessions').insert({
            session_id: sessionId,
            tenant_id: tenantId,
            visitor_id: 'e2e-test-visitor',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            metadata: { test: true },
        });

        if (sessionError) {
            throw new Error(`Session creation failed: ${sessionError.message}`);
        }

        // Now test streaming
        const res = await fetch(`${BASE_URL}/api/widget/chat?stream=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                message: 'What are your pricing plans?',
            }),
        });

        if (!res.ok) {
            let errorText = '';
            try {
                const error = await res.json();
                errorText = error.error || error.message;
            } catch {
                errorText = await res.text();
            }
            throw new Error(errorText || `HTTP ${res.status}`);
        }

        // Read the stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let tokenCount = 0;
        let ttft: number | null = null;
        const streamStart = Date.now();

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'token' && parsed.token) {
                                if (ttft === null) {
                                    ttft = Date.now() - streamStart;
                                }
                                fullResponse += parsed.token;
                                tokenCount++;
                            }
                        } catch {
                            // Ignore parse errors
                        }
                    }
                }
            }
        }

        console.log(`   TTFT: ${ttft}ms`);
        console.log(`   Tokens: ${tokenCount}`);
        console.log(`   Response: ${fullResponse.substring(0, 100)}...`);

        return { ttft, tokenCount, responseLength: fullResponse.length };
    });

    // Print Summary
    console.log('\n========================================');
    console.log('📊 Test Summary');
    console.log('========================================\n');

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    for (const r of results) {
        const status = r.success ? '✅' : '❌';
        console.log(`${status} ${r.step}: ${r.duration}ms ${r.error ? `- ${r.error}` : ''}`);
    }

    console.log(`\nTotal: ${passed}/${results.length} passed, ${failed} failed`);
    console.log(`Total Duration: ${totalDuration}ms`);

    if (failed > 0) {
        console.log('\n⚠️  Some tests failed. Check the output above for details.');
        process.exit(1);
    } else {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
