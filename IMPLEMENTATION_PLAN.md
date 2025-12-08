# High & Medium Priority Implementation Plan

**Created:** November 18, 2025  
**Target Completion:** December 18, 2025 (1 month)  
**Total Estimated Effort:** 82 hours

---

## 📋 Task Overview

| Priority | Task | Effort | Status |
|----------|------|--------|--------|
| 🔴 HIGH | Redis-backed Rate Limiter | 8h | ⏳ Pending |
| 🔴 HIGH | Grafana Dashboards & Alerts | 12h | ⏳ Pending |
| 🔴 HIGH | Integration Tests | 10h | ⏳ Pending |
| 🔴 HIGH | Coverage Reporting | 2h | ⏳ Pending |
| 🟡 MEDIUM | Connection Pooling (Supavisor) | 4h | ⏳ Pending |
| 🟡 MEDIUM | Complete Langfuse Tracing | 6h | ⏳ Pending |
| 🟡 MEDIUM | Admin JWT Authentication | 8h | ⏳ Pending |
| 🟡 MEDIUM | LangChain KB Assessment | 12h | ⏳ Pending |
| 🟡 MEDIUM | LangChain Tool Assignment | 8h | ⏳ Pending |
| 🟡 MEDIUM | Batch Retrieval Optimization | 12h | ⏳ Pending |

**Total:** 82 hours (~2 weeks full-time or 4 weeks part-time)

---

## 🔴 HIGH PRIORITY TASKS

### Task 1: Redis-backed Rate Limiter
**Priority:** HIGH  
**Effort:** 8 hours  
**Dependencies:** Redis instance available  

#### Implementation Steps:
1. Create `RedisRateLimiter` class with Lua scripts
2. Update `rateLimitMiddleware` to use Redis
3. Add Redis health checks
4. Update rate limiting tests
5. Document Redis connection requirements

#### Files to Create/Modify:
- `src/lib/security/redis-rate-limiter.ts` (NEW)
- `src/lib/security/rate-limiting.ts` (MODIFY)
- `tests/redis-rate-limiter.test.ts` (NEW)

#### Acceptance Criteria:
- [ ] Rate limits enforced across multiple server instances
- [ ] Lua scripts ensure atomic operations
- [ ] Fallback to in-memory if Redis unavailable
- [ ] All existing tests pass
- [ ] New tests for distributed scenarios

---

### Task 2: Grafana Dashboards & Alerts
**Priority:** HIGH  
**Effort:** 12 hours  
**Dependencies:** Prometheus metrics endpoint, Grafana instance  

#### Implementation Steps:
1. Create 4 JSON dashboard definitions
2. Define Prometheus alert rules
3. Configure notification channels (Slack/PagerDuty)
4. Document dashboard deployment process
5. Create runbook for common alerts

#### Files to Create:
- `monitoring/dashboards/system-health.json` (NEW)
- `monitoring/dashboards/rag-pipeline.json` (NEW)
- `monitoring/dashboards/security.json` (NEW)
- `monitoring/dashboards/business-metrics.json` (NEW)
- `monitoring/alerts/production-alerts.yml` (NEW)
- `monitoring/runbooks/incident-response.md` (NEW)

#### Dashboards:
1. **System Health:** CPU, memory, DB connections, error rate
2. **RAG Pipeline:** Query latency, cache hit rate, token usage
3. **Security:** Rate limit violations, failed auth, PII detections
4. **Business:** Active trials, query volume, conversion rate

#### Acceptance Criteria:
- [ ] All 4 dashboards importable to Grafana
- [ ] Alerts fire correctly in test environment
- [ ] Notification channels configured
- [ ] Runbook covers P0/P1 incidents

---

### Task 3: Integration Tests
**Priority:** HIGH  
**Effort:** 10 hours  
**Dependencies:** Test Supabase database, Redis test instance  

#### Implementation Steps:
1. Setup test database with migrations
2. Create integration test utilities
3. Write RAG pipeline integration tests
4. Write queue system integration tests
5. Write trial workflow integration tests

#### Files to Create:
- `tests/integration/setup.ts` (NEW)
- `tests/integration/rag-pipeline.integration.test.ts` (NEW)
- `tests/integration/queue-system.integration.test.ts` (NEW)
- `tests/integration/trial-workflow.integration.test.ts` (NEW)
- `tests/integration/security.integration.test.ts` (NEW)

#### Test Scenarios:
- RAG query with actual Supabase retrieval
- RLS enforcement (cross-tenant queries blocked)
- Queue job execution end-to-end
- Trial creation → KB upload → RAG query flow
- Rate limiting across requests

#### Acceptance Criteria:
- [ ] 20+ integration test cases
- [ ] Tests run against real database (test instance)
- [ ] Tests verify RLS policies
- [ ] CI pipeline includes integration tests
- [ ] All tests pass consistently

---

### Task 4: Coverage Reporting
**Priority:** HIGH  
**Effort:** 2 hours  
**Dependencies:** Vitest configured  

#### Implementation Steps:
1. Install @vitest/coverage-v8
2. Configure coverage thresholds
3. Update CI pipeline to generate reports
4. Add coverage badge to README
5. Configure coverage exclusions

#### Files to Modify:
- `vitest.config.ts` (MODIFY)
- `package.json` (MODIFY)
- `.github/workflows/test.yml` (CREATE/MODIFY)
- `README.md` (MODIFY)

#### Acceptance Criteria:
- [ ] Coverage reports generated automatically
- [ ] Thresholds: 80% statements, 75% branches
- [ ] HTML reports viewable locally
- [ ] CI fails if coverage drops below threshold
- [ ] Coverage badge shows current percentage

---

## 🟡 MEDIUM PRIORITY TASKS

### Task 5: Connection Pooling (Supavisor)
**Priority:** MEDIUM  
**Effort:** 4 hours  
**Dependencies:** Supabase project with Supavisor enabled  

#### Implementation Steps:
1. Enable Supavisor in Supabase dashboard
2. Update SUPABASE_URL to pooler endpoint
3. Configure pgBouncer settings
4. Test connection pooling behavior
5. Document configuration changes

#### Files to Modify:
- `.env.local.example` (MODIFY)
- `docs/SUPABASE_SETUP.md` (MODIFY)
- `src/lib/supabase-client.ts` (MODIFY - add pooling config)

#### Acceptance Criteria:
- [ ] Supavisor enabled in transaction mode
- [ ] Connection pooling verified with load test
- [ ] No connection exhaustion under 100 concurrent requests
- [ ] Documentation updated with pooler setup

---

### Task 6: Complete Langfuse Tracing
**Priority:** MEDIUM  
**Effort:** 6 hours  
**Dependencies:** Langfuse project configured  

#### Implementation Steps:
1. Add RAG query trace creation
2. Add retrieval span to traces
3. Add LLM generation span to traces
4. Add batch query tracing
5. Test trace visibility in Langfuse dashboard

#### Files to Modify:
- `src/lib/ragPipeline.ts` (MODIFY)
- `src/app/api/ask/route.ts` (MODIFY)
- `src/lib/mcp/rag-query.ts` (MODIFY)

#### Acceptance Criteria:
- [ ] All RAG queries create Langfuse traces
- [ ] Spans show retrieval time, LLM time separately
- [ ] Token usage tracked in traces
- [ ] Traces viewable in Langfuse dashboard
- [ ] Error traces include error messages

---

### Task 7: Admin JWT Authentication
**Priority:** MEDIUM  
**Effort:** 8 hours  
**Dependencies:** JWT_SECRET configured  

#### Implementation Steps:
1. Create admin user table migration
2. Implement JWT token generation/verification
3. Create admin middleware
4. Update all admin routes to use middleware
5. Create admin login endpoint

#### Files to Create/Modify:
- `supabase/migrations/003_admin_users.sql` (NEW)
- `src/lib/auth/admin-auth.ts` (NEW)
- `src/lib/middleware/admin-middleware.ts` (NEW)
- `src/app/api/admin/login/route.ts` (NEW)
- `src/app/api/admin/*/route.ts` (MODIFY all)
- `tests/admin-auth.test.ts` (NEW)

#### Acceptance Criteria:
- [ ] Admin users stored in database with roles
- [ ] JWT tokens generated on login
- [ ] All admin routes protected with middleware
- [ ] Unauthorized requests return 403
- [ ] Tests verify auth enforcement

---

### Task 8: LangChain KB Assessment
**Priority:** MEDIUM  
**Effort:** 12 hours  
**Dependencies:** OpenAI API key  

#### Implementation Steps:
1. Install @langchain/openai
2. Implement KB quality assessment function
3. Update workflow engine to use assessment
4. Add assessment result to workflow state
5. Create tests with mock LLM responses

#### Files to Modify:
- `src/lib/trial/workflow-langchain.ts` (MODIFY)
- `src/lib/trial/workflow-engine.ts` (MODIFY)
- `tests/trial/workflow-langchain.test.ts` (NEW)

#### Acceptance Criteria:
- [ ] LLM assesses KB coverage, clarity, relevance
- [ ] Assessment scores stored in workflow state
- [ ] Low-quality KBs trigger interrupts
- [ ] Tests use mocked LLM responses
- [ ] Assessment takes <10 seconds

---

### Task 9: LangChain Tool Assignment
**Priority:** MEDIUM  
**Effort:** 8 hours  
**Dependencies:** LangChain KB Assessment complete  

#### Implementation Steps:
1. Create tool recommendation prompt
2. Implement auto-assignment function
3. Update workflow engine to assign tools
4. Add tool assignment to trial setup
5. Test recommendations for different industries

#### Files to Modify:
- `src/lib/trial/workflow-langchain.ts` (MODIFY)
- `src/lib/trial/workflow-engine.ts` (MODIFY)
- `tests/trial/tool-assignment.test.ts` (MODIFY)

#### Acceptance Criteria:
- [ ] LLM recommends tools based on KB content
- [ ] Recommendations vary by industry
- [ ] Always includes search_knowledge_base
- [ ] Tool list stored in workflow state
- [ ] Tests verify recommendations

---

### Task 10: Batch Retrieval Optimization
**Priority:** MEDIUM  
**Effort:** 12 hours  
**Dependencies:** RAG pipeline working  

#### Implementation Steps:
1. Create batch vector search function
2. Implement deduplication logic
3. Update batch query handler
4. Add batch-specific caching
5. Performance test batch vs sequential

#### Files to Create/Modify:
- `src/lib/rag/batch-retriever.ts` (NEW)
- `src/app/api/ask/route.ts` (MODIFY)
- `tests/batch-retriever.test.ts` (NEW)

#### Acceptance Criteria:
- [ ] Single DB query for multiple batch queries
- [ ] Deduplication reduces redundant retrievals
- [ ] 40% reduction in DB queries for batches
- [ ] Latency improvement measured
- [ ] Tests verify deduplication logic

---

## 📅 Implementation Timeline

### Week 1 (HIGH Priority - 32 hours)
- **Day 1-2:** Redis Rate Limiter (8h)
- **Day 3-4:** Grafana Dashboards (12h)
- **Day 5-6:** Integration Tests (10h)
- **Day 7:** Coverage Reporting (2h)

### Week 2 (MEDIUM Priority - 22 hours)
- **Day 1:** Connection Pooling (4h)
- **Day 2:** Langfuse Tracing (6h)
- **Day 3-4:** Admin Authentication (8h)
- **Day 5:** Buffer (4h for testing/docs)

### Week 3 (MEDIUM Priority - 20 hours)
- **Day 1-2:** LangChain KB Assessment (12h)
- **Day 3-4:** LangChain Tool Assignment (8h)

### Week 4 (MEDIUM Priority - 12 hours)
- **Day 1-2:** Batch Retrieval Optimization (12h)
- **Day 3-4:** Final testing, documentation, deployment
- **Day 5:** Buffer for issues/refinement

---

## 🧪 Testing Strategy

### Unit Tests
- Every new function has unit tests
- Mock external dependencies (Redis, Supabase, LLM)
- Test edge cases and error handling

### Integration Tests
- Test against real database (test instance)
- Verify cross-service interactions
- Test failure scenarios

### Load Tests
- Use k6 for load testing
- Test rate limiter under 100 req/s
- Test batch retrieval with 10 concurrent queries

---

## 📝 Documentation Updates

Each task includes:
- Code comments explaining complex logic
- README updates for new features
- Configuration guide updates
- API documentation updates
- Runbook entries for operational tasks

---

## ✅ Definition of Done

A task is complete when:
- [ ] Code written and passes linting
- [ ] Unit tests written and passing
- [ ] Integration tests passing (if applicable)
- [ ] Code reviewed (self-review checklist)
- [ ] Documentation updated
- [ ] Deployed to staging and tested
- [ ] Metrics/monitoring configured
- [ ] Marked as complete in this plan

---

## 🚀 Deployment Strategy

### Incremental Rollout
1. Deploy to staging after each HIGH task
2. Monitor for 24 hours before production
3. Use feature flags for new functionality
4. Gradual rollout: 10% → 50% → 100%

### Rollback Plan
- Feature flags can disable new features instantly
- Keep previous deployment artifact for 7 days
- Automated health checks trigger rollback if errors spike

---

## 📊 Success Metrics

### HIGH Priority Tasks
- **Rate Limiter:** 0 quota bypasses in multi-instance setup
- **Dashboards:** All 4 dashboards deployed and viewed daily
- **Integration Tests:** 20+ tests passing consistently
- **Coverage:** 80%+ statement coverage maintained

### MEDIUM Priority Tasks
- **Connection Pooling:** Support 100+ concurrent connections
- **Langfuse:** 100% RAG queries traced
- **Admin Auth:** 0 unauthorized admin access attempts succeed
- **LangChain:** 90%+ accuracy in tool recommendations
- **Batch Optimization:** 40% reduction in DB queries

---

## 🔧 Tools & Technologies

- **Rate Limiter:** Redis, ioredis, Lua scripts
- **Monitoring:** Grafana, Prometheus, prom-client
- **Testing:** Vitest, @vitest/coverage-v8, Playwright
- **Auth:** jsonwebtoken, bcrypt
- **LangChain:** @langchain/openai, @langchain/core
- **Database:** Supabase, Supavisor, pgBouncer

---

## 🎯 Post-Implementation Review

After completing all tasks:
1. Run full test suite
2. Load test with 1000 req/s
3. Security audit of new code
4. Performance benchmark comparison
5. Update production readiness score (target: 9.5/10)

---

**Status:** Tasks defined, ready for implementation  
**Next Step:** Begin Task 1 (Redis Rate Limiter)
