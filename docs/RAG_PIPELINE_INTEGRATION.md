# RAG Pipeline Integration - Complete Implementation

**Date:** November 17, 2025  
**Status:** ✅ Production Ready

## Overview

The BiTB RAG pipeline has been fully enhanced with **hybrid search**, **Groq Llama-3-70B LLM integration**, and **MCP deterministic tool architecture** for maximum power, accuracy, and production readiness.

---

## Architecture

### Hybrid Search Pipeline

**Components:**
1. **Semantic Vector Search** (Supabase pgvector)
   - Uses OpenAI embeddings for document encoding
   - Cosine similarity ranking
   - Tenant-isolated with RLS enforcement

2. **Keyword/Metadata Search**
   - Full-text search via Supabase ILIKE
   - Metadata boosting (title, source, section)
   - Query term frequency scoring

3. **Advanced Ranking**
   - Weighted score: `0.6 * semantic + 0.3 * keyword + 0.1 * metadata_boost`
   - Deduplication of near-identical results
   - Top-K selection with configurable threshold

### LLM Integration

**Default LLM:** Groq Llama-3-70B (`llama-3-groq-70b-8192-tool-use-preview`)

**Features:**
- Free tier usage via Groq Cloud API
- Per-tenant LLM provider/model override
- Fallback to extractive answers if LLM fails
- PII masking before LLM invocation
- Prompt templates optimized for RAG synthesis

**Environment Variables Required:**
```bash
GROQ_API_KEY=your_groq_api_key_here
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key_for_embeddings
```

---

## MCP Deterministic Tool: `mcpHybridRagQuery`

**Location:** `src/lib/ragPipeline.ts`

**Function Signature:**
```typescript
export async function mcpHybridRagQuery({
  tenantId: string,
  query: string,
  k?: number,
  llmProvider?: string,
  llmModel?: string
}): Promise<{
  answer: string;
  sources: Array<{
    title: string;
    chunk: string;
    score: number;
    index: number;
  }>;
  confidence: number;
  llmError: string | null;
  tool: string;
  llmProvider: string;
  llmModel: string;
}>
```

**Workflow:**
1. Run hybrid search (semantic + keyword + metadata)
2. Prepare context from top-K results
3. Call Groq Llama-3-70B for answer synthesis
4. Return structured response with sources and confidence

---

## Integration Points

### 1. MCP Handler (`src/lib/mcp/handlers.ts`)

**Tool:** `rag_query`

**Enhancements:**
- Uses `mcpHybridRagQuery` for all queries
- Respects per-tenant LLM preferences
- PII detection and masking before processing
- Audit logging for all operations
- Quota enforcement and rate limiting

### 2. Public API (`src/app/api/ask/route.ts`)

**Endpoint:** `POST /api/ask`

**Enhancements:**
- Integrated `mcpHybridRagQuery` for all tenant queries
- Multi-tenant isolation with RLS
- Real-time usage tracking and quota enforcement
- PII masking and audit logging
- Rate limiting per tenant

### 3. Widget Chat (`src/app/api/widget/chat/route.ts`)

**Endpoint:** `POST /api/widget/chat`

**Enhancements:**
- Uses `mcpHybridRagQuery` for widget interactions
- Session-aware chat with message history
- Groq Llama-3-70B for natural responses
- Real-time performance metrics

---

## Security & Compliance

### PII Masking
- All queries masked before LLM invocation
- Email, phone, SSN, credit card detection
- Audit logs use hashed sensitive data

### Tenant Isolation
- RLS policies enforce tenant_id filtering
- All queries validate tenant context
- No cross-tenant data leakage

### Audit Logging
- Every RAG query logged with metadata
- PII detection events tracked
- Performance metrics recorded
- Query success/failure tracking

### Quota Enforcement
- Trial users: 100 queries/3 days
- Rate limiting: 10 queries/minute per tenant
- Usage tracking in real-time

---

## Performance Optimization

### Hybrid Search Benefits
- **Recall:** Semantic search finds conceptually similar content
- **Precision:** Keyword search ensures exact term matches
- **Relevance:** Metadata boosting prioritizes high-value sources

### Advanced Ranking
- Deduplication reduces redundancy
- Score weighting optimizes for user intent
- Top-K selection minimizes LLM context size

### LLM Synthesis
- Groq Llama-3-70B: Fast inference (<2s typical)
- Context limited to top 4 results (max 1600 chars)
- Fallback to extractive answers ensures reliability

---

## Configuration

### Per-Tenant LLM Override

**Database:** `trials` table

**Fields:**
- `llm_provider`: `'groq'` | `'openai'` | custom
- `llm_model`: Model identifier (e.g., `'llama-3-groq-70b-8192-tool-use-preview'`)

**Example:**
```sql
UPDATE trials
SET llm_provider = 'groq',
    llm_model = 'llama-3-groq-70b-8192-tool-use-preview'
WHERE tenant_id = 'tn_abc123';
```

### Search Parameters

**Configurable:**
- `k`: Number of results to return (default: 4)
- `vectorWeight`: Semantic vs keyword balance (default: 0.6)
- `similarityThreshold`: Minimum semantic score (default: 0.0)

---

## Testing

### Unit Tests
- Hybrid search scoring accuracy
- PII masking effectiveness
- Deduplication logic

### Integration Tests
- End-to-end RAG query flow
- Multi-tenant isolation verification
- LLM fallback behavior

### Performance Tests
- Query latency under load
- Concurrent tenant queries
- Large knowledge base scalability

---

## Monitoring & Observability

### Metrics to Track
- Average query latency
- LLM success/failure rate
- PII detection frequency
- Quota usage per tenant
- Hybrid search result quality

### Logs to Review
- Audit logs for security events
- Error logs for LLM failures
- Performance logs for slow queries

---

## Troubleshooting

### LLM Errors

**Issue:** `llmError: "API key not set"`  
**Solution:** Set `GROQ_API_KEY` environment variable

**Issue:** `llmError: "Rate limit exceeded"`  
**Solution:** Implement request queuing or upgrade Groq plan

### Search Quality Issues

**Issue:** Low relevance scores  
**Solution:** Adjust `vectorWeight` parameter or retrain embeddings

**Issue:** Missing expected results  
**Solution:** Check tenant isolation, verify embeddings exist

### Performance Issues

**Issue:** Slow queries  
**Solution:** Reduce `k` parameter, optimize vector index, cache frequent queries

---

## Future Enhancements

### Planned Features
1. **Multi-modal RAG:** Support images, tables, code snippets
2. **Conversational Context:** Track chat history for follow-up questions
3. **Advanced Metadata Filters:** Date ranges, source types, custom tags
4. **Real-time Ingestion:** Stream updates to knowledge base
5. **A/B Testing:** Compare LLM providers and models
6. **Auto-tuning:** Optimize search weights based on user feedback

### LLM Provider Expansion
- Anthropic Claude integration
- Local LLM support (Ollama, LLaMA.cpp)
- Azure OpenAI endpoints
- Custom fine-tuned models

---

## API Examples

### Basic RAG Query

```typescript
// Frontend/Widget
const response = await fetch('/api/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenant_id: 'tn_abc123',
    trial_token: 'tr_xyz789',
    query: 'What are your pricing plans?'
  })
});

const { answer, sources, confidence } = await response.json();
```

### MCP Tool Invocation

```typescript
// MCP Client
const result = await mcpHybridRagQuery({
  tenantId: 'tn_abc123',
  query: 'How do I integrate the widget?',
  k: 5,
  llmProvider: 'groq',
  llmModel: 'llama-3-groq-70b-8192-tool-use-preview'
});

console.log(result.answer);
console.log(result.sources);
```

---

## Summary

✅ **Hybrid search** combines semantic, keyword, and metadata signals  
✅ **Groq Llama-3-70B** provides fast, accurate answer synthesis  
✅ **MCP tools** expose deterministic, typed interfaces  
✅ **Multi-tenant isolation** enforced at every layer  
✅ **PII masking** protects sensitive data  
✅ **Audit logging** tracks all operations  
✅ **Production-ready** with error handling and fallbacks  

**The BiTB RAG pipeline is now the most powerful, secure, and scalable solution for multi-tenant knowledge base queries.**
