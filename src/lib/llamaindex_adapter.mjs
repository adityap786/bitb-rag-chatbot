import { enqueueIngestionJob } from './ingestion-queue.js';
/**
 * Enqueue an ingestion job for async processing via BullMQ/Redis.
 */
export async function enqueueIngestion(tenant_id, doc_id, content, metadata = {}, opts = {}) {
  const job = {
    tenant_id,
    doc_id,
    source: opts.source || 'upload',
    payload: { content },
    metadata: { ...metadata, ...opts }
  };
  return enqueueIngestionJob(job);
}
// Runtime-friendly Node ESM adapter for the LlamaIndex microservice
const BASE_URL = process.env.LLAMA_INDEX_SERVICE_URL || process.env.LLAMA_INDEX_URL || 'http://127.0.0.1:8000';

async function apiRequest(path, options = {}, retries = 2) {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutMs = Number(process.env.LLAMA_INDEX_REQUEST_TIMEOUT_MS || 15000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Merge headers safely and add API key if present
    let mergedHeaders = {};
    try {
      if (options.headers) {
        if (typeof Headers !== 'undefined' && options.headers instanceof Headers) {
          for (const [k, v] of options.headers.entries()) mergedHeaders[k] = v;
        } else if (Array.isArray(options.headers)) {
          for (const [k, v] of options.headers) mergedHeaders[k] = v;
        } else if (typeof options.headers === 'object') {
          mergedHeaders = { ...options.headers };
        }
      }
    } catch (e) {
      mergedHeaders = { ...(options.headers || {}) };
    }

    const apiKey = process.env.LLAMA_INDEX_API_KEY || process.env.LLAMA_INDEX_KEY || null;
    if (apiKey) mergedHeaders['authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(url, { ...options, headers: mergedHeaders, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LlamaIndex service error ${res.status} ${res.statusText}: ${text}`);
    }
    const json = await res.json();
    return json;
  } catch (err) {
    clearTimeout(timeout);
    if (retries > 0 && (err?.name === 'AbortError' || err?.code === 'ECONNREFUSED')) {
      return apiRequest(path, options, retries - 1);
    }
    throw err;
  }
}

export async function health() {
  return apiRequest('/health');
}

export async function ingest(tenant_id, doc_id, content, metadata = {}, opts = {}) {
  const qs = new URLSearchParams();
  if (opts.chunk === false) qs.set('chunk', 'false');
  if (opts.chunk_size) qs.set('chunk_size', String(opts.chunk_size));
  if (opts.overlap) qs.set('overlap', String(opts.overlap));

  const body = { tenant_id, doc_id, content, metadata };
  return apiRequest(`/ingest?${qs.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function ingestBatch(documents) {
  return apiRequest('/ingest/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documents }),
  });
}

export async function createIndex(tenant_id, name) {
  return apiRequest('/index/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant_id, name }),
  });
}

export async function deleteDoc(tenant_id, doc_id) {
  return apiRequest('/index/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant_id, doc_id }),
  });
}

export async function search(tenant_id, query, opts = {}) {
  const body = { tenant_id, query };
  if (opts.k) body.k = opts.k;
  if (typeof opts.hybrid === 'boolean') body.hybrid = opts.hybrid;
  if (typeof opts.rerank === 'boolean') body.rerank = opts.rerank;
  if (opts.filters) body.filters = opts.filters;

  return apiRequest('/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function embeddingsBatch(texts, provider, model, batch_size) {
  const body = { texts };
  if (provider) body.provider = provider;
  if (model) body.model = model;
  if (batch_size) body.batch_size = batch_size;

  return apiRequest('/embeddings/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default {
  health,
  ingest,
  ingestBatch,
  createIndex,
  deleteDoc,
  search,
  embeddingsBatch,
};
