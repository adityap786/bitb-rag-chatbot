import { describe, expect, it } from 'vitest';
import { INGESTION_STEP_LABELS } from '@/types/ingestion';

describe('MultiStepLoader copy', () => {
  it('uses the approved loader copybook', () => {
    expect(Object.values(INGESTION_STEP_LABELS)).toMatchInlineSnapshot(`
      [
        "Setting up your chatbot — this may take a few minutes…",
        "Starting ingestion of your business knowledge…",
        "Chunking documents with LlamaIndex…",
        "Generating vector embeddings from chunks…",
        "Storing vectors in Redis and finalizing the RAG pipeline…",
        "All done — your chatbot is ready in the Playground!",
      ]
    `);
  });
});
