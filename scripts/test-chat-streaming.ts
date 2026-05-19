
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Load .env.local explicitly
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testStreaming() {
    const sessionId = crypto.randomUUID();
    const message = "What are the key benefits of using a RAG pipeline?";

    // Setup Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials in .env.local');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 0. Get Valid Tenant & Activate
    let tenantId = 'default';
    const { data: tenantData } = await supabase.from('tenants').select('tenant_id').limit(1).single();

    if (tenantData) {
        tenantId = tenantData.tenant_id;
        console.log(`Using existing tenant: ${tenantId}`);

        const now = new Date();
        now.setDate(now.getDate() + 30);

        // Update status to active and expires_at to future
        const { error: updateError } = await supabase.from('tenants').update({
            status: 'active',
            expires_at: now.toISOString(),
        }).eq('tenant_id', tenantId);

        if (updateError) console.warn('Failed to activate tenant:', updateError);
        else console.log('Activated tenant for test.');
    } else {
        console.warn('No tenants found, trying "default" fallback');
    }

    // 1. Create Session
    try {
        console.log(`Creating session: ${sessionId}`);
        const { error } = await supabase.from('chat_sessions').insert({
            session_id: sessionId,
            tenant_id: tenantId,
            messages: [],
            visitor_id: crypto.randomUUID(),
        });

        if (error) {
            console.error('Failed to create session:', error);
        }
    } catch (err) {
        console.warn('Session creation error (ignoring):', err);
    }

    console.log(`Testing streaming for Tenant: ${tenantId}, Session: ${sessionId}`);
    console.log(`Question: ${message}`);

    // Base URL - assumed local
    const baseUrl = 'http://localhost:3000';

    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let tokenCount = 0;

    try {
        const response = await fetch(`${baseUrl}/api/widget/chat?stream=true`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-ID': tenantId,
            },
            body: JSON.stringify({
                message,
                sessionId,
            }),
        });

        if (!response.ok) {
            console.error('API Error:', response.status, await response.text());
            return;
        }

        if (!response.body) {
            console.error('No response body for streaming');
            return;
        }

        // Node environment might return a strange body, ensure we can read it
        // @ts-ignore
        const reader = response.body.getReader ? response.body.getReader() : null;

        // Fallback for Node fetch if getReader is not available (undici usually has it)
        if (!reader) {
            console.log('Using iteration for body (Node fetch)');
            // @ts-ignore
            for await (const chunk of response.body) {
                const decoded = new TextDecoder().decode(chunk);
                processChunk(decoded);
            }
        } else {
            const decoder = new TextDecoder();
            console.log('--- Stream Started ---');
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                processChunk(chunk);
            }
        }
    } catch (error) {
        console.error('Test failed:', error);
    }

    function processChunk(chunk: string) {
        const now = Date.now();
        if (!firstTokenTime && chunk.trim()) {
            firstTokenTime = now;
            const ttft = firstTokenTime - startTime;
            console.log(`[Metrics] Time To First Token (TTFT): ${ttft}ms`);
        }

        const lines = chunk.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.replace('data: ', '').trim();
                if (dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    if (data.token) {
                        process.stdout.write(data.token);
                        tokenCount++;
                    } else if (data.done) {
                        console.log('\n--- Stream Complete ---');
                        console.log(`[Metrics] Total Tokens: ${tokenCount}`);
                        console.log(`[Metrics] Total Latency: ${Date.now() - startTime}ms`);
                        if (data.sources) {
                            console.log(`[Metadata] Sources: ${data.sources.length}`);
                        }
                    } else if (data.metadata && data.metadata.sources) {
                        // captured early sources
                    }
                } catch (e) {
                    // partial JSON
                }
            }
        }
    }
}

testStreaming();
