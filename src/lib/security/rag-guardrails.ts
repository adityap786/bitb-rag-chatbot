/**
 * RAG security guardrails - small, focused helpers
 * - validateTenantId: ensure tenant_id present (fail-closed)
 * - enforceContextLimits: limit number and length of chunks sent to LLM
 * - redactPII: mask common PII patterns
 *
 * Keep these functions small and dependency-free so they can be called
 * early in the request pipeline without side effects.
 */

export type RetrievedChunk = {
  text: string;
  chunk_id?: string;
  tenant_id?: string;
  similarity?: number;
  metadata?: Record<string, any>;
};

export const RAG_LIMITS = {
  MAX_CHUNKS_PER_QUERY: 5,
  MAX_CHUNK_LENGTH: 1500, // characters
  MAX_TOTAL_CONTEXT: 6000, // characters
};

export function validateTenantId(tenantId?: string): void {
  if (tenantId == null || tenantId === undefined || tenantId === '') {
    const e: any = new Error('RAG_SECURITY: TENANT_ID_REQUIRED');
    e.code = 'TENANT_ID_REQUIRED';
    throw e;
  }
  if (typeof tenantId !== 'string') {
    const e: any = new Error('tenant_id must be a string');
    e.code = 'TENANT_ID_TYPE';
    throw e;
  }
  // Must start with tn_ and be 35 chars (tn_ + 32 lowercase letters/numbers)
  if (!/^tn_[a-z0-9]{32}$/.test(tenantId)) {
    const e: any = new Error('Invalid tenant_id format');
    e.code = 'TENANT_ID_FORMAT';
    throw e;
  }
}

export function enforceContextLimits(chunks: RetrievedChunk[], limits = RAG_LIMITS): RetrievedChunk[] {
  if (!Array.isArray(chunks)) return [];

  // Limit number of chunks
  let selected = chunks.slice(0, limits.MAX_CHUNKS_PER_QUERY);

  // Truncate individual chunks
  selected = selected.map(c => ({
    ...c,
    text: c.text.length > limits.MAX_CHUNK_LENGTH ? c.text.slice(0, limits.MAX_CHUNK_LENGTH) : c.text,
  }));

  // Ensure total context doesn't exceed MAX_TOTAL_CONTEXT
  const out: RetrievedChunk[] = [];
  let total = 0;
  for (const c of selected) {
    const len = c.text ? c.text.length : 0;
    if (total + len > limits.MAX_TOTAL_CONTEXT) break;
    out.push(c);
    total += len;
  }

  return out;
}

const PII_PATTERNS: Record<string, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
};

export function redactPII(text: string): { redacted: string; foundPII: boolean } {
  if (!text || typeof text !== 'string') return { redacted: text || '', foundPII: false };

  let redacted = text;
  let foundPII = false;

  for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
    if (pattern.test(redacted)) {
      foundPII = true;
      redacted = redacted.replace(pattern, `[${type.toUpperCase()}_REDACTED]`);
    }
  }

  return { redacted, foundPII };
}

// Small helper to apply all guardrails before sending to LLM
export function prepareChunksForLLM(chunks: RetrievedChunk[], tenantId?: string) {
  validateTenantId(tenantId);
  const limited = enforceContextLimits(chunks);
  const sanitized = limited.map(c => {
    const { redacted } = redactPII(c.text || '');
    return { ...c, text: redacted } as RetrievedChunk;
  });
  return sanitized;
}
