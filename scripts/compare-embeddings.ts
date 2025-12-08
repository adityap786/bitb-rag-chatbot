// Compare embeddings from LangChain and LlamaIndex for feature parity
import { generateEmbedding as generateLangChainEmbedding } from '../src/lib/rag/embedding-generator';
import { LlamaIndexEmbeddingService } from '../src/lib/rag/llamaindex-embeddings';

async function compareEmbeddings(texts: string[]) {
  // LangChain (HuggingFace) embeddings
  const langchainEmbeddings = await Promise.all(texts.map(generateLangChainEmbedding));

  // LlamaIndex (OpenAI) embeddings
  const llamaService = LlamaIndexEmbeddingService.getInstance();
  const llamaEmbeddings = await llamaService.embedBatch(texts);

  // Compare dimensions
  console.log('--- Embedding Dimension Comparison ---');
  langchainEmbeddings.forEach((emb, i) => {
    console.log(`LangChain [${i}]: ${emb.length} dims`);
  });
  llamaEmbeddings.forEach((emb, i) => {
    console.log(`LlamaIndex [${i}]: ${emb.length} dims`);
  });

  // Compare values (cosine similarity, etc. - here just print first 5 values)
  console.log('\n--- Embedding Value Samples ---');
  texts.forEach((text, i) => {
    console.log(`Text: ${text}`);
    console.log(`  LangChain:  ${langchainEmbeddings[i].slice(0,5).map(x=>x.toFixed(4)).join(', ')} ...`);
    console.log(`  LlamaIndex: ${llamaEmbeddings[i].slice(0,5).map(x=>x.toFixed(4)).join(', ')} ...`);
  });

  // Error handling test: pass invalid input
  try {
    await llamaService.embed("");
    console.log('LlamaIndex: No error on empty string');
  } catch (e) {
    if (e instanceof Error) {
      console.log('LlamaIndex: Error on empty string:', e.message);
    } else {
      console.log('LlamaIndex: Error on empty string:', e);
    }
  }
  try {
    await generateLangChainEmbedding("");
    console.log('LangChain: No error on empty string');
  } catch (e) {
    if (e instanceof Error) {
      console.log('LangChain: Error on empty string:', e.message);
    } else {
      console.log('LangChain: Error on empty string:', e);
    }
  }
}

const testInputs = [
  'Supabase is a backend as a service.',
  'OpenAI provides powerful language models.',
  'Test sentence for embedding comparison.'
];

compareEmbeddings(testInputs).catch(console.error);
