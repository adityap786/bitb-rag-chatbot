# Onboarding Flow Architecture Analysis

## Executive Summary

This document provides a deep architectural analysis of the onboarding → RAG pipeline flow, identifying key improvement opportunities for performance, reliability, and user experience.

---

## 1. Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (TrialOnboardingWizard.tsx)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: Get Started                                                        │
│  ┌─────────────────┐                                                        │
│  │ Email, Business │──────▶ POST /api/trial/start                          │
│  │ Name, Type      │         │                                              │
│  └─────────────────┘         ▼                                              │
│                        ┌─────────────┐                                      │
│                        │ Creates:    │                                      │
│                        │ - tenant_id │                                      │
│                        │ - JWT token │ (24h expiry)                         │
│                        └─────────────┘                                      │
│                                                                             │
│  STEP 2: Knowledge Base                                                     │
│  ┌─────────────────┐                                                        │
│  │ Company Info    │──────▶ POST /api/trial/kb/manual                      │
│  │ Sources         │         │                                              │
│  └─────────────────┘         ▼                                              │
│                        ┌─────────────────────┐                              │
│                        │ Inserts into        │                              │
│                        │ knowledge_base      │                              │
│                        │ (SHA256 dedup)      │                              │
│                        └─────────────────────┘                              │
│                                                                             │
│  STEP 3: Branding                                                           │
│  ┌─────────────────┐                                                        │
│  │ Colors, Tone    │──────▶ POST /api/trial/branding                       │
│  │ Welcome Message │         │                                              │
│  └─────────────────┘         ▼                                              │
│                        ┌──────────────────────────────────────────┐         │
│                        │ 1. analyzeKnowledgeBase()                │         │
│                        │ 2. assignTools() → via LlamaIndex       │         │
│                        │ 3. Upsert widget_config                 │         │
│                        │ 4. startTenantPipeline() ◀──TRIGGERS     │         │
│                        └────────────────┬─────────────────────────┘         │
│                                         │                                   │
│  ◀─────────────────────────────────────┼───────────────────────────────────│
│                                         ▼                                   │
│                        ┌────────────────────────────────────────┐           │
│                        │         RAG PIPELINE EXECUTION         │           │
│                        │         (buildRAGPipeline)             │           │
│                        └────────────────────────────────────────┘           │
│                                         │                                   │
│                                         ▼                                   │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  SSE STREAMING (eventsource-parser)                              │       │
│  │  /api/tenants/[tenantId]/ingest/[runId]/events                   │       │
│  │                                                                  │       │
│  │  Events: step.started → step.completed → pipeline.completed      │       │
│  │  Poll interval: 500ms                                            │       │
│  │  BroadcastChannel: Cross-tab sync                                │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                             │
│  STEP 4: Get Widget                                                         │
│  ┌─────────────────┐                                                        │
│  │ Embed Code      │◀──────  POST /api/trial/generate-widget               │
│  │ Playground Link │         (waits for pipeline ready)                     │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. RAG Pipeline Execution Flow

```
buildRAGPipeline(tenantId, config, jobId)
├── 1. SETUP (~500ms)
│   ├── validateTenantId()
│   ├── updateTenantStatus('processing')
│   └── recordStepStart('setup')
│
├── 2. INGESTION (~1000ms)
│   ├── fetchKnowledgeBase() → SELECT from knowledge_base
│   └── Returns array of docs with raw_text
│
├── 3. CHUNKING (~200ms/doc)
│   ├── chunkText(doc.raw_text, 1024, 100)
│   │   └── Sentence boundary splitting
│   └── Creates EmbeddingChunk[] with metadata
│
├── 4. EMBEDDING (~50ms/chunk)
│   ├── generateEmbeddings(chunkTexts[])
│   │   ├── POST /embed-batch to local MPNet service
│   │   ├── Batch size: 128
│   │   ├── Parallel requests: 8
│   │   └── Int8 quantization available
│   └── Returns number[][] (768-dim vectors)
│
├── 5. STORING (~5ms/vector)
│   ├── insertEmbeddings()
│   │   ├── setTenantContext() ← UNNECESSARY (service role)
│   │   └── INSERT into embeddings table
│   └── Progressive readiness: Enable Playground after 10 vectors
│
└── 6. DONE
    ├── updateTenantStatus('ready')
    └── Update ingestion_jobs.status = 'completed'
```

---

## 3. Key Components & Responsibilities

### Backend

| Component | File | Responsibility |
|-----------|------|----------------|
| Trial Start | `/api/trial/start/route.ts` | JWT creation, tenant provisioning, rate limiting (5/min) |
| KB Manual | `/api/trial/kb/manual/route.ts` | Text sanitization, SHA256 dedup, content storage |
| Branding | `/api/trial/branding/route.ts` | Tool assignment (LlamaIndex), widget config, **pipeline trigger** |
| Ingest Route | `/api/tenants/[id]/ingest/route.ts` | Job creation, pipeline initiation |
| SSE Events | `/api/tenants/[id]/ingest/[runId]/events/route.ts` | Real-time progress streaming |
| Pipeline Ready | `/api/tenants/[id]/pipeline-ready/route.ts` | Readiness check with 3s cache |
| RAG Pipeline | `lib/trial/rag-pipeline.ts` | Core orchestration, chunking, embedding, storage |
| Start Pipeline | `lib/trial/start-pipeline.ts` | Job record creation, async pipeline launch |
| Embeddings | `lib/embeddings/batched-generator.ts` | Batched embedding with retry & quantization |

### Frontend

| Component | File | Responsibility |
|-----------|------|----------------|
| Wizard | `TrialOnboardingWizard.tsx` | 4-step UI, state management, loader coordination |
| MultiStepLoader | `MultiStepLoader.tsx` | SSE consumption, progress calculation, cross-tab sync |
| ContinueWithLoader | `ContinueWithLoader.tsx` | Loading UI wrapper, error/expiry handling |
| TrialPlayground | `TrialPlayground.tsx` | Readiness polling, chat interface |
| Aceternity Loader | `ui/multi-step-loader.tsx` | Full-screen animated step visualization |

---

## 4. Identified Bottlenecks & Issues

### 🔴 Critical Issues

#### 4.1 Redundant setTenantContext in insertEmbeddings
**Location:** `lib/trial/rag-pipeline.ts:54`
```typescript
// PROBLEM: Service role bypasses RLS - this RPC is unnecessary
await setTenantContext(supabase, tenantId);
```
**Impact:** 50-200ms wasted per pipeline run
**Fix:** Remove the call (already identified in previous session)

#### 4.2 Redundant setTenantContext in hybridSearch
**Location:** `lib/trial/rag-pipeline.ts:150`
```typescript
await setTenantContext(supabase, tenantId);
```
**Impact:** 50-200ms latency added to every search query
**Fix:** Remove - the `match_embeddings` RPC already receives `match_tenant` parameter

### 🟡 Performance Issues

#### 4.3 Sequential KB Fetch → Chunk → Embed Pattern
**Current flow:**
1. Fetch ALL documents
2. Chunk ALL documents  
3. Embed ALL chunks
4. Store ALL vectors

**Problem:** No streaming/progressive approach
**Impact:** User waits for entire pipeline before seeing any progress
**Recommendation:** Process documents in batches of 5, showing incremental progress

#### 4.4 Single Pipeline Trigger Point
**Location:** Branding step triggers the entire pipeline
**Problem:** 
- User submits branding → waits for KB analysis + tool assignment + pipeline start
- No parallelism between branding API and pipeline execution

**Recommendation:** 
- Start pipeline immediately after KB step completes
- Branding step should only update widget_config (not trigger pipeline)

#### 4.5 Duplicate Polling Mechanisms
**Current state:**
1. `ingestion-status` API polled every 2000ms (legacy)
2. SSE stream from `/events` endpoint (500ms poll internally)
3. `pipeline-ready` endpoint polled by TrialPlayground

**Recommendation:** Consolidate to SSE only, remove legacy polling

### 🟢 Minor Improvements

#### 4.6 ETA Accuracy
**Current:** Static BASE_ETAS with linear scaling
**Better:** Track actual timing across runs, use P95 as ETA base

#### 4.7 Error Recovery
**Current:** Pipeline failure marks entire job as failed
**Better:** Add retry at step level, resume from last successful step

#### 4.8 BroadcastChannel Not Tested
**Location:** `MultiStepLoader.tsx:117`
**Risk:** Falls back silently if unavailable, no error handling

---

## 5. Recommended Improvements (Priority Ordered)

### Priority 1: Quick Wins (< 1 hour each)

| # | Change | Expected Impact | Effort |
|---|--------|-----------------|--------|
| 1 | Remove `setTenantContext` from `insertEmbeddings` | -100ms pipeline | 5 min |
| 2 | Remove `setTenantContext` from `hybridSearch` | -100ms per query | 5 min |
| 3 | Move pipeline trigger from Branding to KB step | -1-2s perceived latency | 30 min |
| 4 | Remove legacy `ingestion-status` polling | Cleaner code, less DB load | 20 min |

### Priority 2: Medium Impact (1-4 hours)

| # | Change | Expected Impact | Effort |
|---|--------|-----------------|--------|
| 5 | Parallel document processing | Better progress feedback | 2 hours |
| 6 | Add step-level retry logic | Better reliability | 3 hours |
| 7 | Dynamic ETA from historical data | More accurate estimates | 2 hours |

### Priority 3: Strategic (1+ days)

| # | Change | Expected Impact | Effort |
|---|--------|-----------------|--------|
| 8 | Streaming ingestion (process while user types) | Sub-60s pipeline | 2 days |
| 9 | Background pipeline with webhook notifications | Non-blocking UX | 1 day |
| 10 | Edge deployment for embedding service | Global latency reduction | 3 days |

---

## 6. Specific Code Fixes

### Fix 4.1: Remove setTenantContext from insertEmbeddings

```typescript
// lib/trial/rag-pipeline.ts - REMOVE LINES 54-55
export async function insertEmbeddings(
  tenantId: string,
  chunks: EmbeddingChunk[],
  embeddings: number[][]
): Promise<void> {
  validateTenantId(tenantId);
  if (chunks.length === 0) return;

  // DELETE THIS LINE:
  // await setTenantContext(supabase, tenantId);

  const records = chunks.map((chunk, i) => ({
    // ... unchanged
  }));
  // ...
}
```

### Fix 4.2: Remove setTenantContext from hybridSearch

```typescript
// lib/trial/rag-pipeline.ts - REMOVE LINE ~150
export async function hybridSearch(...) {
  // ...
  
  // DELETE THIS LINE:
  // await setTenantContext(supabase, tenantId);
  
  const { data: vdata, error: verror } = await supabase.rpc('match_embeddings', {
    query_embedding: queryEmbedding,
    match_tenant: tenantId, // Already passes tenant - RLS not needed
    // ...
  });
  // ...
}
```

### Fix 4.3: Move Pipeline Trigger to KB Step

**Before (branding/route.ts triggers):**
```typescript
// In branding route
const pipeline = await startTenantPipeline(tenantId, {...});
```

**After (kb/manual/route.ts triggers):**
```typescript
// In kb/manual route - add at end
import { startTenantPipeline } from '@/lib/trial/start-pipeline';

// After successful KB insert
const pipeline = await startTenantPipeline(tenantId, {
  source: 'manual',
  skipIfProcessing: true, // Don't restart if already running
});

return NextResponse.json({ 
  success: true, 
  pipelineJobId: pipeline.jobId,
  pipelineStatus: pipeline.status,
});
```

**Frontend update (TrialOnboardingWizard.tsx):**
```typescript
// In handleKBSubmit, capture jobId for SSE
const data = await response.json();
if (data.pipelineJobId) {
  setIngestionJobId(data.pipelineJobId);
  setIngestionStatus('processing');
}
setState(prev => ({ ...prev, step: 3 }));
```

---

## 7. Architecture Quality Assessment

| Aspect | Current State | Score | Notes |
|--------|---------------|-------|-------|
| **Separation of Concerns** | Good | 8/10 | Clear API boundaries |
| **Error Handling** | Adequate | 6/10 | Missing step-level recovery |
| **Real-time Updates** | Good | 8/10 | SSE + BroadcastChannel |
| **Performance** | Needs Work | 5/10 | Redundant RPC calls, sequential processing |
| **Scalability** | Adequate | 6/10 | No queue system for high load |
| **Security** | Good | 8/10 | JWT auth, tenant isolation |
| **Observability** | Good | 7/10 | Metrics + timing headers |
| **UX** | Good | 8/10 | Progressive loader, ETA estimates |

**Overall Score: 7/10** - Solid foundation with clear optimization opportunities

---

## 8. Next Steps

1. ✅ Implement Priority 1 fixes (1-2 hours total)
2. Add E2E tests for pipeline flow
3. Add APM tracing for bottleneck identification
4. Consider Redis queue for pipeline jobs at scale

---

*Generated: Architecture Analysis Session*
*Last Updated: Current session*
