# LLM Batching for High-Traffic Tenants

## Overview
Batching allows multiple queries to be sent to the LLM API in parallel, improving throughput and latency for high-traffic scenarios. This is now supported via the `batchMcpHybridRagQuery` function in `src/lib/ragPipeline.ts` and the `/api/widget/chat` endpoint.

## Usage
- **API:**
  - Send a POST request to `/api/widget/chat` with a `messages` array in the body:
    ```json
    {
      "sessionId": "abc123",
      "messages": [
        "What is Bits and Bytes Pvt Ltd?",
        "Describe the Service Desk plan.",
        "How does the trial workflow work?"
      ]
    }
    ```
  - The response will contain a `batch` array with replies and sources for each query.

- **Library:**
  - Call `batchMcpHybridRagQuery({ tenantId, queries })` to get an array of responses.

## Benefits
- Reduces latency for bulk requests
- Improves scalability for multi-tenant deployments
- Ensures responses are returned in order

## Testing
- See `src/lib/ragPipeline.test.ts` for test cases covering batching, order, and error handling.

## Notes
- Streaming is only supported for single queries (not batch mode).
- Quota and rate limits are enforced per batch request.

---
For questions, contact the BiTB engineering team.