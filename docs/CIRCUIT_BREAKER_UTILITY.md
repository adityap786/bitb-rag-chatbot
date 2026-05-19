# Circuit Breaker & Retry Utility

## Overview
This utility wraps async functions (e.g., external API calls) with a production-grade circuit breaker (using **cockatiel**) and retry logic. It is used for embedding, LLM, and other external calls to ensure resilience and fast failure recovery.

## Usage
The system uses `cockatiel` policies for circuit breaking and retries.

```ts
import { GroqClientWithBreaker } from '../lib/rag/llm-client-with-breaker';

// The client internally manages the circuit breaker state
const client = new GroqClientWithBreaker(apiKey);
await client.complete(request);
```

## Key Decisions
- **cockatiel** is used for robust, policy-based resilience (Circuit Breaker, Retry, Timeout, Bulkhead).
- **Sampling Breaker:** Uses a sampling strategy (e.g., break if >50% failures in a window) to tolerate occasional glitches.
- **Observability:** State changes (Closed -> Open) and failures are logged and tracked via metrics.

---

This utility is a core part of the system's operational hardening.
