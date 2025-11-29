# Phase 2: Workflow Engine with LangChain Interrupts - Detailed Explanation

**Status**: Planned for Week 2-3  
**Estimated Effort**: 80-120 engineering hours  
**Dependencies**: Phase 1 (Usage Monitoring) - COMPLETE ✅

---

## 🎯 Executive Summary

Phase 2 implements a **state machine for complex, multi-step trial onboarding** with:
- Automatic step orchestration (trial → KB → branding → widget → live)
- Intelligent pause/resume/rollback capabilities
- LangChain integration for KB quality assessment
- Manual intervention points for edge cases
- Complete audit trail of workflow execution

**Problem Solved**: Currently, trial setup is a series of disconnected API calls with no orchestration, no error recovery, and no guarantee all steps complete successfully.

---

## 📋 The Trial Onboarding Flow

### Today (Broken)
```
User starts trial
    ↓
POST /api/trial/start → Creates trial, returns JWT
    ↓ (User manually makes next call)
POST /api/trial/kb/upload → Uploads documents
    ↓ (User manually makes next call)
POST /api/trial/branding → Configures colors/tone
    ↓ (User manually makes next call)
POST /api/trial/generate-widget → Generates widget code
    ↓
User has widget (maybe - depends on manual steps all succeeding)

PROBLEMS:
❌ No automatic progression
❌ If step 2 fails, steps 3-4 are orphaned
❌ No quality gates (bad KB proceeds to branding)
❌ No way to pause for manual review
❌ No automatic retry on transient failures
```

### With Phase 2 (Smart Orchestration)
```
User starts trial
    ↓
Workflow starts: trial_init
    ├─ Create trial tenant
    ├─ Generate JWT setup token
    └─ Workflow auto-advances to: kb_ingest
        ├─ Wait for KB upload (webhook or polling)
        ├─ Process documents with LangChain
        ├─ Assess KB quality
        └─ IF quality < 0.5: PAUSE for admin review
        └─ IF quality ≥ 0.5: Auto-advance to: branding_config
            ├─ Auto-assign tools based on KB content
            ├─ Set default branding
            └─ Auto-advance to: widget_deploy
                ├─ Generate widget code with SRI integrity
                ├─ Deploy to CDN
                └─ Auto-advance to: go_live
                    ├─ Mark trial as ready
                    ├─ Send onboarding email
                    └─ COMPLETE

BENEFITS:
✅ Automatic progression (no manual API calls)
✅ Quality gates (bad KB pauses for review)
✅ Intelligent retries
✅ Pause/resume for complex scenarios
✅ Rollback on failure (cleanup partial state)
✅ Progress visibility (% complete)
✅ Admin oversight with interrupts
```

---

## 🏗️ Architecture

### 1. Workflow States (Database)

```sql
CREATE TABLE workflow_states (
  workflow_id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES trial_tenants(tenant_id),
  
  -- State tracking
  current_step VARCHAR(50),  -- 'trial_init', 'kb_ingest', etc.
  status VARCHAR(20),        -- 'pending', 'in_progress', 'paused', 'completed', 'failed', 'rolled_back'
  progress_percent INT,      -- 0-100
  
  -- Completion tracking
  steps_completed TEXT[],    -- ['trial_init', 'kb_ingest']
  steps_failed TEXT[],       -- ['branding_config']
  error TEXT,                -- Error message if failed
  
  -- Pause/resume
  paused_reason TEXT,
  paused_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### 2. Workflow Interrupts (Manual Review Points)

```sql
CREATE TABLE workflow_interrupts (
  interrupt_id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflow_states,
  
  interrupt_reason TEXT,     -- 'Low KB quality detected', 'Manual verification needed'
  required_action VARCHAR(50), -- 'retry', 'manual_review', 'user_input', 'admin_approval'
  context_data JSONB,        -- Quality score, issues, recommendations
  
  resolved_at TIMESTAMPTZ,   -- When admin resolved it
  resolution_action TEXT,    -- 'approved', 'rejected', 'retry'
  
  timestamp TIMESTAMPTZ
);
```

### 3. Workflow Engine (Core Class)

**Key Methods**:
- `initWorkflow(tenantId)` - Start a new workflow
- `executeStep(workflowId, step, context)` - Run a step with error handling
- `pauseWorkflow(workflowId, reason)` - Pause for manual review
- `resumeWorkflow(workflowId)` - Resume after review
- `rollbackWorkflow(workflowId, toStep?)` - Undo to previous step

**Step Handlers**:
- `executeTrialInit()` - Create trial, generate token
- `executeKBIngest()` - Process KB, assess quality with LangChain
- `executeBrandingConfig()` - Auto-assign tools, set defaults
- `executeWidgetDeploy()` - Generate widget, CDN upload
- `executeGoLive()` - Mark ready, send email

---

## 🧠 LangChain Integration

### KB Quality Assessment (During kb_ingest Step)

**Goal**: Automatically assess if uploaded KB is sufficient quality

```typescript
async assessKBQuality(tenantId: string, documents: Document[]): Promise<{
  quality_score: number;      // 0-1.0
  quality_issues: string[];   // ['too_generic', 'insufficient_examples', 'poor_structure']
  confidence: number;         // 0-1.0
  recommendation: string;     // 'approve' | 'manual_review' | 'reject'
}> {
  // Use LangChain to:
  // 1. Summarize document set
  // 2. Check for domain coverage
  // 3. Verify content relevance
  // 4. Assess completeness for chatbot training
  // 5. Score 0-1.0 based on quality signals
  
  // Return detailed assessment for display/admin review
}
```

**Quality Score Thresholds**:
- `< 0.3`: Auto-reject, ask user to re-upload
- `0.3-0.5`: Pause workflow, require admin approval
- `0.5-0.7`: Continue with warning
- `0.7+`: Approve automatically

### Tool Assignment (During branding_config Step)

```typescript
async assignToolsAutomatically(tenantId: string): Promise<string[]> {
  // Use KB content to determine which tools are most relevant
  // e.g., if KB mentions "email scheduling" → assign 'email' tool
  
  // Uses LangChain to:
  // 1. Analyze KB topics
  // 2. Map to available tools
  // 3. Return recommended tools
}
```

---

## 🔄 Workflow Execution Flow

### Step 1: Trial Initialization
```
Input: tenantId, email, businessName, businessType
Process:
  1. Create trial_tenant record
  2. Generate JWT setup token
  3. Mark step_completed
  4. Auto-advance to kb_ingest
  
Output: Trial ready, waiting for KB
Time: ~100ms
Error handling: If fails → workflow.status = 'failed'
```

### Step 2: KB Ingestion
```
Input: KB documents (from file upload or web crawl)
Process:
  1. Chunk documents with LangChain
  2. Generate embeddings
  3. Store in vector DB
  4. Assess quality with LangChain
  
Quality Check:
  IF quality_score < 0.5:
    → Pause workflow
    → Create interrupt (manual_review)
    → Admin reviews, approves or rejects
    
  IF quality_score ≥ 0.5:
    → Auto-advance to branding_config
    
Error handling: If fails → Pause for retry
```

### Step 3: Branding Configuration
```
Input: KB content context
Process:
  1. Analyze KB to assign tools
  2. Set default branding (colors, tone)
  3. Generate widget config
  4. Auto-advance to widget_deploy
  
Intelligent Defaults:
  - Detect business type from KB
  - Recommend tone (professional, friendly, casual)
  - Suggest color scheme
  
Error handling: Continue with defaults if fails
```

### Step 4: Widget Deployment
```
Input: Widget config
Process:
  1. Generate widget code
  2. Calculate SRI integrity hash
  3. Add CSP headers
  4. Deploy to CDN (optional)
  5. Auto-advance to go_live
  
Error handling: If fails → Pause for retry
```

### Step 5: Go Live
```
Input: Everything complete
Process:
  1. Mark trial as 'active' and ready
  2. Send onboarding email
  3. Log completion event
  4. workflow.status = 'completed'
  
Success: Trial fully onboarded
```

---

## ⏸️ Interrupt Types & Handling

### Type 1: Manual Review (Admin Decision)
```
Scenario: KB quality is borderline (score: 0.45)

Trigger: if (quality_score >= 0.3 && quality_score < 0.5)

Action: Workflow pauses, interrupt created with:
  - quality_score: 0.45
  - issues: ['insufficient_examples', 'generic_content']
  - recommendation: 'Ask user for more specific docs'

Admin Options:
  a) Approve anyway → Resume workflow
  b) Request re-upload → Reset to kb_ingest step
  c) Reject → Mark trial failed
```

### Type 2: User Input Required
```
Scenario: No KB uploaded after 24 hours

Trigger: timeout or manual trigger

Action: Workflow pauses, interrupt created with:
  - reason: 'KB upload timeout'
  - required_action: 'user_input'

System: Send email: "Your trial setup is waiting for KB upload"

User clicks → Uploads KB → Resume workflow
```

### Type 3: System Error (Auto-Retry)
```
Scenario: Embedding API fails

Trigger: Exception during executeKBIngest

Action:
  1. Log error
  2. Retry up to 3x with exponential backoff
  3. If all retries fail → Interrupt with 'admin_approval'

Admin: Manually reviews error, decides to retry or rollback
```

### Type 4: Validation Failure (Block & Notify)
```
Scenario: Branding colors invalid

Trigger: Color validation fails

Action:
  1. Stop execution
  2. Create interrupt
  3. Send error to user: "Invalid color #GGHHII"
  4. User fixes and retries

User: Corrects and clicks "Continue"
```

---

## 🔙 Rollback Capability

### Scenario: Widget deploy fails, need to redo branding

```
Current state:
  current_step: 'widget_deploy' (failed)
  steps_completed: ['trial_init', 'kb_ingest', 'branding_config']
  steps_failed: ['widget_deploy']

Admin Action: Call rollbackWorkflow(workflowId, 'branding_config')

Rollback Process:
  1. Delete partial widget config
  2. Set current_step = 'branding_config'
  3. Remove 'branding_config' from steps_completed
  4. Re-execute branding_config step
  5. If succeeds → auto-advance to widget_deploy

Result:
  ✅ Widget deploy now succeeds
```

### Cleanup on Rollback
```
When rolling back from a step, cleanup:
- KB embeddings (if rolling back from kb_ingest)
- Widget configs (if rolling back from widget_deploy)
- Chat sessions (if going backwards)
- Temp files (if crawl was in progress)

Ensures no orphaned data or conflicts
```

---

## 📊 Admin Dashboard Integration

### Workflow Monitoring View
```json
{
  "workflow_id": "wf-123",
  "tenant_id": "tenant-456",
  "tenant_email": "user@example.com",
  
  "status": "paused",
  "current_step": "kb_ingest",
  "progress_percent": 40,
  
  "steps_completed": ["trial_init"],
  "steps_in_progress": ["kb_ingest"],
  "steps_pending": ["branding_config", "widget_deploy", "go_live"],
  "steps_failed": [],
  
  "pause_reason": "Low KB quality (0.42 < 0.50)",
  "paused_since": "2025-11-16T14:32:00Z",
  
  "interrupts": [
    {
      "interrupt_id": "int-789",
      "reason": "Low KB quality",
      "action": "manual_review",
      "context": { "quality_score": 0.42, "issues": [...] },
      "status": "pending_admin_review"
    }
  ],
  
  "timeline": [
    { "step": "trial_init", "status": "completed", "duration_ms": 150 },
    { "step": "kb_ingest", "status": "paused", "duration_ms": 5000 },
  ]
}
```

### Admin Actions
- **Resume**: Skip to next step
- **Retry**: Re-run current step
- **Rollback**: Go back to previous step
- **Approve**: Override validation/quality check
- **Cancel**: Mark trial failed

---

## 🚀 Implementation Plan

### Week 1: Foundation
- [ ] Create workflow_states & workflow_interrupts tables
- [ ] Implement TrialWorkflowEngine base class
- [ ] Add pause/resume/rollback methods
- [ ] Create workflow state persistence layer
- [ ] Write comprehensive tests

### Week 2: Step Handlers
- [ ] Implement executeTrialInit()
- [ ] Implement executeKBIngest() with LangChain integration
- [ ] Implement executeBrandingConfig()
- [ ] Implement executeWidgetDeploy()
- [ ] Implement executeGoLive()
- [ ] Test each step independently

### Week 3: LangChain & Interrupts
- [ ] Integrate LangChain for KB quality assessment
- [ ] Integrate LangChain for tool assignment
- [ ] Implement interrupt creation & resolution
- [ ] Add manual_review workflow
- [ ] End-to-end workflow testing

### Week 4: Admin Tools & Monitoring
- [ ] Create workflow monitoring dashboard
- [ ] Implement admin action endpoints (resume, retry, rollback)
- [ ] Add workflow timeline/audit trail
- [ ] Performance testing
- [ ] Documentation

---

## 💾 Database Schema

### workflow_states
```sql
CREATE TABLE workflow_states (
  workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  current_step VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'paused', 'completed', 'failed', 'rolled_back')),
  steps_completed TEXT[] DEFAULT ARRAY[]::TEXT[],
  steps_failed TEXT[] DEFAULT ARRAY[]::TEXT[],
  error TEXT,
  progress_percent INT DEFAULT 0,
  paused_reason TEXT,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_tenant ON workflow_states(tenant_id);
CREATE INDEX idx_workflow_status ON workflow_states(status);
```

### workflow_interrupts
```sql
CREATE TABLE workflow_interrupts (
  interrupt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_states(workflow_id),
  interrupt_reason TEXT NOT NULL,
  required_action VARCHAR(50) NOT NULL, -- 'retry', 'manual_review', 'user_input', 'admin_approval'
  context_data JSONB DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interrupts_workflow ON workflow_interrupts(workflow_id);
CREATE INDEX idx_interrupts_unresolved ON workflow_interrupts(workflow_id) WHERE resolved_at IS NULL;
```

---

## 🧪 Testing Strategy

### Unit Tests
- Each step handler executes successfully in isolation
- Pause/resume mechanics work correctly
- Rollback cleans up partial state
- Interrupt creation captures correct metadata

### Integration Tests
- Full workflow from start to finish
- Workflow pauses at quality gate
- Admin resumes after approval
- Step failure triggers correct interrupt
- Rollback and retry succeeds

### Scenario Tests
- Slow KB upload (timeout handling)
- LangChain quality assessment edge cases
- Multiple interrupts in sequence
- Concurrent workflow executions
- Database state consistency

---

## 🎯 Success Metrics

| Metric | Target | Benefit |
|--------|--------|---------|
| Workflow completion rate | >95% | Reliable onboarding |
| Time to complete | <5 mins | Better UX |
| Manual review rate | <10% | Quality gate effectiveness |
| False positive rate | <5% | Admin doesn't over-ride good KBs |
| Admin action time | <2 mins | Quick resolution |

---

## 🔗 Dependencies

### Before Phase 2, Need:
- ✅ Phase 1 (Usage Monitoring) - completed
- ✅ Database schema (trial_tenants, etc.)
- ✅ LangChain library installed
- ✅ Vector DB (Supabase pgvector)
- ✅ S3 or CDN for widget deployment (optional)

### After Phase 2, Enables:
- Phase 3: Webhook notifications
- Phase 3: Advanced analytics
- Phase 3: Distributed workflow execution

---

## 💰 Business Impact

| Scenario | Before | After | Benefit |
|----------|--------|-------|---------|
| User uploads bad KB | Proceeds to branding, fails later | Pauses, asks for better content | Prevents bad chatbots |
| User leaves mid-setup | Partial state orphaned | Resumes from last step | Better recovery |
| System error during deploy | Manual restart required | Auto-retries 3x | 95%+ success rate |
| Admin needs visibility | None | Workflow dashboard | Better support |
| Estimated time to onboard | 20+ minutes | 5 minutes | 4x faster |

---

## 🚦 Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| LangChain quality assessment too strict | Medium | High | Make thresholds configurable, A/B test |
| Workflow state corruption | Low | High | Add state validation, regular backups |
| Long-running workflows timeout | Low | Medium | Implement step timeout with retry |
| Concurrent workflow conflicts | Low | High | Add distributed locking (Redis) |
| False positive interrupts spam admins | Medium | Low | Dashboard filtering, auto-archive resolved |

---

## 📚 Next Steps

1. **Review** this Phase 2 spec with team
2. **Refine** workflows based on feedback
3. **Estimate** implementation effort
4. **Schedule** Phase 2 kickoff
5. **Begin** week 1 foundation work

**Recommendation**: Start Phase 2 once Phase 1 is stable in staging (~1 week after Phase 1 deploy).

