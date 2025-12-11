# Onboarding Flow Confirmation: RAG Pipeline Ready for Playground

## ✅ Complete Flow Verification

When you complete the onboarding wizard by:
1. **Entering business name** (Step 1)
2. **Adding business input source** (Step 2: Knowledge Base)
3. **Choosing complete branding & platform** (Step 3: Branding)

The RAG pipeline **is automatically established and ready** for the playground.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Get Started (Name, Email, Business Type)                │
│ - Tenant created in trial_tenants table                          │
│ - Bearer token generated for session                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Knowledge Base (Business Info Input)                     │
│ - POST /api/trial/kb/manual                                      │
│ - Company info stored in knowledge_base table                    │
│ - Raw documents ingested                                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Branding (Choose Colors, Tone, Welcome Message)         │
│ - POST /api/trial/branding                                       │
│ ├─ Analyzes knowledge base documents                             │
│ ├─ Assigns tools based on business type                          │
│ ├─ Generates prompt template                                     │
│ ├─ Creates/updates widget_configs                                │
│ └─ ⚡ AUTO-TRIGGERS RAG PIPELINE ⚡                              │
│    └─ startTenantPipeline(tenantId)                              │
│       ├─ Ingestion job created (status: queued/processing)       │
│       ├─ Documents chunked (1024 char chunks, 100 overlap)       │
│       ├─ Embeddings generated (all-mpnet-base-v2 model)          │
│       └─ Vectors stored in embeddings table                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼ (ingestionProgress polling)
                    Pipeline Processing
                    (2-5 minutes typical)
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Get Widget (Auto-Generated After Pipeline)               │
│ - Polling detects completion                                     │
│ - handleGenerateWidget() triggered                               │
│ - POST /api/trial/generate-widget                                │
│ ├─ Checks isPipelineReady():                                     │
│ │  ├─ rag_status = 'ready' or 'active' ✓                        │
│ │  ├─ vectorCount >= minVectors (10) ✓                          │
│ │  └─ lastJobStatus = 'completed' ✓                             │
│ ├─ Generates embed code                                          │
│ ├─ Returns widget CDN URL                                        │
│ └─ ✅ READY FOR PLAYGROUND ✅                                    │
│    - embedCode with data attributes                              │
│    - previewUrl for testing                                      │
│    - assignedTools for queries                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## What Happens at Each Step

### Step 1: Get Started
- **Input**: Name, Email, Business Type (e.g., SaaS, E-commerce)
- **Backend**: 
  - Creates `trial_tenants` record with status='active'
  - Generates JWT Bearer token (60 days expiry)
  - Returns `tenantId` and `setupToken`

### Step 2: Knowledge Base
- **Input**: Company info/business description
- **Backend** (`/api/trial/kb/manual`):
  - Stores raw text in `knowledge_base` table
  - Tags with tenant_id for isolation
  - Ready for pipeline to consume

### Step 3: Branding (⚡ CRITICAL STEP ⚡)
- **Input**: Primary color, secondary color, chat tone, welcome message
- **Backend** (`/api/trial/branding`):
  1. **Validates** hex colors and tone
  2. **Analyzes KB documents** → determines what tools are relevant
  3. **Assigns tools** based on business_type + KB analysis
  4. **Generates prompt template** for RAG retrieval
  5. **Creates/updates widget_configs** with all settings
  6. **🔥 AUTO-STARTS RAG PIPELINE** via `startTenantPipeline()`:
     - Creates `ingestion_jobs` record
     - Triggers document chunking & embedding generation
     - Stores vectors in `embeddings` table
     - Updates `rag_status` → 'processing' → 'ready'
  7. **Returns pipeline jobId** for frontend polling

### Step 4: Get Widget (Auto-Triggered)
- **Trigger**: When pipeline completes (polling detects it)
- **Backend** (`/api/trial/generate-widget`):
  1. **Verifies isPipelineReady**:
     - Checks `rag_status = 'ready'` OR
     - Checks `vectorCount >= 10` OR
     - Checks `lastJob.status = 'completed'`
  2. **Generates embed code** with:
     - Widget CDN URL
     - Tenant ID (for vector retrieval)
     - Branding (colors, welcome message)
     - Assigned tools config
  3. **Returns to frontend** → displays code + preview link

---

## Readiness Checks

### Pipeline Readiness (`isPipelineReady`)
```typescript
✅ READY if ANY of:
- rag_status === 'ready' OR 'active'
- vectorCount >= minVectors (default: 10)
- lastJobStatus === 'completed'

❌ NOT READY if:
- rag_status === 'processing' (still building)
- vectorCount < minVectors
- No completed jobs yet
```

### Widget Generation Checks
```typescript
✅ Proceeds if:
- tenant.status === 'active'
- widget_configs exists
- rag_status checked via isPipelineReady

❌ Returns 'processing' if:
- Pipeline still building
- Re-queues with jobId for retry
```

---

## Complete Playground Access

After branding is saved:

```
Timeline:
T+0s     : Branding POST /api/trial/branding → triggers pipeline
T+0-10s  : Frontend gets jobId, starts polling ingestion status
T+0-300s : Pipeline runs (embedding generation)
T+300s+  : Polling detects completion → calls generate-widget
T+301s   : Embed code generated → displayed in UI

User can:
✅ Copy embed code immediately after step 4
✅ Preview widget in /widget-preview/{tenantId}
✅ Test queries in playground (RAG will use generated vectors)
✅ Tools assigned automatically based on KB content
```

---

## Data Flow Summary

| Component | Status After Branding |
|-----------|----------------------|
| trial_tenants.rag_status | `processing` → `ready` |
| knowledge_base | ✅ Documents stored |
| widget_configs | ✅ Created with colors, tone, tools |
| ingestion_jobs | ✅ Created, status='processing' |
| embeddings | ✅ Generated during pipeline |
| vectors (pgvector) | ✅ Stored in DB, ready for retrieval |
| embed code | ✅ Generated after completion |

---

## Key Confirmations

✅ **Branding step triggers RAG pipeline automatically**
✅ **Pipeline processes knowledge base into vectors**
✅ **Frontend polls and detects completion**
✅ **Widget auto-generated after pipeline ready**
✅ **Playground can immediately query with RAG**
✅ **Tools assigned based on business type + KB content**
✅ **All data isolated per tenant (RLS-protected)**
✅ **Trial token valid for 60 days**

---

## What User Sees in UI

### Step 3 (Branding) → Step 4 (Widget)
1. User submits branding form
2. UI shows "Processing widget..." with progress bar
3. ContinueWithLoader polls `/api/trial/ingestion-status?jobId={jobId}`
4. When complete: "Your widget is ready! Copy the code below."
5. Embed code displayed with copy button
6. Preview link shows live chatbot in action
7. User can test in their app or in preview

---

## Conclusion

**YES, CONFIRMED.** When you complete the onboarding flow:
1. Enter business name ✅
2. Add business input/knowledge base ✅  
3. Complete branding & platform selection ✅

**The RAG pipeline is automatically established, processed, and ready for immediate use in the playground.** No additional steps required.
