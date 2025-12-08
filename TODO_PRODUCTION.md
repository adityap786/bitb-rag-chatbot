# TODOs for Production Implementation (as of November 25, 2025)

## P0 - Critical (Must be done before production)
- [ ] 1.2 Metadata Extractors (all subcomponents)
    - [ ] Implement `keyword-extractor.ts`
    - [ ] Implement `summary-extractor.ts`
    - [ ] Implement `questions-extractor.ts`
    - [ ] Implement `entity-extractor.ts`
    - [ ] Implement `metadata-extractors/index.ts`
- [ ] 1.4 Admin Authentication
    - [ ] Create/modify `src/lib/trial/auth.ts`
    - [ ] Create `src/lib/auth/admin-jwt.ts`
    - [ ] Create `src/middleware/admin-auth.ts`
- [ ] 2.2 Reranking Pipeline
    - [ ] Create `src/lib/rag/reranking-pipeline.ts`
- [ ] 2.3 HyDE Query Transformation
    - [ ] Create `src/lib/rag/query-transformers/hyde.ts`
- [ ] 2.4 Query Decomposition
    - [ ] Create `src/lib/rag/query-transformers/decomposition.ts`

## P1 - High (Should be done before production)
- [ ] 3.1 Conversation Memory (all subcomponents)
    - [ ] Create `buffer-memory.ts`, `summary-memory.ts`, `entity-memory.ts`, `index.ts`
- [ ] 3.2 Intent Classification & Routing
    - [ ] Create `intent-classifier.ts`, `router.ts`
- [ ] 4.1 ReAct Agent
    - [ ] Create `src/lib/agents/react-agent.ts`
- [ ] 4.2 Specialized Agents
    - [ ] Create `kb-agent.ts`, `research-agent.ts`, `support-agent.ts`, `escalation-agent.ts`
- [ ] 4.3 Supervisor Agent
    - [ ] Create `src/lib/agents/supervisor-agent.ts`
- [ ] 4.4 Agent Guardrails
    - [ ] Create `input-validator.ts`, `output-filter.ts`, `rate-limiter.ts`
- [ ] 5.1 Observability
    - [ ] Create/complete `opentelemetry.ts`, `metrics.ts`, `tracing.ts`
- [ ] 5.2 Testing Infrastructure
    - [ ] Create/complete all integration, e2e, and load tests

## P2 - Medium (Nice to have for production)
- [ ] 1.3 Hierarchical Chunking (enhancements)
- [ ] 2.1 Hybrid Search Enhancement (RRF, deduplication, etc.)
- [ ] 3.3 Workflow Engine Enhancement (state machine, persistence, etc.)
- [ ] 5.3 ChatbotWidget Refactoring (modularize UI components)

## P3 - Low (Can be done post-production)
- [ ] Further UI/UX polish
- [ ] Additional agent types
- [ ] Advanced analytics dashboards

---

## General
- [ ] Ensure all code meets standards in `Code Quality Standards` section
- [ ] Achieve test coverage targets in `Testing Requirements`
- [ ] Complete all items in `Deployment Checklist`

---

*This TODO list is auto-generated from the Production Implementation Guide. Update as progress is made.*
