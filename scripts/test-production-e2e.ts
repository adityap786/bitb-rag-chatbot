#!/usr/bin/env npx tsx
/**
 * Production-Ready E2E Tenant Creation & Chatbot Test
 * 
 * This script tests the complete tenant lifecycle:
 * 1. Create tenant via /api/trial/start
 * 2. Submit knowledge base content
 * 3. Configure branding
 * 4. Wait for RAG pipeline to become ready
 * 5. Test chatbot queries using the tenant's RAG pipeline
 * 6. Verify responses are grounded in the tenant's knowledge base
 * 7. Test streaming chat
 * 8. Cleanup (optional)
 * 
 * Usage:
 *   npx tsx scripts/test-production-e2e.ts
 *   npx tsx scripts/test-production-e2e.ts --keep  # Don't cleanup tenant after test
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const KEEP_TENANT = process.argv.includes('--keep');

// Test configuration
const TEST_CONFIG = {
    businessName: 'TechFlow Solutions',
    businessType: 'service' as const,
    knowledgeBase: `
# TechFlow Solutions - Company Knowledge Base

## About Us
TechFlow Solutions is a premier software development agency founded in 2020. 
We specialize in building custom AI-powered applications, cloud infrastructure, and enterprise software solutions.
Our headquarters is located at 123 Innovation Drive, San Francisco, CA 94105.

## Our Services

### AI & Machine Learning
- Custom chatbot development with RAG pipelines
- Machine learning model training and deployment
- Natural language processing solutions
- Computer vision applications
- Predictive analytics dashboards

### Cloud Infrastructure
- AWS, Azure, and GCP architecture design
- Kubernetes cluster management
- CI/CD pipeline setup
- Infrastructure as Code (Terraform, Pulumi)
- 24/7 monitoring and incident response

### Enterprise Software
- Custom CRM and ERP systems
- Workflow automation tools
- Data integration platforms
- Business intelligence dashboards

## Pricing Plans

### Starter Plan - $499/month
- Up to 5 users
- 10,000 API calls/month
- Email support
- Basic analytics
- 99.5% uptime SLA

### Professional Plan - $1,499/month
- Up to 25 users
- 100,000 API calls/month
- Priority email & chat support
- Advanced analytics
- Custom integrations
- 99.9% uptime SLA

### Enterprise Plan - Custom Pricing
- Unlimited users
- Unlimited API calls
- Dedicated account manager
- 24/7 phone support
- On-premise deployment option
- Custom SLA (up to 99.99%)
- SOC 2 Type II compliance

## Contact Information
- Sales: sales@techflow.io
- Support: support@techflow.io
- Phone: +1 (888) 555-TECH
- Hours: Monday-Friday, 9 AM - 6 PM PST

## FAQs

**Q: Do you offer free trials?**
A: Yes! We offer a 14-day free trial on all plans with no credit card required.

**Q: What technologies do you work with?**
A: We work with React, Next.js, Node.js, Python, TypeScript, PostgreSQL, Redis, and all major cloud platforms.

**Q: Can you integrate with our existing systems?**
A: Absolutely. We specialize in integrating with legacy systems, CRMs, ERPs, and third-party APIs.

**Q: What is your typical project timeline?**
A: Most projects take 4-12 weeks depending on complexity. We provide detailed timelines during our discovery phase.
`,
    testQueries: [
        {
            question: 'What services does TechFlow offer?',
            expectedKeywords: ['AI', 'machine learning', 'cloud', 'software', 'chatbot'],
            description: 'Service overview query',
        },
        {
            question: 'How much does the Professional plan cost?',
            expectedKeywords: ['$1,499', '1499', 'month', 'professional'],
            description: 'Pricing query',
        },
        {
            question: 'What is the uptime SLA for Enterprise?',
            expectedKeywords: ['99.99', 'SLA', 'uptime'],
            description: 'SLA details query',
        },
        {
            question: 'How can I contact TechFlow for support?',
            expectedKeywords: ['support@techflow.io', 'email', 'phone', '888'],
            description: 'Contact info query',
        },
        {
            question: 'Do you offer free trials?',
            expectedKeywords: ['14', 'day', 'trial', 'free', 'credit card'],
            description: 'FAQ query',
        },
    ],
};

// Logging utilities
const log = {
    info: (msg: string, data?: any) => console.log(`ℹ️  ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    success: (msg: string, data?: any) => console.log(`✅ ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    error: (msg: string, data?: any) => console.log(`❌ ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    warn: (msg: string, data?: any) => console.log(`⚠️  ${msg}`, data ? JSON.stringify(data, null, 2) : ''),
    step: (num: number, msg: string) => console.log(`\n📌 Step ${num}: ${msg}`),
    divider: () => console.log('\n' + '='.repeat(60) + '\n'),
};

interface TestResult {
    step: string;
    passed: boolean;
    duration: number;
    details?: any;
    error?: string;
}

const results: TestResult[] = [];
let supabase: SupabaseClient;
let tenantId: string;
let setupToken: string;

async function runStep(stepNum: number, name: string, fn: () => Promise<any>): Promise<any> {
    log.step(stepNum, name);
    const start = Date.now();

    try {
        const result = await fn();
        const duration = Date.now() - start;
        results.push({ step: name, passed: true, duration, details: result });
        log.success(`${name} completed in ${duration}ms`);
        return result;
    } catch (error: any) {
        const duration = Date.now() - start;
        results.push({ step: name, passed: false, duration, error: error.message });
        log.error(`${name} failed: ${error.message}`);
        throw error;
    }
}

async function createTenant(): Promise<{ tenantId: string; setupToken: string }> {
    const email = `e2e-${Date.now()}@techflow-test.com`;

    const res = await fetch(`${BASE_URL}/api/trial/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            businessName: TEST_CONFIG.businessName,
            businessType: TEST_CONFIG.businessType,
        }),
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    log.info(`Tenant created: ${data.tenantId}`);
    log.info(`Email: ${email}`);

    return { tenantId: data.tenantId, setupToken: data.setupToken };
}

async function submitKnowledgeBase(): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/trial/kb/manual`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${setupToken}`,
        },
        body: JSON.stringify({
            companyInfo: TEST_CONFIG.knowledgeBase,
            knowledgeBaseSources: ['manual'],
        }),
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    log.info(`Knowledge base submitted`, { jobId: data.jobId });
}

async function configureBranding(): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/trial/branding`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${setupToken}`,
        },
        body: JSON.stringify({
            primaryColor: '#2563eb',
            secondaryColor: '#7c3aed',
            tone: 'professional',
            welcomeMessage: 'Welcome to TechFlow Solutions! How can I help you today?',
            platform: 'playground',
            framework: 'react',
        }),
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || `HTTP ${res.status}`);
    }
}

async function waitForPipelineReady(maxAttempts = 30, intervalMs = 2000): Promise<{ vectorCount: number }> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const res = await fetch(`${BASE_URL}/api/tenants/${tenantId}/pipeline-ready`, {
            headers: { 'Authorization': `Bearer ${setupToken}` },
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        log.info(`Attempt ${attempt}/${maxAttempts}: ready=${data.ready}, ragStatus=${data.ragStatus}, vectors=${data.vectorCount}`);

        if (data.ready) {
            return { vectorCount: data.vectorCount };
        }

        if (data.ragStatus === 'failed') {
            throw new Error('RAG pipeline failed to build');
        }

        await new Promise(r => setTimeout(r, intervalMs));
    }

    throw new Error(`Pipeline did not become ready within ${maxAttempts * intervalMs / 1000}s`);
}

async function resetTrialQuota(): Promise<void> {
    // Reset the trial quota to allow queries
    const { error } = await supabase
        .from('trials')
        .update({ queries_used: 0, queries_limit: 100 })
        .eq('tenant_id', tenantId);

    if (error) {
        log.warn(`Could not reset quota: ${error.message}`);
    } else {
        log.info('Trial quota reset to 100 queries');
    }
}

async function testPlaygroundQuery(query: string, expectedKeywords: string[]): Promise<{
    answer: string;
    sources: number;
    keywordsFound: string[];
    keywordsMissing: string[];
    passed: boolean;
}> {
    const res = await fetch(`${BASE_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tenant_id: tenantId,
            trial_token: setupToken,
            query,
        }),
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || error.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const answer = (data.answer || '').toLowerCase();

    const keywordsFound = expectedKeywords.filter(kw => answer.includes(kw.toLowerCase()));
    const keywordsMissing = expectedKeywords.filter(kw => !answer.includes(kw.toLowerCase()));
    const passed = keywordsFound.length >= Math.ceil(expectedKeywords.length * 0.5); // 50% threshold

    return {
        answer: data.answer?.substring(0, 200) + '...',
        sources: data.sources?.length || 0,
        keywordsFound,
        keywordsMissing,
        passed,
    };
}

async function testStreamingChat(): Promise<{
    ttft: number;
    tokenCount: number;
    totalTime: number;
    responsePreview: string;
}> {
    // Create a chat session - session_id must be UUID (DB constraint)
    const sessionId = crypto.randomUUID();

    const { error: insertError } = await supabase.from('chat_sessions').insert({
        session_id: sessionId,
        tenant_id: tenantId,
        visitor_id: 'e2e-test-visitor',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        metadata: { test: true },
    });

    if (insertError) {
        throw new Error(`Failed to create chat session: ${insertError.message}`);
    }

    const startTime = Date.now();
    const res = await fetch(`${BASE_URL}/api/widget/chat?stream=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId,
            message: 'What are the pricing plans available?',
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

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let tokenCount = 0;
    let ttft: number | null = null;

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
                        // Widget/chat sends: {token, partial} for tokens
                        // Or {metadata: {...}} for sources
                        // Or {done: true, final, ...} for completion
                        if (parsed.token) {
                            if (ttft === null) {
                                ttft = Date.now() - startTime;
                            }
                            fullResponse += parsed.token;
                            tokenCount++;
                        } else if (parsed.done && parsed.final) {
                            // Final message - use full response
                            fullResponse = parsed.final;
                        }
                    } catch {
                        // Ignore parse errors
                    }
                }
            }
        }
    }

    const totalTime = Date.now() - startTime;

    // Cleanup session
    await supabase.from('chat_sessions').delete().eq('session_id', sessionId);

    return {
        ttft: ttft || 0,
        tokenCount,
        totalTime,
        responsePreview: fullResponse.substring(0, 150) + '...',
    };
}

async function cleanupTenant(): Promise<void> {
    log.info(`Cleaning up tenant ${tenantId}...`);

    // Delete in correct order due to FK constraints
    await supabase.from('embeddings').delete().eq('tenant_id', tenantId);
    await supabase.from('knowledge_base').delete().eq('tenant_id', tenantId);
    await supabase.from('chat_sessions').delete().eq('tenant_id', tenantId);
    await supabase.from('ingestion_jobs').delete().eq('tenant_id', tenantId);
    await supabase.from('trials').delete().eq('tenant_id', tenantId);
    await supabase.from('widget_configs').delete().eq('tenant_id', tenantId);
    await supabase.from('tenant_capabilities').delete().eq('tenant_id', tenantId);
    await supabase.from('tenants').delete().eq('tenant_id', tenantId);

    log.info('Tenant cleanup complete');
}

async function printSummary(): Promise<void> {
    log.divider();
    console.log('📊 TEST SUMMARY');
    log.divider();

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    for (const r of results) {
        const icon = r.passed ? '✅' : '❌';
        console.log(`${icon} ${r.step}: ${r.duration}ms`);
        if (r.error) console.log(`   Error: ${r.error}`);
    }

    log.divider();
    console.log(`Total: ${passed}/${results.length} passed, ${failed} failed`);
    console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    if (failed === 0) {
        console.log('\n🎉 ALL TESTS PASSED - Production Ready!');
    } else {
        console.log('\n⚠️  Some tests failed. Review the output above.');
    }
}

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 PRODUCTION E2E: Tenant Creation & Chatbot Test');
    console.log('='.repeat(60));
    console.log(`\nBase URL: ${BASE_URL}`);
    console.log(`Keep Tenant: ${KEEP_TENANT}`);

    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        // Step 1: Create Tenant
        const tenant = await runStep(1, 'Create Tenant', createTenant);
        tenantId = tenant.tenantId;
        setupToken = tenant.setupToken;

        // Step 2: Submit Knowledge Base
        await runStep(2, 'Submit Knowledge Base', submitKnowledgeBase);

        // Step 3: Configure Branding
        await runStep(3, 'Configure Branding', configureBranding);

        // Step 4: Wait for Pipeline Ready
        const pipeline = await runStep(4, 'Wait for Pipeline Ready', waitForPipelineReady);
        log.info(`Vectors indexed: ${pipeline.vectorCount}`);

        // Step 5: Reset Trial Quota
        await runStep(5, 'Reset Trial Quota', resetTrialQuota);

        // Step 6: Test Playground Queries
        await runStep(6, 'Test Playground Queries', async () => {
            const queryResults = [];

            for (const testCase of TEST_CONFIG.testQueries) {
                log.info(`Testing: ${testCase.description}`);
                const result = await testPlaygroundQuery(testCase.question, testCase.expectedKeywords);

                if (result.passed) {
                    log.success(`Query passed: ${result.keywordsFound.length}/${testCase.expectedKeywords.length} keywords found`);
                } else {
                    log.warn(`Query weak: Missing keywords: ${result.keywordsMissing.join(', ')}`);
                }
                log.info(`Response preview: ${result.answer}`);

                queryResults.push({
                    question: testCase.question,
                    ...result,
                });

                // Small delay between queries
                await new Promise(r => setTimeout(r, 500));
            }

            const passedQueries = queryResults.filter(r => r.passed).length;
            if (passedQueries < queryResults.length * 0.6) {
                throw new Error(`Only ${passedQueries}/${queryResults.length} queries passed (need 60%)`);
            }

            return { passedQueries, totalQueries: queryResults.length };
        });

        // Step 7: Test Streaming Chat
        await runStep(7, 'Test Streaming Chat', async () => {
            const result = await testStreamingChat();
            log.info(`TTFT: ${result.ttft}ms`);
            log.info(`Tokens received: ${result.tokenCount}`);
            log.info(`Total time: ${result.totalTime}ms`);
            log.info(`Response: ${result.responsePreview}`);

            // Dev server has higher latency due to Turbopack compilation
            const maxTTFT = process.env.NODE_ENV === 'production' ? 5000 : 15000;
            if (result.ttft > maxTTFT) {
                throw new Error(`TTFT too slow: ${result.ttft}ms (should be < ${maxTTFT}ms)`);
            }
            if (result.tokenCount < 10) {
                throw new Error(`Too few tokens: ${result.tokenCount} (should be > 10)`);
            }

            return result;
        });

        // Cleanup (unless --keep flag)
        if (!KEEP_TENANT) {
            await runStep(8, 'Cleanup Tenant', cleanupTenant);
        } else {
            log.info('Skipping cleanup (--keep flag set)');
            log.info(`Tenant ID for manual testing: ${tenantId}`);
        }

    } catch (error: any) {
        log.error(`Test failed: ${error.message}`);

        // Cleanup on failure unless --keep
        if (!KEEP_TENANT && tenantId) {
            log.info('Cleaning up after failure...');
            try {
                await cleanupTenant();
            } catch (cleanupError: any) {
                log.warn(`Cleanup failed: ${cleanupError.message}`);
            }
        }
    }

    await printSummary();
    process.exit(results.every(r => r.passed) ? 0 : 1);
}

main().catch(console.error);
