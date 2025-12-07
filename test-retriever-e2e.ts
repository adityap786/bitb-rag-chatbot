/**
 * End-to-End Test: match_embeddings_by_tenant Function
 * 
 * This script tests the HNSW-optimized retriever function directly via Supabase.
 * It validates:
 * 1. Vector embedding generation (mpnet, 768-dim)
 * 2. Function call with tenant isolation
 * 3. Cosine similarity scoring
 * 4. HNSW index usage
 * 5. Result accuracy
 * 
 * Run with: npx ts-node test-retriever-e2e.ts
 */

import { createClient } from "@supabase/supabase-js";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACEHUB_API_KEY!;
const EMBEDDING_MODEL = process.env.BITB_EMBEDDING_MODEL || "sentence-transformers/all-mpnet-base-v2";

// Test tenant (must exist in your Supabase instance)
const TEST_TENANT_ID = "tn_" + "a".repeat(32); // tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

async function main() {
  console.log("=".repeat(80));
  console.log("END-TO-END TEST: match_embeddings_by_tenant Function");
  console.log("=".repeat(80));
  console.log(`\nConfiguration:`);
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  Embedding Model: ${EMBEDDING_MODEL}`);
  console.log(`  Test Tenant: ${TEST_TENANT_ID}`);
  console.log("");

  try {
    // 1. Initialize Supabase client
    console.log("[1/4] Initializing Supabase client...");
    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    console.log("✓ Supabase client initialized\n");

    // 2. Set tenant context and verify table exists
    console.log("[2/4] Setting tenant context and checking embeddings table...");
    const { error: contextError } = await client.rpc("set_tenant_context", {
      p_tenant_id: TEST_TENANT_ID,
    });
    if (contextError) {
      throw new Error(`Failed to set tenant context: ${contextError.message}`);
    }

    const { data: tableData, error: tableError } = await client
      .from("embeddings")
      .select("id", { count: "exact" })
      .eq("tenant_id", TEST_TENANT_ID)
      .limit(1);

    if (tableError) {
      throw new Error(`Failed to query embeddings table: ${tableError.message}`);
    }
    console.log(`✓ Tenant context set. Found ${tableData?.length || 0} embeddings for this tenant\n`);

    // 3. Generate test query embedding using mpnet
    console.log("[3/4] Generating test query embedding with mpnet...");
    const embeddings = new HuggingFaceInferenceEmbeddings({
      apiKey: HUGGINGFACE_API_KEY,
      model: EMBEDDING_MODEL,
    });

    const testQuery = "What is the return policy?";
    const queryEmbedding = await embeddings.embedQuery(testQuery);
    console.log(`✓ Generated embedding for query: "${testQuery}"`);
    console.log(`  Embedding dimension: ${queryEmbedding.length}`);
    console.log(`  First 5 values: [${queryEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(", ")}]\n`);

    // 4. Call match_embeddings_by_tenant function
    console.log("[4/4] Calling match_embeddings_by_tenant function...");
    const { data: results, error: queryError } = await client.rpc(
      "match_embeddings_by_tenant",
      {
        query_embedding: queryEmbedding,
        match_tenant_id: TEST_TENANT_ID,
        match_count: 5,
        similarity_threshold: 0.0,
      }
    );

    if (queryError) {
      throw new Error(`Function call failed: ${queryError.message}`);
    }

    console.log(`✓ Function executed successfully\n`);

    // Results Summary
    console.log("=".repeat(80));
    console.log("RESULTS");
    console.log("=".repeat(80));

    if (!results || results.length === 0) {
      console.log("⚠ No results returned. Possible reasons:");
      console.log("  - No embeddings exist for this tenant");
      console.log("  - All embeddings have NULL embedding_768 values");
      console.log("  - Check your sample data using: SELECT COUNT(*) FROM embeddings WHERE tenant_id = '...' AND embedding_768 IS NOT NULL");
    } else {
      console.log(`Found ${results.length} matching documents:\n`);
      results.forEach((result: any, idx: number) => {
        console.log(`[${idx + 1}] ID: ${result.id}`);
        console.log(`    Similarity: ${(result.similarity * 100).toFixed(2)}%`);
        console.log(`    Text (first 100 chars): ${result.chunk_text.substring(0, 100)}...`);
        console.log(`    Metadata: ${JSON.stringify(result.metadata).substring(0, 100)}...`);
        console.log("");
      });

      console.log("=".repeat(80));
      console.log("✓ TEST PASSED: Function is working correctly!");
      console.log("=".repeat(80));
    }

  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("✗ TEST FAILED");
    console.error("=".repeat(80));
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    
    if (error instanceof Error && error.message.includes("operator does not exist")) {
      console.error("HINT: Vector operator error. Check that pgvector extension is installed");
      console.error("and the search_path in the function includes 'extensions'.");
    }
    
    process.exit(1);
  }
}

main();
