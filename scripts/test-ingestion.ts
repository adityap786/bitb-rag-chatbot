/**
 * Test RAG Ingestion Pipeline
 * Tests document ingestion, chunking, embedding, and storage
 */

import { TEST_TENANT_ID } from './setup-test-tenant';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function testIngestion() {
  console.log('🧪 Testing RAG Ingestion Pipeline\n');
  console.log('Test Tenant ID:', TEST_TENANT_ID);
  console.log('API Base:', API_BASE, '\n');

  try {
    // Test 1: Manual text ingestion
    console.log('1️⃣ Testing manual text ingestion...');
    const manualResponse = await fetch(`${API_BASE}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: TEST_TENANT_ID,
        trial_token: 'test_token',
        data_source: {
          type: 'manual',
          text: `
            Welcome to BiTB RAG Chatbot!
            
            We are a cutting-edge AI-powered customer support platform that helps businesses 
            provide instant, accurate responses to customer inquiries. Our system uses 
            Retrieval-Augmented Generation (RAG) to combine the power of large language models 
            with your company's specific knowledge base.
            
            Key Features:
            - Multi-tenant architecture for SaaS deployment
            - Advanced semantic search with vector embeddings
            - Hybrid retrieval combining vector and keyword search
            - Customizable branding and widget configuration
            - Real-time analytics and usage tracking
            - Enterprise-grade security with Row-Level Security
            
            Pricing Plans:
            - Trial: Free 14-day trial with 100 queries/day
            - Starter: $49/month for 1,000 queries/day
            - Professional: $199/month for 10,000 queries/day
            - Enterprise: Custom pricing for unlimited usage
            
            Technical Stack:
            - Next.js 15 for frontend and API routes
            - Supabase with PostgreSQL and pgvector
            - LlamaIndex for advanced RAG pipeline
            - LangChain for agent orchestration
            - OpenAI/Groq for embeddings and LLM inference
            
            Support:
            Email: support@bitb.ltd
            Documentation: https://docs.bitb.ltd
            Status Page: https://status.bitb.ltd
          `
        }
      })
    });

    const manualResult = await manualResponse.json();
    
    if (manualResponse.ok) {
      console.log('✅ Manual ingestion initiated');
      console.log('   Job ID:', manualResult.job_id);
      console.log('   Status:', manualResult.status);
      console.log('   Estimated time:', manualResult.estimated_time_minutes, 'minutes');
      
      // Wait for job to complete
      console.log('\n   ⏳ Waiting for ingestion to complete...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } else {
      console.log('❌ Manual ingestion failed:', manualResult.error);
    }

    // Test 2: Check if embeddings were created
    console.log('\n2️⃣ Verifying embeddings in database...');
    
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { count: embeddingsCount, error: countError } = await supabase
      .from('embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TEST_TENANT_ID);

    if (countError) {
      console.log('❌ Error checking embeddings:', countError.message);
    } else {
      console.log('✅ Embeddings created:', embeddingsCount || 0);
    }

    // Test 3: Check knowledge base entries
    const { data: kbEntries, error: kbError } = await supabase
      .from('knowledge_base')
      .select('kb_id, source_type, created_at')
      .eq('tenant_id', TEST_TENANT_ID);

    if (kbError) {
      console.log('❌ Error checking knowledge base:', kbError.message);
    } else {
      console.log('✅ Knowledge base entries:', kbEntries?.length || 0);
      kbEntries?.forEach(entry => {
        console.log(`   - ${entry.kb_id} (${entry.source_type})`);
      });
    }

    // Test 4: Check ingestion job status
    const { data: jobs, error: jobError } = await supabase
      .from('ingestion_jobs')
      .select('job_id, status, progress, chunks_created, embeddings_count, created_at')
      .eq('tenant_id', TEST_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(5);

    if (jobError) {
      console.log('❌ Error checking jobs:', jobError.message);
    } else {
      console.log('\n3️⃣ Recent ingestion jobs:');
      jobs?.forEach(job => {
        console.log(`   - ${job.job_id}`);
        console.log(`     Status: ${job.status}, Progress: ${job.progress}%`);
        console.log(`     Chunks: ${job.chunks_created}, Embeddings: ${job.embeddings_count}`);
      });
    }

    // Test 5: Test vector search
    console.log('\n4️⃣ Testing vector search...');
    
    // Get a sample embedding for search
    const { data: sampleEmbedding } = await supabase
      .from('embeddings')
      .select('embedding')
      .eq('tenant_id', TEST_TENANT_ID)
      .limit(1)
      .single();

    if (sampleEmbedding?.embedding) {
      const { data: searchResults, error: searchError } = await supabase
        .rpc('match_embeddings_by_tenant', {
          query_embedding: sampleEmbedding.embedding,
          match_tenant_id: TEST_TENANT_ID,
          match_threshold: 0.5,
          match_count: 3
        });

      if (searchError) {
        console.log('❌ Vector search failed:', searchError.message);
      } else {
        console.log('✅ Vector search successful');
        console.log('   Results:', searchResults?.length || 0);
        searchResults?.slice(0, 2).forEach((result: any, i: number) => {
          console.log(`   ${i + 1}. Similarity: ${result.similarity?.toFixed(4)}`);
          console.log(`      Content: ${result.content?.substring(0, 60)}...`);
        });
      }
    } else {
      console.log('⚠️  No embeddings available for vector search test');
    }

    console.log('\n✅ RAG Ingestion Pipeline Test Complete!\n');
    console.log('📊 Summary:');
    console.log(`   - Embeddings: ${embeddingsCount || 0}`);
    console.log(`   - KB Entries: ${kbEntries?.length || 0}`);
    console.log(`   - Jobs: ${jobs?.length || 0}`);

    console.log('\n💡 Next: Test chat/query flow');
    console.log('   Run: npm run test:chat');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('   Error:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
testIngestion();
