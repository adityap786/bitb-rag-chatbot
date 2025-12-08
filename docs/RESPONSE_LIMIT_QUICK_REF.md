# Response Character Limit - Quick Reference

## Quick Start

Add `responseCharacterLimit` parameter to any RAG query request:

```typescript
// 250-character limit (brief)
{ responseCharacterLimit: 250 }

// 450-character limit (moderate)
{ responseCharacterLimit: 450 }

// No limit (default)
{ /* responseCharacterLimit omitted */ }
```

## API Endpoints

### Widget Chat
```bash
POST /api/widget/chat
{
  "sessionId": "session_123",
  "message": "Compare plans",
  "responseCharacterLimit": 250  # Optional
}
```

### Public Ask
```bash
POST /api/ask
{
  "tenant_id": "tenant_123",
  "query": "What is BiTB?",
  "responseCharacterLimit": 250  # Optional
}
```

### MCP Tool
```typescript
{
  tool: "rag_query",
  parameters: {
    query: "Compare plans",
    responseCharacterLimit: 250  # Optional
  }
}
```

## When to Use

| Limit | Use Case | Example |
|-------|----------|---------|
| 250 | Brief summaries, comparisons, mobile UX | "Compare X vs Y", "What is Z?" |
| 450 | Moderate explanations, how-to questions | "How do I...", "Explain features" |
| None | Detailed content, tutorials | "Full documentation", "Detailed guide" |

## Response Structure

```typescript
{
  answer: "Trimmed response...",
  characterLimitApplied: 250,     // null if no limit
  originalLength: 487,            // Original before trimming
  latencyMs: 1234,
  sources: [...],
  confidence: 0.8
}
```

## Trimming Rules

1. ✅ Trims at word boundaries (no mid-word cuts)
2. ✅ Appends "..." if trimmed
3. ✅ Removes awkward trailing punctuation before ellipsis
4. ✅ Preserves original length in metadata

## Multi-Tenant Safety

- ✅ Tenant isolation preserved (WHERE tenant_id filtering)
- ✅ PII masking unaffected
- ✅ Quota enforcement unchanged
- ✅ Audit logging includes limit metadata

## Monitoring

Console logs show limiter activity:
```
[LIMITER] Applied 250-char limit. Original: 487, Final: 247
[INFER] tenant=tenant_123 query="..." latencyMs=1234 error=none
```

## Cost Savings

Approximate token savings:
- 250 chars ≈ 60-80 tokens max
- 450 chars ≈ 110-140 tokens max
- Full response ≈ variable (can be 500+ tokens)

## Testing

```typescript
import { formatResponseByCharacterLimit } from '@/lib/responseLimiter';

const result = formatResponseByCharacterLimit(longText, 250);
console.log(result.length); // ≤ 253 (250 + "...")
```

## Full Documentation

See `/docs/RESPONSE_CHARACTER_LIMIT.md` for complete documentation.
