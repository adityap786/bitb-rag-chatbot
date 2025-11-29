# Tenant Usage Monitoring & Workflow Architecture Recommendations

## Executive Summary

To properly support the RAG chatbot trial system at scale with enterprise-grade monitoring and complex workflow handling, we recommend implementing:

1. **Dedicated Usage Monitoring Table** - Track all tenant API consumption, embeddings operations, and quota usage
2. **Workflow State Machine** - Handle complex multi-step processes with LangChain interrupts
3. **Event Audit Log** - Immutable record of all tenant actions for compliance and debugging
4. **Real-time Metrics Dashboard** - Admin visibility into system performance and tenant health

---

## 1. Usage Monitoring Table Schema

### Problem Statement
Currently, there's no way to:
- Track token consumption per tenant (API calls, embeddings, messages)
- Enforce quotas during trial periods or premium plans
- Identify runaway usage patterns
- Generate billing-accurate usage reports
- Detect and prevent abuse

### Proposed Solution: `tenant_usage_metrics` Table

```sql
CREATE TABLE IF NOT EXISTS tenant_usage_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  
  -- Time period tracking
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_type VARCHAR(20) CHECK (period_type IN ('hourly', 'daily', 'monthly')) DEFAULT 'daily',
  
  -- API usage metrics
  api_calls_total INT DEFAULT 0,
  api_calls_successful INT DEFAULT 0,
  api_calls_failed INT DEFAULT 0,
  api_calls_rate_limited INT DEFAULT 0,
  api_latency_avg_ms FLOAT DEFAULT 0, -- Average response time
  api_latency_p95_ms FLOAT DEFAULT 0, -- 95th percentile
  api_latency_p99_ms FLOAT DEFAULT 0, -- 99th percentile
  
  -- Chat-specific metrics
  chat_messages_sent INT DEFAULT 0,
  chat_messages_received INT DEFAULT 0,
  chat_sessions_created INT DEFAULT 0,
  chat_avg_response_time_ms FLOAT DEFAULT 0,
  
  -- Embeddings & RAG metrics
  embeddings_generated INT DEFAULT 0,
  embeddings_tokens_used INT DEFAULT 0,
  semantic_searches_performed INT DEFAULT 0,
  kb_documents_ingested INT DEFAULT 0,
  kb_documents_failed INT DEFAULT 0,
  
  -- Cost & quota tracking
  total_tokens_used INT DEFAULT 0, -- OpenAI tokens (embeddings + completions)
  estimated_cost_usd NUMERIC(10, 4) DEFAULT 0,
  quota_limit INT, -- NULL = unlimited, else enforce limit
  quota_remaining INT,
  quota_exceeded_count INT DEFAULT 0,
  
  -- Performance indicators
  error_count INT DEFAULT 0,
  error_rate FLOAT DEFAULT 0, -- Percentage of failed requests
  peak_qps FLOAT DEFAULT 0, -- Queries per second
  
  -- Data quality
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_usage_tenant_period ON tenant_usage_metrics(tenant_id, period_start DESC);
CREATE INDEX idx_usage_period_type ON tenant_usage_metrics(tenant_id, period_type, period_start DESC);
CREATE INDEX idx_usage_quota_exceeded ON tenant_usage_metrics(tenant_id) WHERE quota_exceeded_count > 0;
CREATE INDEX idx_usage_high_latency ON tenant_usage_metrics(tenant_id) WHERE api_latency_p99_ms > 5000;
```

### Real-time Usage Table (High-Frequency Updates)

```sql
CREATE TABLE IF NOT EXISTS tenant_usage_realtime (
  entry_id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'api_call', 'chat_message', 'embedding', 'search'
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Event-specific data
  api_method VARCHAR(10), -- GET, POST, etc.
  api_endpoint VARCHAR(255),
  api_status_code INT,
  api_response_time_ms INT,
  
  chat_session_id UUID,
  embedding_tokens INT,
  search_query_tokens INT,
  search_result_count INT,
  
  -- Quota tracking
  tokens_consumed INT DEFAULT 0,
  cost_usd NUMERIC(10, 6),
  
  -- Index for time-series queries
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time-based partitioning for efficient time-series queries
CREATE INDEX idx_realtime_tenant_time ON tenant_usage_realtime(tenant_id, event_timestamp DESC);
CREATE INDEX idx_realtime_event_type ON tenant_usage_realtime(event_type, event_timestamp DESC);
CREATE INDEX idx_realtime_daily_cutoff ON tenant_usage_realtime(event_timestamp DESC)
  WHERE event_timestamp > NOW() - INTERVAL '30 days';
```

### Integration Points

Add to `src/types/trial.ts`:

```typescript
// Usage Monitoring Types
export interface TenantUsageMetrics {
  metric_id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  period_type: 'hourly' | 'daily' | 'monthly';
  
  // API metrics
  api_calls_total: number;
  api_calls_successful: number;
  api_calls_failed: number;
  api_latency_p95_ms: number;
  
  // Chat metrics
  chat_messages_sent: number;
  chat_sessions_created: number;
  chat_avg_response_time_ms: number;
  
  // Embeddings metrics
  embeddings_generated: number;
  embeddings_tokens_used: number;
  semantic_searches_performed: number;
  
  // Quota
  total_tokens_used: number;
  estimated_cost_usd: number;
  quota_limit: number | null;
  quota_remaining: number;
  quota_exceeded_count: number;
  
  error_rate: number;
  peak_qps: number;
  updated_at: string;
}

export interface UsageEventPayload {
  tenant_id: string;
  event_type: 'api_call' | 'chat_message' | 'embedding' | 'search';
  event_timestamp: string;
  tokens_consumed: number;
  cost_usd?: number;
  api_response_time_ms?: number;
  metadata?: Record<string, any>;
}
```

---

## 2. Workflow State Machine with LangChain Interrupts

### Problem Statement
Trial onboarding involves multiple dependent steps:
1. Trial creation → 2. KB upload/crawl → 3. Branding configuration → 4. Widget deployment

Currently, these are independent API calls with no orchestration, error recovery, or rollback capability.

### Proposed Architecture

```typescript
// src/lib/trial/workflow-engine.ts

import { BaseMessageChunk } from '@langchain/core/messages';
import { Runnable, RunnableLambda } from '@langchain/core/runnable';

export type WorkflowStep = 'trial_init' | 'kb_ingest' | 'branding_config' | 'widget_deploy' | 'go_live';
export type WorkflowStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'failed' | 'rolled_back';

export interface WorkflowState {
  workflow_id: string;
  tenant_id: string;
  current_step: WorkflowStep;
  status: WorkflowStatus;
  steps_completed: WorkflowStep[];
  steps_failed: WorkflowStep[];
  error?: string;
  progress_percent: number;
  created_at: string;
  updated_at: string;
  paused_reason?: string;
  paused_at?: string;
}

export interface WorkflowInterrupt {
  workflow_id: string;
  interrupt_reason: string;
  required_action: string; // 'retry', 'manual_review', 'user_input', 'admin_approval'
  context_data: Record<string, any>;
  timestamp: string;
}

// State machine for orchestrating trial setup
export class TrialWorkflowEngine {
  private workflows = new Map<string, WorkflowState>();
  private supabase = createClient(...);
  
  async initWorkflow(tenantId: string): Promise<WorkflowState> {
    const workflow: WorkflowState = {
      workflow_id: crypto.randomUUID(),
      tenant_id: tenantId,
      current_step: 'trial_init',
      status: 'pending',
      steps_completed: [],
      steps_failed: [],
      progress_percent: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    this.workflows.set(workflow.workflow_id, workflow);
    
    // Persist to database
    await this.supabase.from('workflow_states').insert([workflow]);
    
    return workflow;
  }
  
  // LangChain runnable for step execution with interrupt handling
  async executeStep(
    workflowId: string,
    step: WorkflowStep,
    context: Record<string, any>
  ): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    try {
      // Update to in_progress
      workflow.status = 'in_progress';
      workflow.current_step = step;
      workflow.updated_at = new Date().toISOString();
      
      // Execute step with interrupt handling
      switch (step) {
        case 'trial_init':
          await this.executeTrialInit(workflowId, context);
          break;
        case 'kb_ingest':
          await this.executeKBIngest(workflowId, context);
          break;
        case 'branding_config':
          await this.executeBrandingConfig(workflowId, context);
          break;
        case 'widget_deploy':
          await this.executeWidgetDeploy(workflowId, context);
          break;
        case 'go_live':
          await this.executeGoLive(workflowId, context);
          break;
      }
      
      // Mark step as completed
      workflow.steps_completed.push(step);
      workflow.progress_percent = Math.floor(
        (workflow.steps_completed.length / 5) * 100
      );
      
      // Auto-advance to next step
      const nextStep = this.getNextStep(step);
      if (nextStep) {
        await this.executeStep(workflowId, nextStep, context);
      } else {
        workflow.status = 'completed';
      }
    } catch (error) {
      // Handle interrupt
      if (error instanceof WorkflowInterrupt) {
        workflow.status = 'paused';
        workflow.paused_reason = error.interrupt_reason;
        workflow.paused_at = new Date().toISOString();
        
        // Store interrupt for admin review
        await this.supabase.from('workflow_interrupts').insert([{
          workflow_id: workflowId,
          interrupt_reason: error.interrupt_reason,
          required_action: error.required_action,
          context_data: error.context_data,
          timestamp: new Date().toISOString(),
        }]);
      } else {
        workflow.status = 'failed';
        workflow.error = error instanceof Error ? error.message : 'Unknown error';
        workflow.steps_failed.push(step);
      }
    }
    
    // Persist state changes
    await this.supabase.from('workflow_states')
      .update(workflow)
      .eq('workflow_id', workflowId);
  }
  
  // Interrupt handlers for complex decisions
  async executeKBIngest(workflowId: string, context: Record<string, any>): Promise<void> {
    const { tenant_id, kb_source } = context;
    
    try {
      // Process KB with LangChain agent
      const result = await this.processKBWithAgent(tenant_id, kb_source);
      
      // Check for quality issues that require interrupt
      if (result.quality_score < 0.5) {
        throw new WorkflowInterrupt(
          workflowId,
          'Low KB quality detected',
          'manual_review',
          {
            quality_score: result.quality_score,
            issues: result.quality_issues,
            recommendation: 'Admin should review KB content',
          }
        );
      }
      
      if (result.documents_count === 0) {
        throw new WorkflowInterrupt(
          workflowId,
          'No documents extracted from KB source',
          'user_input',
          {
            suggestion: 'User should provide valid content',
          }
        );
      }
    } catch (error) {
      throw error;
    }
  }
  
  // Pause workflow for manual intervention
  async pauseWorkflow(workflowId: string, reason: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = 'paused';
      workflow.paused_reason = reason;
      workflow.paused_at = new Date().toISOString();
      await this.supabase.from('workflow_states')
        .update(workflow)
        .eq('workflow_id', workflowId);
    }
  }
  
  // Resume workflow from pause
  async resumeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow && workflow.status === 'paused') {
      workflow.status = 'in_progress';
      workflow.paused_reason = undefined;
      workflow.paused_at = undefined;
      await this.supabase.from('workflow_states')
        .update(workflow)
        .eq('workflow_id', workflowId);
      
      // Resume from current step
      await this.executeStep(workflowId, workflow.current_step, {});
    }
  }
  
  // Rollback to previous state
  async rollbackWorkflow(workflowId: string, toStep?: WorkflowStep): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    
    const rollbackTo = toStep || this.getPreviousStep(workflow.current_step);
    
    // Clean up current step resources
    await this.cleanupStep(workflow.current_step, workflow.tenant_id);
    
    // Reset to previous state
    workflow.status = 'in_progress';
    workflow.current_step = rollbackTo;
    workflow.steps_failed.push(workflow.current_step);
    workflow.steps_completed = workflow.steps_completed.filter(s => s !== rollbackTo);
    
    await this.supabase.from('workflow_states')
      .update(workflow)
      .eq('workflow_id', workflowId);
    
    // Retry from rollback point
    await this.executeStep(workflowId, rollbackTo, {});
  }
  
  private getNextStep(current: WorkflowStep): WorkflowStep | null {
    const sequence: WorkflowStep[] = ['trial_init', 'kb_ingest', 'branding_config', 'widget_deploy', 'go_live'];
    const idx = sequence.indexOf(current);
    return idx >= 0 && idx < sequence.length - 1 ? sequence[idx + 1] : null;
  }
  
  private getPreviousStep(current: WorkflowStep): WorkflowStep {
    const sequence: WorkflowStep[] = ['trial_init', 'kb_ingest', 'branding_config', 'widget_deploy', 'go_live'];
    const idx = sequence.indexOf(current);
    return idx > 0 ? sequence[idx - 1] : 'trial_init';
  }
  
  private async cleanupStep(step: WorkflowStep, tenantId: string): Promise<void> {
    // Clean up partial state from failed step
    switch (step) {
      case 'kb_ingest':
        await this.supabase.from('knowledge_base')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('processed_at', null); // Delete unprocessed documents
        break;
      case 'widget_deploy':
        await this.supabase.from('widget_configs')
          .delete()
          .eq('tenant_id', tenantId);
        break;
    }
  }
}

class WorkflowInterrupt extends Error {
  constructor(
    public workflowId: string,
    public interrupt_reason: string,
    public required_action: 'retry' | 'manual_review' | 'user_input' | 'admin_approval',
    public context_data: Record<string, any>
  ) {
    super(`Workflow interrupted: ${interrupt_reason}`);
  }
}
```

### Database Schema for Workflows

```sql
CREATE TABLE IF NOT EXISTS workflow_states (
  workflow_id UUID PRIMARY KEY,
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
CREATE INDEX idx_workflow_paused ON workflow_states(tenant_id) WHERE status = 'paused';

CREATE TABLE IF NOT EXISTS workflow_interrupts (
  interrupt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_states(workflow_id),
  interrupt_reason TEXT NOT NULL,
  required_action VARCHAR(50) NOT NULL,
  context_data JSONB DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interrupts_workflow ON workflow_interrupts(workflow_id);
CREATE INDEX idx_interrupts_unresolved ON workflow_interrupts(workflow_id) WHERE resolved_at IS NULL;
```

---

## 3. Event Audit Log Table

Track all actions for compliance, debugging, and analytics:

```sql
CREATE TABLE IF NOT EXISTS audit_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50), -- 'trial', 'kb', 'session', 'widget', 'workflow'
  entity_id UUID,
  
  -- Action details
  action VARCHAR(50), -- 'create', 'update', 'delete', 'access', 'failure'
  actor_type VARCHAR(20), -- 'system', 'admin', 'tenant', 'anonymous'
  actor_id VARCHAR(255),
  
  -- Change tracking
  old_values JSONB,
  new_values JSONB,
  changes_summary TEXT,
  
  -- Status
  result VARCHAR(20), -- 'success', 'failure', 'partial'
  error_message TEXT,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(255),
  
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_time ON audit_events(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_event_type ON audit_events(event_type, timestamp DESC);
CREATE INDEX idx_audit_failures ON audit_events(timestamp DESC) WHERE result = 'failure';
```

---

## 4. Implementation Priority & Timeline

### Phase 1 (Week 1-2): Core Usage Monitoring
- [ ] Add `tenant_usage_metrics` and `tenant_usage_realtime` tables
- [ ] Create usage tracking middleware for API routes
- [ ] Build usage aggregation batch job (hourly/daily)
- [ ] Add quota enforcement to chat/embedding routes
- [ ] Create admin usage dashboard API

### Phase 2 (Week 2-3): Workflow Engine
- [ ] Create `workflow_states` and `workflow_interrupts` tables
- [ ] Implement `TrialWorkflowEngine` class with pause/resume/rollback
- [ ] Integrate LangChain for KB quality assessment
- [ ] Add workflow monitoring endpoints
- [ ] Build workflow execution tests

### Phase 3 (Week 3-4): Audit & Analytics
- [ ] Add `audit_events` table
- [ ] Create audit middleware for all operations
- [ ] Build compliance reports
- [ ] Add analytics dashboards
- [ ] Implement event retention policies

### Phase 4 (Future): Advanced Features
- [ ] Real-time alerting for quota exceeding
- [ ] Auto-scaling recommendations based on usage patterns
- [ ] Predictive analytics for trial conversions
- [ ] Usage-based cost calculation
- [ ] Webhook notifications for workflow events

---

## 5. Key Benefits

| Benefit | Impact |
|---------|--------|
| **Usage Tracking** | Accurate billing, quota enforcement, abuse prevention |
| **Workflow Orchestration** | Reliable multi-step processes, error recovery, better UX |
| **Interrupts** | Manual oversight for edge cases, admin control |
| **Audit Trail** | Compliance, debugging, security investigations |
| **Monitoring** | Early warning for issues, performance insights |
| **Cost Control** | Per-tenant token limits, overage alerts |

---

## 6. Integration with Existing Code

### Updated API Route Pattern

```typescript
// src/app/api/widget/chat/route.ts (updated)

import { trackUsage } from '@/lib/trial/usage-tracker';
import { validateQuota } from '@/lib/trial/quota-enforcer';

export async function POST(req: NextRequest) {
  const { tenantId, message } = await req.json();
  
  // Track usage before processing
  const usageTracker = trackUsage(tenantId, 'chat_message');
  
  try {
    // Check quota
    const quotaOK = await validateQuota(tenantId, 'tokens', estimatedTokens);
    if (!quotaOK) {
      // Audit failure
      await auditEvent('quota_exceeded', tenantId, {
        message: 'Chat message rejected due to quota limit',
      });
      return NextResponse.json(
        { error: 'Quota exceeded' },
        { status: 429 }
      );
    }
    
    // Process chat...
    const response = await generateChatResponse(message);
    
    // Track success metrics
    usageTracker.recordSuccess({
      tokens_used: response.tokens,
      response_time_ms: Date.now() - start,
    });
    
    return NextResponse.json(response);
  } catch (error) {
    usageTracker.recordFailure(error);
    throw error;
  }
}
```

---

## Questions to Address

1. **What's your budget model?** Token-based, message-based, or fixed tier?
2. **How long should audit logs be retained?** (suggested: 2 years)
3. **Do you need real-time alerts?** (would require webhooks/pub-sub)
4. **Should workflows auto-retry on failure?** Or always require manual intervention?
5. **Any specific compliance requirements?** (GDPR, SOC2, etc.)

---

Let me know which components you'd like to implement first!
