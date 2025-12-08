/**
 * Lightweight adapter layer between LangChain Document shapes and LlamaIndex document shapes.
 * This file purposefully avoids a hard dependency on either package so it can be
 * used during a gradual migration.
 */

export interface LlamaIndexDoc {
  content: string;
  metadata?: Record<string, any>;
  id?: string;
}

export interface LangChainDocShape {
  pageContent?: string;
  content?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export function isLangChainDoc(obj: any): obj is LangChainDocShape {
  return !!obj && (typeof obj.pageContent === 'string' || typeof obj.content === 'string');
}

export function isLlamaIndexDoc(obj: any): obj is LlamaIndexDoc {
  return !!obj && (typeof obj.content === 'string');
}

export function langchainToLlama(doc: LangChainDocShape): LlamaIndexDoc {
  const content = doc.pageContent ?? doc.content ?? (doc.text ?? '');
  const metadata = doc.metadata ?? {};
  const id = (metadata && (metadata.id ?? metadata.documentId)) ?? undefined;
  return { content, metadata, id };
}

export function llamaToLangchainShape(doc: LlamaIndexDoc): LangChainDocShape {
  return { pageContent: doc.content, metadata: doc.metadata ?? {} };
}

export function convertArrayLangchainToLlama(docs: any[]): LlamaIndexDoc[] {
  return docs.map(langchainToLlama);
}

export function convertArrayLlamaToLangchain(docs: LlamaIndexDoc[]): LangChainDocShape[] {
  return docs.map(llamaToLangchainShape);
}

/**
 * Helper that tries to instantiate a real LangChain Document if the package
 * is available at runtime, otherwise falls back to a plain object shape.
 */
export async function makeLangChainDocument(doc: LlamaIndexDoc): Promise<any> {
  // LangChain is fully removed; always return plain object
  return { pageContent: doc.content, metadata: doc.metadata };
}
