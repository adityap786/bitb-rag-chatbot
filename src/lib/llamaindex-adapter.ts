/*
 * Node adapter for the LlamaIndex microservice.
 * Thin HTTP client used by the Node app to call the Python service.
 *
 * Usage:
 * import { ingestDocument, search } from '@/lib/llamaindex-adapter';
 */

const BASE = process.env.LLAMA_INDEX_SERVICE_URL || 'http://localhost:8000';

async function jsonFetch(path: string, opts: RequestInit = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLamaIndex service error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function ingestDocument(tenantId: string, docId: string, content: string, metadata?: Record<string, any>) {
  return jsonFetch('/ingest', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenantId, doc_id: docId, content, metadata }),
  });
}

export async function ingestBatch(documents: Array<{ tenant_id: string; doc_id: string; content: string; metadata?: Record<string, any> }>) {
  return jsonFetch('/ingest/batch', {
    method: 'POST',
    body: JSON.stringify({ documents }),
  });
}

export async function createIndex(tenantId: string, name?: string) {
  return jsonFetch('/index/create', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenantId, name }),
  });
}

export async function deleteDocument(tenantId: string, docId: string) {
  return jsonFetch('/index/delete', {
    method: 'POST',
    body: JSON.stringify({ tenant_id: tenantId, doc_id: docId }),
  });
}

export async function search(tenantId: string, query: string, opts: { k?: number; hybrid?: boolean; rerank?: boolean; filters?: Record<string, any> } = {}) {
  const payload = { tenant_id: tenantId, query, k: opts.k ?? 5, hybrid: opts.hybrid ?? false, rerank: opts.rerank ?? false, filters: opts.filters ?? undefined };
  return jsonFetch('/search', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export default {
  ingestDocument,
  ingestBatch,
  createIndex,
  deleteDocument,
  search,
};
