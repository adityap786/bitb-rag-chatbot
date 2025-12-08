# Response Character Limit Feature Documentation

## Overview

The Response Character Limit feature provides intelligent character-based response limiting for LLM outputs in the multi-tenant RAG chatbot system. This feature helps control token usage, reduce costs, and provide concise responses when needed.

## Key Features

- **Two Limit Modes**: 250 characters (brief summaries) and 450 characters (moderate responses)
- **Smart Trimming**: Automatically trims at word boundaries without cutting words mid-sentence
- **Multi-Tenant Safe**: Works across all tenants without affecting isolation or security
- **Optional**: Only activates when explicitly requested via parameter
- **Non-Intrusive**: Does not affect tool calls, embeddings, or MCP actions—only final text responses

## Architecture

### Core Components

1. **Response Limiter Utility** (`src/lib/responseLimiter.ts`)
   - `formatResponseByCharacterLimit()`: Main trimming function
   - `isValidCharacterLimit()`: Validation helper
   - `getLimitDescription()`: Human-readable descriptions
   - `calculateReduction()`: Stats for monitoring

2. **RAG Pipeline Integration** (`src/lib/ragPipeline.ts`)
   - Applied after LLM synthesis, before caching
   - Preserves original response length in metadata
   - Logs character limit application for monitoring

3. **API Endpoints**
   - `/api/ask`: Public RAG query endpoint
   - `/api/widget/chat`: Widget chat endpoint
   - MCP handlers: `rag_query` tool

## Usage Examples

### Frontend Widget

```typescript
// Brief summary mode (250 characters)
const response = await fetch('/api/widget/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_123',
    message: 'Compare Service Desk and Commerce Assist plans',
    responseCharacterLimit: 250
  })
});

// Moderate response mode (450 characters)
const response = await fetch('/api/widget/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_123',
    message: 'What are the security features?',
    responseCharacterLimit: 450
  })
});

// No limit (default behavior)
const response = await fetch('/api/widget/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session_123',
    message: 'Explain the trial workflow in detail'
    // responseCharacterLimit omitted = no limit
  })
});
```

### Public Ask API

```typescript
// With character limit
const response = await fetch('/api/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenant_id: 'tenant_123',
    trial_token: 'token_xyz',
    query: 'What is BiTB?',
    responseCharacterLimit: 250
  })
});
```

### MCP Tool

```typescript
// Via MCP rag_query tool
const mcpRequest = {
  tool: 'rag_query',
  tenant_id: 'tenant_123',
  trial_token: 'token_xyz',
  parameters: {
    query: 'Compare plans',
    k: 3,
    responseCharacterLimit: 250 // Optional
  }
};
```

### Direct RAG Pipeline Usage

```typescript
import { mcpHybridRagQuery } from '@/lib/ragPipeline';

// With 250-character limit
const result = await mcpHybridRagQuery({
  tenantId: 'tenant_123',
  query: 'What is BiTB?',
  k: 4,
  llmProvider: 'groq',
  llmModel: 'llama-3-groq-70b-8192-tool-use-preview',
  responseCharacterLimit: 250
});

// With 450-character limit
const result = await mcpHybridRagQuery({
  tenantId: 'tenant_123',
  query: 'Explain security features',
  responseCharacterLimit: 450
});

// No limit (full response)
const result = await mcpHybridRagQuery({
  tenantId: 'tenant_123',
  query: 'Detailed explanation',
  // responseCharacterLimit omitted
});
```

## Response Structure

When a character limit is applied, the response includes additional metadata:

```typescript
{
  answer: "Brief answer trimmed to limit...",
  sources: [...],
  confidence: 0.8,
  llmError: null,
  tool: "mcpHybridRagQuery",
  llmProvider: "groq",
  llmModel: "llama-3-groq-70b-8192-tool-use-preview",
  latencyMs: 1234,
  characterLimitApplied: 250,        // The limit that was applied
  originalLength: 487,               // Original response length before trimming
  cache: false
}
```

## Trimming Logic

The `formatResponseByCharacterLimit()` function:

1. **Early Exit**: Returns unchanged if no limit specified or text is within limit
2. **Word Boundary Detection**: Finds the last space or punctuation mark before the limit
3. **Fallback**: Uses exact limit if no good break point found within first 10 characters
4. **Cleanup**: Removes trailing commas, semicolons, or colons before ellipsis
5. **Ellipsis**: Appends "..." to indicate continuation

### Example

```typescript
Original (487 chars):
"The BiTB Service Desk plan is designed for agencies, studios, and consultancies. 
It includes 5,000 monthly RAG responses across 3 active trials, drag-and-drop 
document ingestion, voice greetings for lead nurturing, and integrations with 
Calendly and HubSpot for routing hot leads. Teams typically reduce email 
back-and-forth by 60% in the first month. This plan is ideal for service 
businesses that need instant answers from proposals and playbooks."

With 250-char limit:
"The BiTB Service Desk plan is designed for agencies, studios, and consultancies. 
It includes 5,000 monthly RAG responses across 3 active trials, drag-and-drop 
document ingestion, voice greetings for lead nurturing..."
```

## Security & Multi-Tenancy

### Tenant Isolation
- Character limiting is applied **after** tenant-specific RAG retrieval
- All vector queries maintain `WHERE tenant_id = ?` filtering
- No cross-tenant data leakage

### PII Protection
- Character limiting does not affect PII masking
- PII masking happens **before** character limiting
- Audit logs capture both masked queries and limit application

### Quota Enforcement
- Character limits help reduce token consumption
- Rate limits and quota checks remain unchanged
- Monitoring logs track character limit usage per tenant

## Monitoring & Logging

### Console Logs

```
[LIMITER] Applied 250-char limit. Original: 487, Final: 247
[INFER] tenant=tenant_123 query="Compare plans" latencyMs=1234 error=none
```

### Metadata Tracking

Response objects include:
- `characterLimitApplied`: The limit mode (250, 450, or null)
- `originalLength`: Original response length
- `answer.length`: Final trimmed length

### Usage Analytics

Calculate token/cost savings:

```typescript
import { calculateReduction } from '@/lib/responseLimiter';

const stats = calculateReduction(487, 250);
// { reduced: true, savedChars: 237, percentSaved: 49 }
```

## Performance Impact

- **Latency**: Negligible (< 1ms for trimming operation)
- **Caching**: Cached responses include character limit in cache key
- **Memory**: Minimal overhead (stores both original and trimmed length)

## Best Practices

### When to Use Each Limit

**250 Characters** (Brief Summary)
- Quick comparisons ("Compare X vs Y")
- Yes/no questions
- Simple definitions
- Mobile-first UX where space is limited
- High-traffic scenarios to reduce costs

**450 Characters** (Moderate Response)
- Feature explanations
- "How to" questions
- Multi-step instructions
- Balance between detail and brevity

**No Limit** (Full Response)
- Detailed explanations requested explicitly
- Complex multi-part questions
- Documentation or tutorial content
- When accuracy matters more than brevity

### Frontend Integration

```typescript
// Detect question type and apply appropriate limit
function getCharacterLimit(message: string): 250 | 450 | undefined {
  const lowerMessage = message.toLowerCase();
  
  // Brief summary for comparisons
  if (lowerMessage.includes('compare') || lowerMessage.includes('vs')) {
    return 250;
  }
  
  // Moderate for how-to questions
  if (lowerMessage.startsWith('how') || lowerMessage.includes('explain')) {
    return 450;
  }
  
  // No limit for detailed requests
  if (lowerMessage.includes('detail') || lowerMessage.includes('full')) {
    return undefined;
  }
  
  // Default: moderate
  return 450;
}
```

## Configuration

### Environment Variables

No additional environment variables required. The feature uses existing LLM and RAG configuration.

### Per-Tenant Overrides

To disable character limiting for specific tenants:

```typescript
// In tenant settings table
{
  tenant_id: 'premium_tenant_123',
  disable_character_limits: true
}

// In RAG pipeline check
if (tenantSettings?.disable_character_limits) {
  responseCharacterLimit = undefined;
}
```

## Testing

### Unit Tests

```typescript
import { formatResponseByCharacterLimit } from '@/lib/responseLimiter';

test('trims at word boundary', () => {
  const text = 'This is a long response that exceeds the limit.';
  const result = formatResponseByCharacterLimit(text, 250);
  expect(result).not.toContain('ex...'); // Should not cut mid-word
  expect(result).toEndWith('...');
});

test('returns unchanged if within limit', () => {
  const text = 'Short response.';
  const result = formatResponseByCharacterLimit(text, 250);
  expect(result).toBe(text);
});

test('no limit returns original', () => {
  const text = 'Any length response.';
  const result = formatResponseByCharacterLimit(text);
  expect(result).toBe(text);
});
```

### Integration Tests

```typescript
test('widget chat with character limit', async () => {
  const response = await fetch('/api/widget/chat', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: 'test_session',
      message: 'What is BiTB?',
      responseCharacterLimit: 250
    })
  });
  
  const data = await response.json();
  expect(data.reply.length).toBeLessThanOrEqual(253); // 250 + "..."
});
```

## Troubleshooting

### Issue: Responses not being limited

**Check:**
1. Is `responseCharacterLimit` parameter being passed correctly?
2. Is the response already shorter than the limit?
3. Check console logs for `[LIMITER]` messages

### Issue: Words cut mid-sentence

**Cause:** Should not happen with current implementation
**Solution:** Report as bug; the trimming logic should always break at word boundaries

### Issue: Character limit not working for specific tenant

**Check:**
1. Verify tenant doesn't have `disable_character_limits` override
2. Check audit logs for PII masking affecting response length
3. Verify cache key includes character limit parameter

## Future Enhancements

- **Dynamic Limits**: Adjust limit based on query complexity
- **Token-Based Limits**: Use token count instead of character count
- **Progressive Loading**: Start with brief response, allow expansion
- **Tenant Preferences**: Per-tenant default character limits
- **A/B Testing**: Compare user satisfaction with different limits

## Support

For issues or questions about the response character limit feature:
- Check console logs for `[LIMITER]` and `[INFER]` messages
- Review response metadata (`characterLimitApplied`, `originalLength`)
- Contact: dev@bitb.ltd
