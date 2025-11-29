# LlamaIndex Migration Execution Plan

This file tracks the detailed execution plan, progress, and todos for the migration from LangChain to LlamaIndex, as outlined in the migration plan.

---

## Phase 1: Foundation & Document Abstraction
- [x] Install LlamaIndex packages
- [x] Create Document adapter layer (`src/lib/rag/llamaindex-adapters.ts`)
- [x] Update tenant-isolation.ts for both document types
- [x] Unit tests for adapters and isolation logic
- [ ] Set up staging environment for parallel testing
- [ ] Collect baseline metrics (latency, accuracy, error rates)

## Phase 2: Embedding Service Migration
- [x] Create embedding service (`src/lib/rag/llamaindex-embeddings.ts`)
- [x] Feature parity checks (dimensions, batch size, error handling) - Tests in `tests/llamaindex-embeddings.test.ts`
- [x] Parallel testing: compare LangChain and LlamaIndex embeddings - Script: `scripts/compare-embeddings.ts`
- [x] Switch embedding service in `addDocumentsToTenant()` (write path) - Integrated via feature flag
- [ ] Monitor ingestion jobs for 48h, rollback if error rate >0.1% - TODO: Set up monitoring dashboard

## Phase 3: Vector Store Migration
- [x] Research LlamaIndex Supabase integration (native or custom) - Custom implementation chosen
- [x] Create vector store adapter (`src/lib/rag/llamaindex-supabase-store.ts`) - Complete with LlamaIndexSupabaseRetriever
- [x] Replicate tenant isolation logic, support metadata filtering - TenantIsolationGuard integrated
- [x] Refactor `getSupabaseRetriever()` to v3 (LlamaIndex backend) - `getSupabaseRetrieverV3()` implemented
- [ ] A/B test: 10% traffic to v3, 90% to v2, compare quality - TODO: Implement traffic splitting via YAML rollout config
- [ ] Security validation: cross-tenant tests, audit logs, load test - TODO: Add integration tests
- [ ] Gradual rollout: 10% → 50% → 100%, monitor errors/latency - TODO: Use YAML rollout percentages

## Phase 4: Retriever Interface Unification
- [x] Update `supabase-retriever-v2.ts` to use LlamaIndex - Feature flag `RAG_RETRIEVER_VERSION` routes to v3
- [x] Refactor `TenantIsolatedRetriever` to LlamaIndex interface - Supports both v2 and v3 backends
- [ ] Integration testing: ingestion → retrieval → generation - TODO: Add E2E tests
- [ ] Update all consumers (`api/ask/route.ts`, `mcp/handlers.ts`) - TODO: Verify all call sites use retriever abstraction

## Phase 5: LLM Factory Migration
- [x] Create LlamaIndex LLM adapter (`src/lib/rag/llamaindex-llm-factory.ts`) - Supports Groq and OpenAI
- [x] Update `llm-factory.ts` with feature flag - `USE_LLAMAINDEX_LLM` env var
- [x] Prompt template migration (LangChain → LlamaIndex) - Manual string construction in bitb-rag.ts
- [ ] Parallel LLM testing (responses, latency, errors) - TODO: Add comparative benchmarks

## Phase 6: Workflow Engine Migration.
- [ ] Update `workflow-langchain.ts` → `workflow-llm.ts` - IN PROGRESS: Has dual-backend stubs, needs full migration
- [ ] Update `workflow-engine.ts` to LlamaIndex LLM - TODO: Remove LangChain imports from workflow-engine.ts
- [ ] Trial flow testing (E2E, UAT) - TODO: Add workflow E2E tests

## Phase 7: Cleanup & Deprecation
- [ ] Deprecate legacy code, remove unused LangChain imports - TODO: Audit and remove from workflow files
- [ ] Update package.json, remove `@langchain/*`, prune - TODO: Once all LangChain usage is removed
- [x] Documentation updates (diagrams, guides) - Added YAML_CONFIG_AND_ADMIN_API.md
- [ ] Final validation: regression, performance, security - TODO: Run full test suite and security audit

---


## Permanent TODO (Do not remove)
- [ ] Complete all steps in this execution plan and keep this file up to date until migration is 100% finished and validated.
- [x] Integrate managed LangCache SaaS for semantic caching in the RAG pipeline (Node.js and Python), update tests and documentation to reflect new cache flow.
- [x] After each phase, update this file with progress, blockers, and lessons learned.

---

## Progress Summary (Last Updated: 2025-11-23)

### Completed:
- ✅ Phase 1: Foundation & Document Abstraction (adapters, tenant isolation, tests)
- ✅ Phase 2: Embedding Service Migration (service, tests, comparison script)
- ✅ Phase 3: Vector Store Migration (LlamaIndexSupabaseRetriever, tenant isolation, v3 retriever)
- ✅ Phase 4: Retriever Interface Unification (feature flag routing, dual-backend support)
- ✅ Phase 5: LLM Factory Migration (llamaindex-llm-factory.ts, feature flag, prompt construction)
- ✅ YAML Config System: Production-ready with schema validation, dynamic reload, admin endpoints

### In Progress:
- 🔄 Phase 6: Workflow Engine Migration (dual-backend stubs exist, needs full LlamaIndex migration)
- 🔄 A/B Testing & Rollout (YAML infrastructure ready, needs traffic splitting implementation)
- 🔄 Integration & E2E Testing (need comprehensive test coverage)

### Remaining Work:
- ❌ Phase 7: LangChain Cleanup & Deprecation (remove imports, update package.json)
- ❌ Monitoring & Observability (ingestion job monitoring, dashboards, alerts)
- ❌ Security Validation (cross-tenant tests, load testing, audit)
- ❌ Final Production Validation (regression, performance, security audit)

### Blockers & Lessons Learned:
- **Lesson**: YAML config system enables safe feature flagging and gradual rollout.
- **Lesson**: Dual-backend support (v2/v3) allows incremental migration without downtime.
- **Next**: Focus on workflow engine migration and comprehensive testing before final cleanup.

---

## Deployment-Readiness Checklist: Product-Grade (10/10) & Scalability

### 1. Code Quality & Robustness
- Ensure all TypeScript code is strictly typed, with no `any` or implicit types.
- Add comprehensive unit, integration, and E2E tests (target >95% coverage).
- Use linting (`eslint`), formatting (`prettier`), and static analysis (e.g., `tsc --noEmit`).
- Remove all dead code, TODOs, and legacy LangChain references.
- Add clear error handling, logging, and fallback logic for all external calls.

### 2. Scalability & Performance
- Use connection pooling for all DB and vector store connections (e.g., pgBouncer).
- Batch and parallelize embedding and retrieval operations (limit concurrency to avoid rate limits).
- Implement Redis-based caching for embeddings, retrieval, and tool results.
- Use circuit breakers and timeouts for all external API calls.
- Profile and optimize hot paths (embedding, retrieval, synthesis).

### 3. Security & Multi-Tenancy
- Enforce tenant isolation at every layer (RLS, metadata, API).
- Validate all inputs and outputs for PII, prompt injection, and schema compliance.
- Add rate limiting per tenant/user.
- Ensure audit logging for all sensitive operations.

### 4. Observability & Reliability
- Integrate distributed tracing (OpenTelemetry) and structured logging.
- Add stage-wise latency and error metrics.
- Set up dashboards and alerts for error rates, latency, and cache hit rates.
- Implement health checks for all pipeline components.

### 5. Deployment Readiness
- Use environment variables and config files for all secrets and tunables.
- Containerize the app (Docker) and ensure statelessness for horizontal scaling.
- Prepare blue/green or canary deployment scripts.
- Document rollback and recovery procedures.

### 6. Documentation
- Update all architecture, API, and runbook docs.
- Add onboarding guides for new engineers and operators.

---

**Action:**
Run through this checklist before deployment. Update this file with progress, blockers, and lessons learned for each item.
