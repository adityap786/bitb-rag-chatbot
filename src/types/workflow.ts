/**
 * Workflow Engine Types
 * Phase 2: Multi-step trial onboarding with state machine
 */

// ===========================
// Step Definitions
// ===========================

export type WorkflowStep =
  | 'trial_init'
  | 'kb_ingest'
  | 'branding_config'
  | 'widget_deploy'
  | 'go_live';

export const WORKFLOW_STEPS: WorkflowStep[] = [
  'trial_init',
  'kb_ingest',
  'branding_config',
  'widget_deploy',
  'go_live',
];

export const STEP_DESCRIPTIONS: Record<WorkflowStep, string> = {
  trial_init: 'Initialize trial tenant',
  kb_ingest: 'Ingest and process knowledge base',
  branding_config: 'Configure branding and tools',
  widget_deploy: 'Deploy widget code',
  go_live: 'Mark trial as ready',
};

// ===========================
// Status Types
// ===========================

export type WorkflowStatus =
  | 'pending'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'rolled_back';

// ===========================
// Interrupt Types
// ===========================

export type InterruptType =
  | 'quality_gate'
  | 'manual_review'
  | 'user_input'
  | 'system_error'
  | 'validation_failure'
  | 'timeout'
  | 'admin_override';

export type RequiredAction =
  | 'retry'
  | 'manual_review'
  | 'user_input'
  | 'admin_approval'
  | 'skip_step'
  | 'rollback';

export interface WorkflowInterrupt {
  interrupt_id: string;
  workflow_id: string;
  interrupt_type: InterruptType;
  interrupt_reason: string;
  required_action: RequiredAction;
  context_data: Record<string, unknown>;
  affected_step?: WorkflowStep;
  resolved_at?: string;
  resolution_action?: string;
  resolved_by_user_id?: string;
  resolution_notes?: string;
  escalated_at?: string;
  escalation_reason?: string;
  created_at: string;
  updated_at: string;
}

// ===========================
// Workflow State
// ===========================

export interface WorkflowState {
  workflow_id: string;
  tenant_id: string;
  current_step: WorkflowStep;
  status: WorkflowStatus;
  steps_completed: WorkflowStep[];
  steps_failed: WorkflowStep[];
  steps_skipped: WorkflowStep[];
  progress_percent: number;
  error?: string;
  error_code?: string;
  error_context?: Record<string, unknown>;
  paused_reason?: string;
  paused_at?: string;
  paused_by_user_id?: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  retry_count: number;
  max_retries: number;
  last_retry_at?: string;
  context_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ===========================
// Workflow History Event
// ===========================

export type WorkflowEventType =
  | 'workflow_created'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_retried'
  | 'workflow_paused'
  | 'workflow_resumed'
  | 'workflow_rolled_back'
  | 'interrupt_created'
  | 'interrupt_resolved'
  | 'interrupt_escalated'
  | 'workflow_completed'
  | 'workflow_failed';

export type ActorType = 'system' | 'user' | 'admin' | 'workflow';

export interface WorkflowHistoryEvent {
  history_id: string;
  workflow_id: string;
  event_type: WorkflowEventType;
  previous_status?: WorkflowStatus;
  new_status?: WorkflowStatus;
  previous_step?: WorkflowStep;
  new_step?: WorkflowStep;
  details?: Record<string, unknown>;
  error?: string;
  actor_type: ActorType;
  actor_id?: string;
  timestamp: string;
}

// ===========================
// Step Execution Context
// ===========================

export interface StepContext {
  workflow_id: string;
  tenant_id: string;
  current_step: WorkflowStep;
  previous_step?: WorkflowStep;
  context_data: Record<string, unknown>;
}

export interface StepResult {
  success: boolean;
  step: WorkflowStep;
  data?: Record<string, unknown>;
  error?: string;
  error_code?: string;
  interrupt?: WorkflowInterrupt;
  should_retry?: boolean;
  next_step?: WorkflowStep;
}

// ===========================
// KB Quality Assessment
// ===========================

export interface KBQualityAssessment {
  quality_score: number; // 0-1.0
  quality_issues: string[];
  confidence: number; // 0-1.0
  recommendation: 'approve' | 'manual_review' | 'reject';
  document_count: number;
  total_tokens: number;
  coverage_score: number; // 0-1.0
  semantic_coherence: number; // 0-1.0
  details: Record<string, unknown>;
}

// ===========================
// Branding Config
// ===========================

export interface BrandingConfig {
  primary_color: string;
  secondary_color: string;
  tone: 'professional' | 'friendly' | 'casual';
  business_type: string;
  assigned_tools: string[];
  customizations: Record<string, unknown>;
}

// ===========================
// Workflow Execution Options
// ===========================

export interface WorkflowExecutionOptions {
  auto_advance?: boolean;
  retry_on_failure?: boolean;
  max_retries?: number;
  pause_on_interrupt?: boolean;
  quality_threshold?: number; // 0-1.0
  timeout_ms?: number;
  context?: Record<string, unknown>;
}

// ===========================
// Admin Actions
// ===========================

export interface WorkflowAdminAction {
  workflow_id: string;
  action: 'resume' | 'retry' | 'rollback' | 'approve' | 'cancel' | 'skip';
  target_step?: WorkflowStep;
  reason?: string;
  admin_id: string;
}

// ===========================
// Dashboard View Models
// ===========================

export interface WorkflowDashboardView {
  workflow_id: string;
  tenant_id: string;
  tenant_email: string;
  status: WorkflowStatus;
  current_step: WorkflowStep;
  progress_percent: number;
  steps_completed: WorkflowStep[];
  steps_pending: WorkflowStep[];
  steps_failed: WorkflowStep[];
  pause_reason?: string;
  paused_since?: string;
  interrupts: WorkflowInterrupt[];
  timeline: WorkflowTimelineEntry[];
  estimated_completion_time?: number; // ms
}

export interface WorkflowTimelineEntry {
  step: WorkflowStep;
  status: WorkflowStatus;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  error?: string;
}

// ===========================
// API Request/Response Types
// ===========================

export interface InitWorkflowRequest {
  tenant_id: string;
  email: string;
  business_name: string;
  business_type: string;
  options?: WorkflowExecutionOptions;
}

export interface InitWorkflowResponse {
  workflow_id: string;
  tenant_id: string;
  status: WorkflowStatus;
  current_step: WorkflowStep;
  message: string;
}

export interface GetWorkflowResponse {
  workflow: WorkflowState;
  interrupts: WorkflowInterrupt[];
  history: WorkflowHistoryEvent[];
}

export interface AdminActionRequest {
  action: WorkflowAdminAction['action'];
  target_step?: WorkflowStep;
  reason?: string;
}

export interface AdminActionResponse {
  success: boolean;
  workflow_id: string;
  new_status: WorkflowStatus;
  current_step: WorkflowStep;
  message: string;
}
