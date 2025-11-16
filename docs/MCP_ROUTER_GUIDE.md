# MCP (Model Context Protocol) Router - Implementation Guide

## Overview

The MCP Router provides a typed, deterministic API layer for all chatbot operations. It replaces direct endpoint calls with a unified tool-based interface that validates requests, enforces security, and provides consistent error handling.

## Architecture

```
Client Request
     ↓
POST /api/mcp
     ↓
MCP Router (router.ts)
  ├─ Validate Request Structure
  ├─ Validate Tenant Context (Security)
  ├─ Check Tool Definition
  └─ Route to Handler
     ↓
Tool Handler (handlers.ts)
  ├─ Execute Business Logic
  ├─ Interact with Database
  └─ Return Typed Response
     ↓
MCP Response (JSON)
```

## Available Tools

### 1. `rag_query` - Semantic Search

**Purpose**: Query the knowledge base with semantic search  
**Requires Trial Token**: Yes  
**Rate Limit**: 20/min, 200/hour

**Request**:
```json
{
  "tool": "rag_query",
  "tenant_id": "tn_abc123...",
  "trial_token": "tr_def456...",
  "parameters": {
    "query": "What is BiTB?",
    "k": 3,
    "similarity_threshold": 0.0,
    "include_metadata": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "answer": "BiTB is a RAG-powered chatbot...",
    "sources": [
      {
        "content": "BiTB (Business in the Browser)...",
        "metadata": {"source": "docs.md", "page": 1},
        "similarity_score": 0.92
      }
    ],
    "confidence": 0.8,
    "queries_remaining": 95
  },
  "metadata": {
    "execution_time_ms": 234,
    "tool_version": "1.0.0"
  }
}
```

### 2. `ingest_documents` - Add Knowledge

**Purpose**: Add documents to the knowledge base  
**Requires Trial Token**: No  
**Rate Limit**: 5/min, 50/hour

**Request**:
```json
{
  "tool": "ingest_documents",
  "tenant_id": "tn_abc123...",
  "parameters": {
    "documents": [
      {
        "content": "BiTB is a RAG chatbot platform...",
        "metadata": {"source": "homepage.html", "url": "https://example.com"}
      }
    ],
    "chunk_size": 1000,
    "chunk_overlap": 200
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "job_id": "job_xyz789",
    "documents_count": 1,
    "chunks_created": 5,
    "status": "queued",
    "estimated_completion_time": "2025-11-10T21:35:00Z"
  }
}
```

### 3. `get_trial_status` - Check Usage

**Purpose**: Get trial information and usage statistics  
**Requires Trial Token**: Yes  
**Rate Limit**: 30/min, 300/hour

**Request**:
```json
{
  "tool": "get_trial_status",
  "tenant_id": "tn_abc123...",
  "trial_token": "tr_def456...",
  "parameters": {
    "include_usage": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "tenant_id": "tn_abc123...",
    "trial_token": "tr_def456...",
    "status": "active",
    "created_at": "2025-11-07T10:00:00Z",
    "expires_at": "2025-11-10T10:00:00Z",
    "queries_used": 5,
    "queries_limit": 100,
    "queries_remaining": 95,
    "embeddings_count": 150,
    "site_origin": "https://example.com",
    "display_name": "Example Site"
  }
}
```

### 4. `update_settings` - Configure Chatbot

**Purpose**: Update chatbot theme and settings  
**Requires Trial Token**: No  
**Rate Limit**: 10/min, 100/hour

**Request**:
```json
{
  "tool": "update_settings",
  "tenant_id": "tn_abc123...",
  "parameters": {
    "theme": {
      "theme": "dark",
      "primary_color": "#FF6B6B",
      "position": "bottom-right"
    },
    "display_name": "My Assistant",
    "greeting_message": "Hi! How can I help you today?",
    "placeholder_text": "Ask me anything..."
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "updated_fields": ["theme", "display_name", "greeting_message", "placeholder_text"],
    "settings": {
      "theme": {"theme": "dark", "primary_color": "#FF6B6B"},
      "display_name": "My Assistant"
    }
  }
}
```

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  },
  "metadata": {
    "execution_time_ms": 12
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Request validation failed |
| `MISSING_TENANT_CONTEXT` | 403 | tenant_id missing or invalid |
| `INVALID_TENANT_ID` | 403 | Tenant ID format wrong |
| `TRIAL_TOKEN_REQUIRED` | 401 | Tool requires trial_token |
| `QUERY_LIMIT_EXCEEDED` | 429 | Trial query limit reached |
| `UNKNOWN_TOOL` | 404 | Tool name not recognized |
| `HANDLER_NOT_FOUND` | 500 | Tool handler not registered |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Validation

### Request Structure

All MCP requests must include:
- `tool` (string): Tool name from registry
- `tenant_id` (string): Format `tn_[32 hex chars]`
- `parameters` (object): Tool-specific parameters
- `trial_token` (string, optional): Format `tr_[32 hex chars]`

### JSON Schema Validation

Parameters are validated against JSON Schema definitions:

```typescript
// Example: rag_query schema
{
  type: 'object',
  required: ['query'],
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      maxLength: 500
    },
    k: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      default: 3
    }
  }
}
```

Invalid parameters return detailed error messages:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed",
    "details": [
      {
        "field": "query",
        "message": "Missing required field: query"
      }
    ]
  }
}
```

## Security

### Multi-Layer Validation

1. **Request Validation**: JSON Schema check (format, types, ranges)
2. **Tenant Validation**: `validateTenantContext` middleware (RLS context)
3. **Tool Authorization**: Check if tool requires trial_token
4. **Rate Limiting**: Per-tool rate limits enforced (future)

### Fail-Closed

If any validation fails, request is rejected with 4xx error. No partial execution.

## Usage Examples

### JavaScript/TypeScript Client

```typescript
async function queryMCP(tool: string, parameters: any) {
  const response = await fetch('/api/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tool,
      tenant_id: 'tn_abc123...',
      trial_token: 'tr_def456...',
      parameters,
    }),
  });

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(`MCP Error: ${result.error.code} - ${result.error.message}`);
  }

  return result.data;
}

// Query knowledge base
const answer = await queryMCP('rag_query', {
  query: 'What is BiTB?',
  k: 3,
});

console.log(answer.answer);
console.log(`Queries remaining: ${answer.queries_remaining}`);
```

### cURL

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "rag_query",
    "tenant_id": "tn_abc123...",
    "trial_token": "tr_def456...",
    "parameters": {
      "query": "What is BiTB?",
      "k": 3
    }
  }'
```

## Adding New Tools

### 1. Define Types (`src/lib/mcp/types.ts`)

```typescript
export interface MyToolParameters {
  my_param: string;
}

export interface MyToolResponse extends MCPToolResponse {
  data: {
    result: string;
  };
}

export type MCPToolName = 
  | 'rag_query'
  | 'my_tool'; // Add here
```

### 2. Register Tool (`src/lib/mcp/registry.ts`)

```typescript
export const MCP_TOOLS: Record<MCPToolName, MCPToolDefinition> = {
  // ... existing tools
  my_tool: {
    name: 'my_tool',
    description: 'Does something useful',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['my_param'],
      properties: {
        my_param: { type: 'string' }
      }
    },
    requires_trial_token: false,
    rate_limit: {
      max_calls_per_minute: 10,
      max_calls_per_hour: 100
    }
  }
};
```

### 3. Create Handler (`src/lib/mcp/handlers.ts`)

```typescript
export async function handleMyTool(
  request: MCPToolRequest
): Promise<MyToolResponse> {
  const params = request.parameters as unknown as MyToolParameters;
  const { tenant_id } = request;

  // Business logic here

  return {
    success: true,
    data: {
      result: 'Done!',
    },
  };
}
```

### 4. Register Handler (`src/app/api/mcp/route.ts`)

```typescript
import { handleMyTool } from '@/lib/mcp/handlers';

registerToolHandler('my_tool', handleMyTool);
```

## Testing

### Unit Tests

```typescript
import { validateToolParameters } from '@/lib/mcp/validator';

describe('MCP Validator', () => {
  it('validates rag_query parameters', () => {
    const result = validateToolParameters('rag_query', {
      query: 'test',
      k: 3,
    });
    
    expect(result.valid).toBe(true);
  });

  it('rejects invalid parameters', () => {
    const result = validateToolParameters('rag_query', {
      // missing query
      k: 3,
    });
    
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      field: 'query',
      message: expect.stringContaining('required'),
    });
  });
});
```

### Integration Tests

```bash
# Test rag_query tool
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "rag_query",
    "tenant_id": "tn_'$(openssl rand -hex 16)'",
    "trial_token": "tr_'$(openssl rand -hex 16)'",
    "parameters": {
      "query": "test query"
    }
  }'
```

## Performance

- **Validation Overhead**: ~2-5ms per request (JSON Schema)
- **Tenant Context Check**: ~10-20ms (database query)
- **Average Total**: ~15-30ms excluding tool execution

## Future Enhancements

- [ ] Rate limiting middleware (per-tenant, per-tool)
- [ ] Request/response caching (Redis)
- [ ] Async job processing for ingest_documents
- [ ] Webhook notifications for long-running tasks
- [ ] OpenAPI/Swagger documentation generation
- [ ] MCP SDK for common languages (Python, Go, Ruby)

## References

- Type definitions: `src/lib/mcp/types.ts`
- Tool registry: `src/lib/mcp/registry.ts`
- Validator: `src/lib/mcp/validator.ts`
- Router: `src/lib/mcp/router.ts`
- Handlers: `src/lib/mcp/handlers.ts`
- API route: `src/app/api/mcp/route.ts`
