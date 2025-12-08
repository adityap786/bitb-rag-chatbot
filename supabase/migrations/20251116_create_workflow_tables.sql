-- Phase 2: Workflow Engine Tables
-- Created: 2025-11-16
-- Purpose: State machine for multi-step trial onboarding with pause/resume/rollback

-- ===========================
-- 1. Workflow States Table
-- ===========================
CREATE TABLE IF NOT EXISTS workflow_states (
  workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Current execution state
  current_step VARCHAR(50) NOT NULL CHECK (current_step IN (
    'trial_init',
    'kb_ingest',
    'branding_config',
    'widget_deploy',
    'go_live'
  )),
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'paused',
    'completed',
    'failed',
    'rolled_back'
  )),
  
  -- Step tracking
  steps_completed TEXT[] DEFAULT ARRAY[]::TEXT[],
  steps_failed TEXT[] DEFAULT ARRAY[]::TEXT[],
  steps_skipped TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Progress
  progress_percent INT DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  
  -- Error details
  error TEXT,
  error_code VARCHAR(50),
  error_context JSONB DEFAULT '{}'::jsonb,
  
  -- Pause/resume state
  paused_reason TEXT,
  paused_at TIMESTAMPTZ,
  paused_by_user_id UUID,
  
  -- Workflow metadata
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  
  -- Retry tracking
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  
  -- Workflow context (preserves state across steps)
  context_data JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_workflow_tenant FOREIGN KEY (tenant_id)
    REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE
);

-- Indexes for workflow queries
CREATE INDEX idx_workflow_tenant ON workflow_states(tenant_id);
CREATE INDEX idx_workflow_status ON workflow_states(status);
CREATE INDEX idx_workflow_tenant_status ON workflow_states(tenant_id, status);
CREATE INDEX idx_workflow_created ON workflow_states(created_at DESC);
CREATE INDEX idx_workflow_current_step ON workflow_states(current_step);

-- ===========================
-- 2. Workflow Interrupts Table
-- ===========================
CREATE TABLE IF NOT EXISTS workflow_interrupts (
  interrupt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL,
  
  -- Interrupt classification
  interrupt_type VARCHAR(50) NOT NULL CHECK (interrupt_type IN (
    'quality_gate',
    'manual_review',
    'user_input',
    'system_error',
    'validation_failure',
    'timeout',
    'admin_override'
  )),
  
  interrupt_reason TEXT NOT NULL,
  required_action VARCHAR(50) NOT NULL CHECK (required_action IN (
    'retry',
    'manual_review',
    'user_input',
    'admin_approval',
    'skip_step',
    'rollback'
  )),
  
  -- Context for the interrupt
  context_data JSONB DEFAULT '{}'::jsonb,
  affected_step VARCHAR(50),
  
  -- Resolution tracking
  resolved_at TIMESTAMPTZ,
  resolution_action VARCHAR(50),
  resolved_by_user_id UUID,
  resolution_notes TEXT,
  
  -- Escalation
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_interrupt_workflow FOREIGN KEY (workflow_id)
    REFERENCES workflow_states(workflow_id) ON DELETE CASCADE
);

-- Indexes for interrupt queries
CREATE INDEX idx_interrupt_workflow ON workflow_interrupts(workflow_id);
CREATE INDEX idx_interrupt_unresolved ON workflow_interrupts(workflow_id) 
  WHERE resolved_at IS NULL;
CREATE INDEX idx_interrupt_type ON workflow_interrupts(interrupt_type);
CREATE INDEX idx_interrupt_created ON workflow_interrupts(created_at DESC);

-- ===========================
-- 3. Workflow History Table (Audit Trail)
-- ===========================
CREATE TABLE IF NOT EXISTS workflow_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL,
  
  -- Event tracking
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'workflow_created',
    'step_started',
    'step_completed',
    'step_failed',
    'step_retried',
    'workflow_paused',
    'workflow_resumed',
    'workflow_rolled_back',
    'interrupt_created',
    'interrupt_resolved',
    'interrupt_escalated',
    'workflow_completed',
    'workflow_failed'
  )),
  
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  previous_step VARCHAR(50),
  new_step VARCHAR(50),
  
  -- Event details
  details JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  
  -- Actor information
  actor_type VARCHAR(20) CHECK (actor_type IN ('system', 'user', 'admin', 'workflow')),
  actor_id UUID,
  
  -- Timestamps
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_history_workflow FOREIGN KEY (workflow_id)
    REFERENCES workflow_states(workflow_id) ON DELETE CASCADE
);

-- Indexes for history queries
CREATE INDEX idx_history_workflow ON workflow_history(workflow_id);
CREATE INDEX idx_history_event_type ON workflow_history(event_type);
CREATE INDEX idx_history_timestamp ON workflow_history(timestamp DESC);

-- ===========================
-- 4. Helper Functions
-- ===========================

-- Function to calculate workflow progress
CREATE OR REPLACE FUNCTION calculate_workflow_progress(
  p_workflow_id UUID
) RETURNS INT AS $$
DECLARE
  v_completed INT;
  v_total INT := 5; -- Total steps in workflow
BEGIN
  SELECT ARRAY_LENGTH(steps_completed, 1) INTO v_completed
  FROM workflow_states
  WHERE workflow_id = p_workflow_id;
  
  RETURN COALESCE(ROUND((COALESCE(v_completed, 0)::NUMERIC / v_total) * 100), 0)::INT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to mark step as completed
CREATE OR REPLACE FUNCTION mark_step_completed(
  p_workflow_id UUID,
  p_step VARCHAR(50)
) RETURNS void AS $$
BEGIN
  UPDATE workflow_states
  SET 
    steps_completed = array_append(steps_completed, p_step),
    progress_percent = calculate_workflow_progress(p_workflow_id),
    updated_at = NOW()
  WHERE workflow_id = p_workflow_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark step as failed
CREATE OR REPLACE FUNCTION mark_step_failed(
  p_workflow_id UUID,
  p_step VARCHAR(50),
  p_error TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE workflow_states
  SET 
    steps_failed = array_append(steps_failed, p_step),
    status = 'failed',
    error = COALESCE(p_error, 'Step execution failed'),
    updated_at = NOW()
  WHERE workflow_id = p_workflow_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get unresolved interrupts for a workflow
CREATE OR REPLACE FUNCTION get_unresolved_interrupts(
  p_workflow_id UUID
) RETURNS TABLE(
  interrupt_id UUID,
  interrupt_type VARCHAR,
  interrupt_reason TEXT,
  required_action VARCHAR,
  context_data JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wi.interrupt_id,
    wi.interrupt_type,
    wi.interrupt_reason,
    wi.required_action,
    wi.context_data,
    wi.created_at
  FROM workflow_interrupts wi
  WHERE wi.workflow_id = p_workflow_id
    AND wi.resolved_at IS NULL
  ORDER BY wi.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to create workflow history entry
CREATE OR REPLACE FUNCTION log_workflow_event(
  p_workflow_id UUID,
  p_event_type VARCHAR(50),
  p_actor_type VARCHAR(20),
  p_actor_id UUID,
  p_details JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_previous_status VARCHAR(20);
  v_new_status VARCHAR(20);
  v_previous_step VARCHAR(50);
  v_new_step VARCHAR(50);
  v_history_id UUID;
BEGIN
  -- Get current workflow state
  SELECT status, current_step INTO v_new_status, v_new_step
  FROM workflow_states
  WHERE workflow_id = p_workflow_id;
  
  -- Insert history entry
  INSERT INTO workflow_history (
    workflow_id,
    event_type,
    previous_status,
    new_status,
    previous_step,
    new_step,
    details,
    actor_type,
    actor_id
  ) VALUES (
    p_workflow_id,
    p_event_type,
    v_previous_status,
    v_new_status,
    v_previous_step,
    v_new_step,
    p_details,
    p_actor_type,
    p_actor_id
  )
  RETURNING history_id INTO v_history_id;
  
  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================
-- 5. Triggers for Timestamps
-- ===========================

-- Auto-update workflow_states updated_at
CREATE OR REPLACE FUNCTION update_workflow_states_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workflow_states_updated_at ON workflow_states;
CREATE TRIGGER trigger_workflow_states_updated_at
BEFORE UPDATE ON workflow_states
FOR EACH ROW
EXECUTE FUNCTION update_workflow_states_timestamp();

-- Auto-update workflow_interrupts updated_at
CREATE OR REPLACE FUNCTION update_workflow_interrupts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workflow_interrupts_updated_at ON workflow_interrupts;
CREATE TRIGGER trigger_workflow_interrupts_updated_at
BEFORE UPDATE ON workflow_interrupts
FOR EACH ROW
EXECUTE FUNCTION update_workflow_interrupts_timestamp();
