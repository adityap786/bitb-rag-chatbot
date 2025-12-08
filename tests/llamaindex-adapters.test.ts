import { describe, expect, it } from 'vitest';
import {
  convertArrayLangchainToLlama,
  convertArrayLlamaToLangchain,
  isLangChainDoc,
  isLlamaIndexDoc,
  langchainToLlama,
  llamaToLangchainShape,
  makeLangChainDocument,
} from '@/lib/rag/llamaindex-adapters';

describe('llamaindex adapters', () => {
  const langchainSample = {
    pageContent: 'page payload',
    metadata: { id: 'doc-123', tenantId: 'tn_x', tenant_id: 'tn_x' },
  };

  const llamaSample = {
    content: 'llama payload',
    metadata: { id: 'llama-1', tenant_id: 'tn_y' },
  };

  it('detects LangChain document shapes', () => {
    expect(isLangChainDoc(langchainSample)).toBe(true);
    expect(isLangChainDoc({ content: 'inline content' })).toBe(true);
    expect(isLangChainDoc({ foo: 'bar' })).toBe(false);
  });

  it('detects LlamaIndex document shapes', () => {
    expect(isLlamaIndexDoc(llamaSample)).toBe(true);
    expect(isLlamaIndexDoc({})).toBe(false);
  });

  it('converts LangChain document to LlamaIndex shape preserving metadata', () => {
    const converted = langchainToLlama(langchainSample);
    expect(converted.content).toBe('page payload');
    expect(converted.metadata).toEqual(langchainSample.metadata);
    expect(converted.id).toBe('doc-123');
  });

  it('converts LlamaIndex document back to LangChain shape', () => {
    const converted = llamaToLangchainShape(llamaSample);
    expect(converted.pageContent).toBe('llama payload');
    expect(converted.metadata).toEqual(llamaSample.metadata);
  });

  it('supports array conversions in both directions', () => {
    const lame = convertArrayLangchainToLlama([langchainSample]);
    expect(lame).toHaveLength(1);
    expect(lame[0].content).toContain('page payload');

    const back = convertArrayLlamaToLangchain(lame);
    expect(back).toHaveLength(1);
    expect(back[0].pageContent).toBe('page payload');
  });

  it('builds a LangChain Document when available', async () => {
    const doc = await makeLangChainDocument({ content: 'dynamic', metadata: { id: 'dynamic-doc' } });
    expect(doc).toHaveProperty('pageContent', 'dynamic');
    expect(doc).toHaveProperty('metadata');
  });
});
