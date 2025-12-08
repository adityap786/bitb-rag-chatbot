import { RetrievalPipeline } from './retrieval-pipeline';
import { SentenceSplitter } from './llamaindex-chunking';

(async () => {
  const chunker = new SentenceSplitter({ chunkSize: 512, chunkOverlap: 64 });

  // In-memory no-op vector store and keyword index for local testing
  const noOpVectorStore = {
    async upsertChunks(tenantId: string, chunks: any[]) {
      console.log('[noOpVectorStore] upsertChunks called for tenant', tenantId, 'chunks:', chunks.length);
      // Print first chunk for inspection
      if (chunks.length > 0) console.dir(chunks[0], { depth: 3 });
    },
    async query() { return []; },
  };

  const noOpKeywordIndex = {
    async upsertChunks(tenantId: string, chunks: any[]) {
      console.log('[noOpKeywordIndex] upsertChunks called for tenant', tenantId, 'chunks:', chunks.length);
      if (chunks.length > 0) console.dir({ content: chunks[0].content, metadata: chunks[0].metadata }, { depth: 3 });
    },
    async query() { return []; },
  };

  const pipeline = new RetrievalPipeline({
    chunker,
    vectorStore: noOpVectorStore,
    keywordIndex: noOpKeywordIndex,
    tenantId: 'tn_testtenant0000000000000000000000',
  } as any);

  const doc = {
    content: `OpenAI develops artificial intelligence technologies. The project focuses on language models, reinforcement learning, and safety research. Open-source and proprietary models are both considered. In addition, the project discusses embeddings and retrieval-augmented generation (RAG).`,
    metadata: { source: 'test-runner' },
  };

  const enriched = await pipeline.ingest(doc);
  console.log('\nEnriched chunks returned:', enriched.length);
  enriched.forEach((c, i) => {
    console.log(`--- chunk ${i} ---`);
    console.log('content:', c.content.slice(0, 200));
    console.log('metadata keys:', Object.keys(c.metadata));
  });

  process.exit(0);
})();