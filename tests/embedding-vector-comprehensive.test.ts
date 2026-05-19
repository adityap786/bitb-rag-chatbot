/**
 * Comprehensive Embedding Service & Vector Storage Tests
 * 
 * Tests:
 * - Embedding generation (unit & integration)
 * - Vector storage (Supabase insertion/retrieval)
 * - Edge cases & error handling
 * - Performance benchmarks
 * - Real-world scenarios
 * 
 * Run with: npm test tests/embedding-vector-comprehensive.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateEmbeddings, generateEmbeddingsBatched, quantizeToInt8, dequantizeFromInt8 } from '../src/lib/embeddings/batched-generator';
import { insertEmbeddings, semanticSearch } from '../src/lib/trial/rag-pipeline';
import { chunkText } from '../src/lib/trial/rag-pipeline';
import { createClient } from '@supabase/supabase-js';

const TEST_TENANT_ID = 'test-tenant-embedding-' + Date.now();
const TEST_KB_ID = 'test-kb-' + Date.now();

// Helper to check if embedding service is running
async function isEmbeddingServiceAvailable(): Promise<boolean> {
    try {
        await generateEmbeddings(['test']);
        return true;
    } catch {
        return false;
    }
}

describe('Embedding Service Tests', () => {
    let serviceAvailable = false;

    beforeAll(async () => {
        serviceAvailable = await isEmbeddingServiceAvailable();
        if (!serviceAvailable) {
            console.warn('⚠️  Embedding service not available - some tests will be skipped');
        }
    });

    describe('Unit Tests', () => {
        it('should generate embeddings for single text', async () => {
            if (!serviceAvailable) return;

            const texts = ['Hello world'];
            const embeddings = await generateEmbeddings(texts);

            expect(embeddings).toHaveLength(1);
            expect(embeddings[0]).toHaveLength(768); // MPNet dimension
            expect(embeddings[0]).toBeInstanceOf(Array);
            expect(typeof embeddings[0][0]).toBe('number');
        });

        it('should generate embeddings for multiple texts', async () => {
            if (!serviceAvailable) return;

            const texts = [
                'Machine learning is fascinating',
                'Database optimization techniques',
                'Cloud architecture patterns',
            ];
            const embeddings = await generateEmbeddings(texts);

            expect(embeddings).toHaveLength(3);
            expect(embeddings.every(e => e.length === 768)).toBe(true);
        });

        it('should handle empty input', async () => {
            const embeddings = await generateEmbeddings([]);
            expect(embeddings).toHaveLength(0);
        });

        it('should handle batch processing (10 texts)', async () => {
            if (!serviceAvailable) return;

            const texts = Array.from({ length: 10 }, (_, i) => `Document ${i}`);
            const embeddings = await generateEmbeddingsBatched(texts, { batchSize: 5 });

            expect(embeddings).toHaveLength(10);
            expect(embeddings.every(e => (e as number[]).length === 768)).toBe(true);
        });

        it('should handle large batch (100 texts)', async () => {
            if (!serviceAvailable) return;

            const texts = Array.from({ length: 100 }, (_, i) => `Test document ${i}`);
            const start = Date.now();
            const embeddings = await generateEmbeddingsBatched(texts, {
                batchSize: 32,
                maxParallel: 3,
            });
            const elapsed = Date.now() - start;

            expect(embeddings).toHaveLength(100);
            console.log(`   ✓ 100 texts embedded in ${elapsed}ms (${(elapsed / 100).toFixed(2)}ms/text)`);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty strings', async () => {
            if (!serviceAvailable) return;

            const texts = ['', ' ', '\n'];
            const embeddings = await generateEmbeddings(texts);

            expect(embeddings).toHaveLength(3);
            expect(embeddings.every(e => e.length === 768)).toBe(true);
        });

        it('should handle very long text (>10k chars)', async () => {
            if (!serviceAvailable) return;

            const longText = 'Lorem ipsum dolor sit amet. '.repeat(500); // ~14k chars
            const embeddings = await generateEmbeddings([longText]);

            expect(embeddings).toHaveLength(1);
            expect(embeddings[0]).toHaveLength(768);
        });

        it('should handle special characters & Unicode', async () => {
            if (!serviceAvailable) return;

            const texts = [
                'Héllo wörld! 你好世界',
                'Emojis: 🚀🔥💡',
                'Special: @#$%^&*()',
                'HTML: <div>test</div>',
            ];
            const embeddings = await generateEmbeddings(texts);

            expect(embeddings).toHaveLength(4);
            expect(embeddings.every(e => e.length === 768)).toBe(true);
        });

        it('should handle code snippets', async () => {
            if (!serviceAvailable) return;

            const code = `
        function hello() {
          console.log("Hello, world!");
          return 42;
        }
      `;
            const embeddings = await generateEmbeddings([code]);

            expect(embeddings).toHaveLength(1);
            expect(embeddings[0]).toHaveLength(768);
        });
    });

    describe('Semantic Similarity', () => {
        it('should produce similar embeddings for similar texts', async () => {
            if (!serviceAvailable) return;

            const texts = [
                'The cat sits on the mat',
                'A cat is sitting on a mat',
                'The dog runs in the park',
            ];
            const embeddings = await generateEmbeddings(texts);

            // Cosine similarity helper
            const cosineSimilarity = (a: number[], b: number[]) => {
                const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
                const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
                const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
                return dotProduct / (magA * magB);
            };

            const sim_0_1 = cosineSimilarity(embeddings[0], embeddings[1]); // Similar
            const sim_0_2 = cosineSimilarity(embeddings[0], embeddings[2]); // Different

            console.log(`   ✓ Similar texts similarity: ${sim_0_1.toFixed(4)}`);
            console.log(`   ✓ Different texts similarity: ${sim_0_2.toFixed(4)}`);

            // Similar texts should have higher similarity
            expect(sim_0_1).toBeGreaterThan(sim_0_2);
            expect(sim_0_1).toBeGreaterThan(0.7); // Threshold for "similar"
        });

        it('should be consistent (same input → same output)', async () => {
            if (!serviceAvailable) return;

            const text = 'Consistency test for embeddings';
            const embeddings1 = await generateEmbeddings([text]);
            const embeddings2 = await generateEmbeddings([text]);

            // Should be identical (or very close due to floating point)
            const maxDiff = Math.max(...embeddings1[0].map((val, i) => Math.abs(val - embeddings2[0][i])));
            expect(maxDiff).toBeLessThan(1e-6);
        });
    });

    describe('Quantization Tests', () => {
        it('should quantize fp32 to int8', () => {
            const fp32Embeddings = [[0.5, -0.5, 1.0, -1.0, 0.0]];
            const int8Embeddings = quantizeToInt8(fp32Embeddings);

            expect(int8Embeddings).toHaveLength(1);
            expect(int8Embeddings[0]).toBeInstanceOf(Int8Array);
            expect(int8Embeddings[0][0]).toBe(64);   // 0.5 * 127 ≈ 64
            expect(int8Embeddings[0][1]).toBe(-64);  // -0.5 * 127 ≈ -64
            expect(int8Embeddings[0][2]).toBe(127);  // 1.0 * 127 = 127
            expect(int8Embeddings[0][3]).toBe(-127); // -1.0 * 127 = -127
            expect(int8Embeddings[0][4]).toBe(0);    // 0.0 * 127 = 0
        });

        it('should dequantize int8 back to fp32', () => {
            const int8Array = new Int8Array([127, -127, 64, -64, 0]);
            const fp32Array = dequantizeFromInt8(int8Array);

            expect(fp32Array).toHaveLength(5);
            expect(fp32Array[0]).toBeCloseTo(1.0, 2);
            expect(fp32Array[1]).toBeCloseTo(-1.0, 2);
            expect(fp32Array[2]).toBeCloseTo(0.504, 2); // 64/127 ≈ 0.504
            expect(fp32Array[3]).toBeCloseTo(-0.504, 2);
            expect(fp32Array[4]).toBe(0.0);
        });

        it('should preserve similarity after quantization', async () => {
            if (!serviceAvailable) return;

            const texts = ['Test document one', 'Test document two'];
            const fp32Embeddings = await generateEmbeddings(texts);
            const int8Embeddings = quantizeToInt8(fp32Embeddings);
            const dequantized = int8Embeddings.map(dequantizeFromInt8);

            // Similarity should be preserved (with some loss)
            const cosineSim = (a: number[], b: number[]) => {
                const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
                const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
                const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
                return dot / (magA * magB);
            };

            const originalSim = cosineSim(fp32Embeddings[0], fp32Embeddings[1]);
            const quantizedSim = cosineSim(dequantized[0], dequantized[1]);

            console.log(`   ✓ Original similarity: ${originalSim.toFixed(4)}`);
            console.log(`   ✓ Quantized similarity: ${quantizedSim.toFixed(4)}`);
            console.log(`   ✓ Difference: ${Math.abs(originalSim - quantizedSim).toFixed(4)}`);

            // Should be close (within 10% relative error)
            expect(Math.abs(originalSim - quantizedSim)).toBeLessThan(0.1);
        });
    });

    describe('Performance Benchmarks', () => {
        it('should handle 1000 texts efficiently', async () => {
            if (!serviceAvailable) return;

            const texts = Array.from({ length: 1000 }, (_, i) =>
                `Performance test document ${i} with some content to embed`
            );

            const start = Date.now();
            const embeddings = await generateEmbeddingsBatched(texts, {
                batchSize: 64,
                maxParallel: 4,
            });
            const elapsed = Date.now() - start;

            expect(embeddings).toHaveLength(1000);

            console.log(`\n   📊 Embedding 1000 texts:`);
            console.log(`      Total time: ${elapsed}ms`);
            console.log(`      Per text: ${(elapsed / 1000).toFixed(2)}ms`);
            console.log(`      Throughput: ${Math.round(1000 / (elapsed / 1000))} texts/second`);

            // Should be reasonably fast (< 60s for 1000 texts)
            expect(elapsed).toBeLessThan(60000);
        });
    });
});

describe('Vector Storage Tests', () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseConfigured = !!(supabaseUrl && supabaseKey);

    describe('Vector Insertion', () => {
        it('should insert embeddings into Supabase', async () => {
            if (!supabaseConfigured) {
                console.warn('⚠️  Supabase not configured - skipping');
                return;
            }

            const chunks = [
                { kbId: TEST_KB_ID, text: 'Test chunk 1', metadata: { index: 0 } },
                { kbId: TEST_KB_ID, text: 'Test chunk 2', metadata: { index: 1 } },
            ];
            const embeddings = [[...Array(768)].map(() => Math.random()), [...Array(768)].map(() => Math.random())];

            await expect(
                insertEmbeddings(TEST_TENANT_ID, chunks, embeddings)
            ).resolves.not.toThrow();
        });

        it('should handle empty chunks', async () => {
            await expect(
                insertEmbeddings(TEST_TENANT_ID, [], [])
            ).resolves.not.toThrow();
        });
    });

    describe('Vector Retrieval', () => {
        it('should retrieve similar vectors', async () => {
            if (!supabaseConfigured) {
                console.warn('⚠️  Supabase not configured - skipping');
                return;
            }

            // Insert test data first
            const chunks = [
                { kbId: TEST_KB_ID, text: 'Machine learning algorithms', metadata: {} },
                { kbId: TEST_KB_ID, text: 'Deep learning networks', metadata: {} },
                { kbId: TEST_KB_ID, text: 'Cooking pasta recipes', metadata: {} },
            ];

            const serviceAvailable = await isEmbeddingServiceAvailable();
            if (!serviceAvailable) {
                console.warn('⚠️ Embedding service not available - skipping');
                return;
            }

            const texts = chunks.map(c => c.text);
            const embeddings = await generateEmbeddings(texts);
            await insertEmbeddings(TEST_TENANT_ID, chunks, embeddings);

            // Search for "AI and machine learning"
            const results = await semanticSearch(TEST_TENANT_ID, 'AI and machine learning', 2, 0.5);

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].chunk_text).toContain('learning');
            console.log(`   ✓ Top result: "${results[0].chunk_text}" (similarity: ${results[0].similarity?.toFixed(4)})`);
        });
    });

    afterAll(async () => {
        // Cleanup test data
        if (supabaseConfigured) {
            const supabase = createClient(supabaseUrl!, supabaseKey!);
            await supabase.from('embeddings').delete().eq('tenant_id', TEST_TENANT_ID);
            await supabase.from('knowledge_base').delete().eq('tenant_id', TEST_TENANT_ID);
        }
    });
});

describe('Integration Tests - End-to-End', () => {
    const serviceAvailable = false; // Will be set in beforeAll

    beforeAll(async () => {
        // Check if services are available
    });

    it('should handle complete RAG pipeline: chunk → embed → store → retrieve', async () => {
        const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
        if (!supabaseConfigured) {
            console.warn('⚠️  Skipping end-to-end test (services not configured)');
            return;
        }

        const serviceAvailable = await isEmbeddingServiceAvailable();
        if (!serviceAvailable) {
            console.warn('⚠️  Skipping end-to-end test (embedding service not available)');
            return;
        }

        // Step 1: Chunk text
        const document = 'This is a comprehensive guide to machine learning algorithms and their applications in real-world scenarios. We cover supervised learning, unsupervised learning, and reinforcement learning techniques.';
        const chunks = chunkText(document, 100, 20);
        expect(chunks.length).toBeGreaterThan(0);
        console.log(`   ✓ Chunked into ${chunks.length} pieces`);

        // Step 2: Generate embeddings
        const embeddings = await generateEmbeddings(chunks);
        expect(embeddings).toHaveLength(chunks.length);
        console.log(`   ✓ Generated ${embeddings.length} embeddings`);

        // Step 3: Store in Supabase
        const embeddingChunks = chunks.map((text, i) => ({
            kbId: TEST_KB_ID,
            text,
            metadata: { chunk_index: i },
        }));
        await insertEmbeddings(TEST_TENANT_ID, embeddingChunks, embeddings);
        console.log(`   ✓ Stored ${embeddings.length} vectors`);

        // Step 4: Retrieve similar chunks
        const results = await semanticSearch(TEST_TENANT_ID, 'machine learning', 3, 0.5);
        expect(results.length).toBeGreaterThan(0);
        console.log(`   ✓ Retrieved ${results.length} similar chunks`);
        console.log(`   ✓ Top match: "${results[0].chunk_text?.substring(0, 50)}..."`);
    });
});
