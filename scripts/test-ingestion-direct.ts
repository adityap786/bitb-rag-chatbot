/**
 * Direct Supabase Ingestion Test
 * Tests document ingestion directly via Supabase retriever
 */

import { TEST_TENANT_ID } from './setup-test-tenant';
import { addDocumentsToTenant } from '../src/lib/rag/supabase-retriever';
import { createClient } from '@supabase/supabase-js';

async function testDirectIngestion() {
  console.log('🧪 Testing Direct RAG Ingestion\n');
  console.log('Test Tenant ID:', TEST_TENANT_ID, '\n');

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Test documents
    const testDocuments = [
      {
        pageContent: `
Welcome to BiTB RAG Chatbot!

We are a cutting-edge AI-powered customer support platform that helps businesses 
provide instant, accurate responses to customer inquiries. Our system uses 
Retrieval-Augmented Generation (RAG) to combine the power of large language models 
with your company's specific knowledge base.
        `,
        metadata: { source: 'test', type: 'about' }
      },
      {
        pageContent: `
Key Features:
- Multi-tenant architecture for SaaS deployment
- Advanced semantic search with vector embeddings
- Hybrid retrieval combining vector and keyword search
- Customizable branding and widget configuration
- Real-time analytics and usage tracking
- Enterprise-grade security with Row-Level Security
        `,
        metadata: { source: 'test', type: 'features' }
      },
      {
        pageContent: `
Pricing Plans:
- Trial: Free 14-day trial with 100 queries/day
- Starter: $49/month for 1,000 queries/day
- Professional: $199/month for 10,000 queries/day
- Enterprise: Custom pricing for unlimited usage
        `,
        metadata: { source: 'test', type: 'pricing' }
      }
    ];

    console.log('1️⃣ Adding documents to tenant...');
    console.log(`   Documents: ${testDocuments.length}`);
    
    const documentIds = await addDocumentsToTenant(TEST_TENANT_ID, testDocuments);
    
    console.log('✅ Documents added successfully');
    console.log(`   Document IDs: ${documentIds.length}`);
    documentIds.slice(0, 3).forEach((id, i) => {
      console.log(`   ${i + 1}. ${id}`);
    });

    // Wait a moment for processing
    console.log('\n   ⏳ Waiting for embeddings to be generated...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    //Check embeddings
    console.log('\n2️⃣ Verifying embeddings in database...');
    
    const { count: embeddingsCount, error: countError } = await supabase
      .from('embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', TEST_TENANT_ID);

    if (countError) {
      console.log('❌ Error checking embeddings:', countError.message);
    } else {
      console.log('✅ Embeddings created:', embeddingsCount || 0);
    }

    // Get sample embeddings
    const { data: sampleEmbeddings } = await supabase
      .from('embeddings')
      .select('id, content, created_at')
      .eq('tenant_id', TEST_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(3);

    if (sampleEmbeddings && sampleEmbeddings.length > 0) {
      console.log('\n   Sample embeddings:');
      sampleEmbeddings.forEach((emb: any, i: number) => {
        console.log(`   ${i + 1}. ID: ${emb.id}`);
        console.log(`      Content: ${emb.content.substring(0, 60).trim()}...`);
      });
    }

    // Test vector search
    console.log('\n3️⃣ Testing vector search...');
    
    // Check which embedding column is in use
    const use384 = process.env.USE_EMBEDDING_384 === 'true';
    const embeddingColumn = use384 ? 'embedding_384' : 'embedding';
    const rpcName = use384 ? 'match_embeddings_by_tenant_384' : 'match_embeddings_by_tenant';
    
    const { data: firstEmbedding } = await supabase
      .from('embeddings')
      .select(`id,${embeddingColumn}`)
      .eq('tenant_id', TEST_TENANT_ID)
      .not(embeddingColumn, 'is', null)
      .limit(1)
      .single();

    if (firstEmbedding?.[embeddingColumn]) {
      // Note: match_embeddings_by_tenant_384 doesn't have match_threshold param
      const rpcParams: any = {
        query_embedding: firstEmbedding[embeddingColumn],
        match_tenant_id: TEST_TENANT_ID,
        match_count: 5
      };
      
      // Legacy RPC has match_threshold parameter
      if (!use384) {
        rpcParams.match_threshold = 0.3;
      }
      
      const { data: searchResults, error: searchError } = await supabase
        .rpc(rpcName, rpcParams);

      if (searchError) {
        console.log('❌ Vector search failed:', searchError.message);
      } else {
        console.log(`✅ Vector search successful (using ${embeddingColumn})`);
        console.log(`   Results: ${searchResults?.length || 0}`);
        searchResults?.slice(0, 3).forEach((result: any, i: number) => {
          console.log(`   ${i + 1}. Similarity: ${result.similarity?.toFixed(4)}`);
          console.log(`      Content: ${result.content?.substring(0, 50).trim()}...`);
        });
      }
    } else {
      console.log(`⚠️  No embeddings with ${embeddingColumn} found for search test`);
    }

    // Check knowledge base
    console.log('\n4️⃣ Checking knowledge base entries...');
    const { data: kbEntries } = await supabase
      .from('knowledge_base')
      .select('kb_id, source_type, created_at')
      .eq('tenant_id', TEST_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('✅ Knowledge base entries:', kbEntries?.length || 0);
    kbEntries?.forEach((entry: any, i: number) => {
      console.log(`   ${i + 1}. ${entry.kb_id} (${entry.source_type || 'unknown'})`);
    });

    console.log('\n✅ Direct RAG Ingestion Test Complete!\n');
    console.log('📊 Summary:');
    console.log(`   - Documents ingested: ${testDocuments.length}`);
    console.log(`   - Document IDs: ${documentIds.length}`);
    console.log(`   - Embeddings: ${embeddingsCount || 0}`);
    console.log(`   - KB Entries: ${kbEntries?.length || 0}`);

    console.log('\n💡 Next: Test chat/query flow or API endpoints');

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
testDirectIngestion();
