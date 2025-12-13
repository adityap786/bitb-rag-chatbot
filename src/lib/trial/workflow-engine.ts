/**
 * Trial Workflow Engine
 * Phase 2: State machine for multi-step trial onboarding
 * 
 * Orchestrates trial setup with automatic step progression, pause/resume,
 * and intelligent error handling with LlamaIndex integration.
 */

import { SupabaseClient } from '@supabase/supabase-js';

import {
  WorkflowStep,
  WorkflowStatus,
  WorkflowState,
  WorkflowInterrupt,
  WorkflowHistoryEvent,
  StepContext,
  StepResult,
  WorkflowExecutionOptions,
  WorkflowEventType,
  ActorType,
  WORKFLOW_STEPS,
  KBQualityAssessment,
  BrandingConfig,
} from '../../types/workflow';
import TrialLogger from './logger';
import { NotFoundError, ValidationError } from './errors';
import { workflowLlamaIndexService } from './workflow-llm';

export class TrialWorkflowEngine {
  private db: SupabaseClient;
  private logger: typeof TrialLogger;

  constructor(db: SupabaseClient) {
    this.db = db;
    this.logger = TrialLogger.getInstance();
  }

  /**
   * Initialize a new workflow for a trial
   */
  async initWorkflow(
    tenantId: string,
    email: string,
    businessName: string,
    businessType: string,
    options: WorkflowExecutionOptions = {}
  ): Promise<WorkflowState> {
    try {
      // Create workflow record
      const { data, error } = await this.db
        .from('workflow_states')
        .insert({
          tenant_id: tenantId,
          current_step: 'trial_init',
          status: 'pending',
          progress_percent: 0,
          context_data: {
            email,
            business_name: businessName,
            business_type: businessType,
            ...options.context,
          },
          retry_count: 0,
          max_retries: options.max_retries || 3,
        })
        .select()
        .single();

      if (error) throw error;

      // Log workflow creation
      await this.logEvent(
        data.workflow_id,
        'workflow_created',
        'system',
        undefined,
        { business_type: businessType }
      );

      this.logger.info(`Workflow initialized for tenant ${tenantId}`, {
        workflow_id: data.workflow_id,
        business_type: businessType,
      });

      // Auto-execute first step if configured
      if (options.auto_advance !== false) {
        await this.executeStep(data.workflow_id, 'trial_init', options);
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to initialize workflow', {
        tenant_id: tenantId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Execute a workflow step with error handling and auto-advancement
   */
  async executeStep(
    workflowId: string,
    step: WorkflowStep,
    options: WorkflowExecutionOptions = {}
  ): Promise<StepResult> {
    try {
      // Get workflow state
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      // Validate step transition
      if (!this.canExecuteStep(workflow, step)) {
        throw new ValidationError(
          `Cannot execute step ${step} in current workflow state`
        );
      }

      // Create step context
      const context: StepContext = {
        workflow_id: workflowId,
        tenant_id: workflow.tenant_id,
        current_step: step,
        context_data: workflow.context_data,
      };

      // Log step start
      await this.logEvent(workflowId, 'step_started', 'system', undefined, {
        step,
      });

      // Update workflow status
      await this.updateWorkflow(workflowId, {
        current_step: step,
        status: 'in_progress',
      });

      // Execute appropriate step handler
      let result: StepResult;
      switch (step) {
        case 'trial_init':
          result = await this.executeTrialInit(context);
          break;
        case 'kb_ingest':
          result = await this.executeKBIngest(context, options);
          break;
        case 'branding_config':
          result = await this.executeBrandingConfig(context);
          break;
        case 'widget_deploy':
          result = await this.executeWidgetDeploy(context);
          break;
        case 'go_live':
          result = await this.executeGoLive(context);
          break;
        default:
          throw new ValidationError(`Unknown step: ${step}`);
      }

      if (result.success) {
        // Mark step as completed
        await this.markStepCompleted(workflowId, step);

        // Auto-advance to next step if configured
        if (options.auto_advance !== false && result.next_step) {
          const nextIndex = WORKFLOW_STEPS.indexOf(result.next_step);
          if (nextIndex < WORKFLOW_STEPS.length) {
            // Recursively execute next step
            return this.executeStep(workflowId, result.next_step, options);
          }
        }
      } else if (result.interrupt) {
        // Handle interrupt
        await this.createInterrupt(result.interrupt);

        if (options.pause_on_interrupt !== false) {
          await this.pauseWorkflow(
            workflowId,
            result.interrupt.interrupt_reason,
            'system'
          );
        }
      } else {
        // Step failed
        await this.markStepFailed(workflowId, step, result.error);

        // Auto-retry if configured
        if (
          options.retry_on_failure !== false &&
          result.should_retry &&
          workflow.retry_count < workflow.max_retries
        ) {
          await this.incrementRetryCount(workflowId);
          await this.logEvent(workflowId, 'step_retried', 'system', undefined, {
            step,
            retry_count: workflow.retry_count + 1,
          });
          // Retry the step
          return this.executeStep(workflowId, step, options);
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Error executing step ${step}`, {
        workflow_id: workflowId,
        error: String(error),
      });

      // Mark workflow as failed
      await this.updateWorkflow(workflowId, {
        status: 'failed',
        error: String(error),
      });

      throw error;
    }
  }

  /**
   * Step Handler: Trial Initialization
   */
  private async executeTrialInit(context: StepContext): Promise<StepResult> {
    try {
      const { tenant_id, workflow_id } = context;

      // Ensure tenant exists in canonical tenants table
      const { data: tenant, error } = await this.db
        .from('tenants')
        .select('tenant_id')
        .eq('tenant_id', tenant_id)
        .single();

      if (error || !tenant) throw new NotFoundError('Tenant not found');

      // Generate setup token for next step
      const setupToken = this.generateSetupToken(tenant_id);

      // Store setup token in context
      await this.updateContext(workflow_id, {
        setup_token: setupToken,
      });

      return {
        success: true,
        step: 'trial_init',
        data: { setup_token: setupToken },
        next_step: 'kb_ingest',
      };
    } catch (error) {
      return {
        success: false,
        step: 'trial_init',
        error: String(error),
        should_retry: true,
      };
    }
  }

  /**
   * Step Handler: KB Ingestion with Quality Assessment
   */
  private async executeKBIngest(
    context: StepContext,
    options: WorkflowExecutionOptions = {}
  ): Promise<StepResult> {
    try {
      const { tenant_id, workflow_id, context_data } = context;

      // Get KB documents (from context or database)
      const kbDocuments = (context_data as any).kb_documents || [];
      if (kbDocuments.length === 0) {
        return {
          success: false,
          step: 'kb_ingest',
          interrupt: {
            interrupt_id: '',
            workflow_id,
            interrupt_type: 'user_input',
            interrupt_reason: 'No KB documents provided',
            required_action: 'user_input',
            context_data: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      }

      // Assess KB quality using LlamaIndex
      const qualityAssessment = await workflowLlamaIndexService.assessKBQuality(
        kbDocuments.map((doc: any, idx: number) => ({
          id: doc.id || String(idx),
          content: doc.text || doc.raw_text || '',
          metadata: doc.metadata || {},
        })),
        tenant_id
      );

      const qualityThreshold = options.quality_threshold || 0.5;

      // Check quality score
      if (qualityAssessment.quality_score < 0.3) {
        // Auto-reject poor quality KB
        return {
          success: false,
          step: 'kb_ingest',
          error: 'KB quality too low',
          interrupt: {
            interrupt_id: '',
            workflow_id,
            interrupt_type: 'quality_gate',
            interrupt_reason: `KB quality score ${qualityAssessment.quality_score} is below minimum (0.3)`,
            required_action: 'user_input',
            context_data: qualityAssessment as any,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      }

      if (
        qualityAssessment.quality_score >= 0.3 &&
        qualityAssessment.quality_score < qualityThreshold
      ) {
        // Borderline quality - require manual review
        return {
          success: false,
          step: 'kb_ingest',
          interrupt: {
            interrupt_id: '',
            workflow_id,
            interrupt_type: 'manual_review',
            interrupt_reason: `KB quality ${qualityAssessment.quality_score} requires manual review`,
            required_action: 'manual_review',
            context_data: qualityAssessment as any,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };
      }

      // Store KB quality assessment
      await this.updateContext(workflow_id, {
        kb_quality_assessment: qualityAssessment,
        kb_document_count: kbDocuments.length,
      });

      return {
        success: true,
        step: 'kb_ingest',
        data: qualityAssessment as any,
        next_step: 'branding_config',
      };
    } catch (error) {
      return {
        success: false,
        step: 'kb_ingest',
        error: String(error),
        should_retry: true,
      };
    }
  }

  /**
   * Step Handler: Branding Configuration
   */
  private async executeBrandingConfig(context: StepContext): Promise<StepResult> {
    try {
      const { tenant_id, workflow_id, context_data } = context;

      // Auto-assign tools based on KB
      const assignedTools = await this.assignToolsAutomatically(
        tenant_id,
        context_data
      );

      // Generate branding config
      const brandingConfig: BrandingConfig = {
        primary_color: (context_data as any).primary_color || '#0066cc',
        secondary_color: (context_data as any).secondary_color || '#00cc66',
        tone: ((context_data as any).tone as BrandingConfig['tone']) || 'professional',
        business_type: (context_data as any).business_type || 'general',
        assigned_tools: assignedTools,
        customizations: (context_data as any).customizations || {},
      };

      // Store branding config
      await this.updateContext(workflow_id, {
        branding_config: brandingConfig,
      });

      return {
        success: true,
        step: 'branding_config',
        data: brandingConfig as any,
        next_step: 'widget_deploy',
      };
    } catch (error) {
      return {
        success: false,
        step: 'branding_config',
        error: String(error),
        should_retry: true,
      };
    }
  }

  /**
   * Step Handler: Widget Deployment
   */
  private async executeWidgetDeploy(context: StepContext): Promise<StepResult> {
    try {
      const { tenant_id, workflow_id, context_data } = context;

      // Generate widget code with SRI integrity
      const widgetCode = this.generateWidgetCode(
        tenant_id,
        (context_data as any).branding_config
      );

      // Calculate SRI integrity hash
      const sriHash = this.calculateSRIHash(widgetCode);

      // Store widget configuration
      const widgetConfig = {
        widget_id: `widget_${tenant_id}`,
        code: widgetCode,
        sri_hash: sriHash,
        deployed_at: new Date().toISOString(),
      };

      await this.updateContext(workflow_id, {
        widget_config: widgetConfig,
      });

      return {
        success: true,
        step: 'widget_deploy',
        data: widgetConfig as any,
        next_step: 'go_live',
      };
    } catch (error) {
      return {
        success: false,
        step: 'widget_deploy',
        error: String(error),
        should_retry: true,
      };
    }
  }

  /**
   * Step Handler: Go Live
   */
  private async executeGoLive(context: StepContext): Promise<StepResult> {
    try {
      const { tenant_id, workflow_id } = context;

      // Mark trial as ready/active
      const { error } = await this.db
        .from('tenants')
        .update({
          status: 'ready',
        })
        .eq('tenant_id', tenant_id);

      if (error) throw error;

      // Mark workflow as completed
      const now = new Date();
      const workflow = await this.getWorkflow(workflow_id);
      const durationMs = now.getTime() - new Date(workflow!.created_at).getTime();

      await this.updateWorkflow(workflow_id, {
        status: 'completed',
        completed_at: now.toISOString(),
        duration_ms: durationMs,
        progress_percent: 100,
      });

      // Log completion
      await this.logEvent(workflow_id, 'workflow_completed', 'system', undefined, {
        duration_ms: durationMs,
      });

      return {
        success: true,
        step: 'go_live',
        data: { tenant_id, status: 'active' },
      };
    } catch (error) {
      return {
        success: false,
        step: 'go_live',
        error: String(error),
        should_retry: true,
      };
    }
  }

  /**
   * Pause workflow for manual intervention
   */
  async pauseWorkflow(
    workflowId: string,
    reason: string,
    actorId: string,
    actorType: ActorType = 'system'
  ): Promise<void> {
    try {
      const now = new Date().toISOString();

      await this.updateWorkflow(workflowId, {
        status: 'paused',
        paused_reason: reason,
        paused_at: now,
        paused_by_user_id: actorId,
      });

      await this.logEvent(workflowId, 'workflow_paused', actorType, actorId, {
        reason,
      });

      this.logger.info(`Workflow ${workflowId} paused: ${reason}`, {
        workflow_id: workflowId,
      });
    } catch (error) {
      this.logger.error('Failed to pause workflow', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(
    workflowId: string,
    actorId: string,
    actorType: ActorType = 'admin',
    options: WorkflowExecutionOptions = {}
  ): Promise<StepResult> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      if (workflow.status !== 'paused') {
        throw new ValidationError('Workflow is not paused');
      }

      // Resume execution
      await this.updateWorkflow(workflowId, {
        status: 'in_progress',
        paused_reason: undefined,
        paused_at: undefined,
      });

      await this.logEvent(workflowId, 'workflow_resumed', actorType, actorId);

      // Continue from current step
      return this.executeStep(workflowId, workflow.current_step, options);
    } catch (error) {
      this.logger.error('Failed to resume workflow', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Rollback workflow to a previous step
   */
  async rollbackWorkflow(
    workflowId: string,
    targetStep?: WorkflowStep,
    actorId?: string,
    actorType: ActorType = 'admin'
  ): Promise<void> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      const rollbackTo = targetStep || this.getPreviousStep(workflow.current_step);
      if (!rollbackTo) {
        throw new ValidationError('Cannot rollback from first step');
      }

      // Remove current step from completed
      const updatedStepsCompleted = workflow.steps_completed.filter(
        (s) => WORKFLOW_STEPS.indexOf(s) < WORKFLOW_STEPS.indexOf(rollbackTo)
      );

      // Remove failed steps that are after rollback point
      const updatedStepsFailed = workflow.steps_failed.filter(
        (s) => WORKFLOW_STEPS.indexOf(s) < WORKFLOW_STEPS.indexOf(rollbackTo)
      );

      // Cleanup context data related to rolled-back steps
      const cleanedContext = this.cleanupContextForRollback(
        workflow.context_data,
        rollbackTo
      );

      // Update workflow
      await this.updateWorkflow(workflowId, {
        current_step: rollbackTo,
        status: 'rolled_back',
        steps_completed: updatedStepsCompleted,
        steps_failed: updatedStepsFailed,
        context_data: cleanedContext,
      });

      await this.logEvent(
        workflowId,
        'workflow_rolled_back',
        actorType,
        actorId,
        { target_step: rollbackTo }
      );

      this.logger.info(`Workflow ${workflowId} rolled back to ${rollbackTo}`, {
        workflow_id: workflowId,
        target_step: rollbackTo,
      });
    } catch (error) {
      this.logger.error('Failed to rollback workflow', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Get workflow state
   */
  async getWorkflow(workflowId: string): Promise<WorkflowState | null> {
    try {
      const { data, error } = await this.db
        .from('workflow_states')
        .select('*')
        .eq('workflow_id', workflowId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      this.logger.error('Failed to get workflow', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Get workflow interrupts
   */
  async getInterrupts(workflowId: string): Promise<WorkflowInterrupt[]> {
    try {
      const { data, error } = await this.db
        .from('workflow_interrupts')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logger.error('Failed to get interrupts', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Get unresolved interrupts
   */
  async getUnresolvedInterrupts(workflowId: string): Promise<WorkflowInterrupt[]> {
    try {
      const { data, error } = await this.db
        .from('workflow_interrupts')
        .select('*')
        .eq('workflow_id', workflowId)
        .is('resolved_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logger.error('Failed to get unresolved interrupts', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Resolve an interrupt
   */
  async resolveInterrupt(
    interruptId: string,
    resolution: 'approved' | 'rejected' | 'retry',
    resolutionNotes?: string,
    adminId?: string
  ): Promise<WorkflowInterrupt> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await this.db
        .from('workflow_interrupts')
        .update({
          resolved_at: now,
          resolution_action: resolution,
          resolution_notes: resolutionNotes,
          resolved_by_user_id: adminId,
        })
        .eq('interrupt_id', interruptId)
        .select()
        .single();

      if (error) throw error;

      // Log interrupt resolution
      if (data) {
        await this.logEvent(
          data.workflow_id,
          'interrupt_resolved',
          'admin',
          adminId,
          { interrupt_id: interruptId, resolution }
        );
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to resolve interrupt', {
        interrupt_id: interruptId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private async createInterrupt(interrupt: Partial<WorkflowInterrupt>): Promise<void> {
    try {
      const { error } = await this.db.from('workflow_interrupts').insert({
        ...interrupt,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);

      if (error) throw error;
    } catch (error) {
      this.logger.error('Failed to create interrupt', { error: String(error) });
      throw error;
    }
  }

  private async updateWorkflow(
    workflowId: string,
    updates: Partial<WorkflowState>
  ): Promise<void> {
    try {
      const { error } = await this.db
        .from('workflow_states')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('workflow_id', workflowId);

      if (error) throw error;
    } catch (error) {
      this.logger.error('Failed to update workflow', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  private async updateContext(
    workflowId: string,
    newContext: Record<string, unknown>
  ): Promise<void> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) return;

      const mergedContext = {
        ...workflow.context_data,
        ...newContext,
      };

      await this.updateWorkflow(workflowId, {
        context_data: mergedContext,
      });
    } catch (error) {
      this.logger.error('Failed to update context', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  private async markStepCompleted(
    workflowId: string,
    step: WorkflowStep
  ): Promise<void> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) return;

      const stepsCompleted = [...new Set([...workflow.steps_completed, step])];
      const progressPercent = Math.round((stepsCompleted.length / WORKFLOW_STEPS.length) * 100);

      await this.updateWorkflow(workflowId, {
        steps_completed: stepsCompleted,
        progress_percent: progressPercent,
      });

      await this.logEvent(workflowId, 'step_completed', 'system', undefined, {
        step,
        progress_percent: progressPercent,
      });
    } catch (error) {
      this.logger.error('Failed to mark step completed', {
        workflow_id: workflowId,
        error: String(error),
      });
    }
  }

  private async markStepFailed(
    workflowId: string,
    step: WorkflowStep,
    error?: string
  ): Promise<void> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) return;

      const stepsFailed = [...new Set([...workflow.steps_failed, step])];

      await this.updateWorkflow(workflowId, {
        steps_failed: stepsFailed,
        status: 'failed',
        error,
      });

      await this.logEvent(workflowId, 'step_failed', 'system', undefined, {
        step,
        error,
      });
    } catch (error) {
      this.logger.error('Failed to mark step failed', {
        workflow_id: workflowId,
        error: String(error),
      });
    }
  }

  private async incrementRetryCount(workflowId: string): Promise<void> {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) return;

      await this.updateWorkflow(workflowId, {
        retry_count: workflow.retry_count + 1,
        last_retry_at: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to increment retry count', {
        workflow_id: workflowId,
        error: String(error),
      });
    }
  }

  private async logEvent(
    workflowId: string,
    eventType: WorkflowEventType,
    actorType: ActorType,
    actorId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    try {
      const { error } = await this.db.from('workflow_history').insert({
        workflow_id: workflowId,
        event_type: eventType,
        actor_type: actorType,
        actor_id: actorId,
        details: details || {},
        timestamp: new Date().toISOString(),
      });

      if (error) throw error;
    } catch (error) {
      this.logger.error('Failed to log event', {
        workflow_id: workflowId,
        event_type: eventType,
        error: String(error),
      });
    }
  }

  private canExecuteStep(workflow: WorkflowState, step: WorkflowStep): boolean {
    const currentIndex = WORKFLOW_STEPS.indexOf(workflow.current_step);
    const targetIndex = WORKFLOW_STEPS.indexOf(step);
    return targetIndex >= currentIndex;
  }

  private getPreviousStep(step: WorkflowStep): WorkflowStep | undefined {
    const index = WORKFLOW_STEPS.indexOf(step);
    return index > 0 ? WORKFLOW_STEPS[index - 1] : undefined;
  }

  private getNextStep(step: WorkflowStep): WorkflowStep | undefined {
    const index = WORKFLOW_STEPS.indexOf(step);
    return index < WORKFLOW_STEPS.length - 1 ? WORKFLOW_STEPS[index + 1] : undefined;
  }

  private generateSetupToken(tenantId: string): string {
    // Generate JWT token for setup phase
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(
      JSON.stringify({
        tenant_id: tenantId,
        purpose: 'setup',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
      })
    ).toString('base64');
    return `${header}.${payload}.signature`;
  }

  // KB quality assessment and tool assignment handled by workflow-llm.ts (LlamaIndex only).

  private async assignToolsAutomatically(
    tenantId: string,
    contextData: Record<string, unknown>
  ): Promise<string[]> {
    // Tool assignment is LlamaIndex-only. Return default tools for now.
    return ['web_search', 'code_generator', 'data_analyzer'];
  }

  private generateWidgetCode(
    tenantId: string,
    brandingConfig?: BrandingConfig
  ): string {
    // Generate basic widget code
    return `
(function() {
  const config = {
    tenantId: '${tenantId}',
    primaryColor: '${brandingConfig?.primary_color || '#0066cc'}',
    secondaryColor: '${brandingConfig?.secondary_color || '#00cc66'}',
    tone: '${brandingConfig?.tone || 'professional'}',
  };
  // Widget initialization code
})();
    `.trim();
  }

  private calculateSRIHash(code: string): string {
    // Calculate SRI (Subresource Integrity) hash
    // SRI hash for code integrity (not embedding-related)
    return 'sha384-' + Buffer.from(code).toString('base64').substring(0, 48);
  }

  private cleanupContextForRollback(
    context: Record<string, unknown>,
    rollbackTo: WorkflowStep
  ): Record<string, unknown> {
    const rollbackIndex = WORKFLOW_STEPS.indexOf(rollbackTo);
    const cleaned = { ...context };

    // Remove context data from steps after rollback point
    if (rollbackIndex <= WORKFLOW_STEPS.indexOf('kb_ingest')) {
      delete cleaned.kb_documents;
      delete cleaned.kb_quality_assessment;
    }
    if (rollbackIndex <= WORKFLOW_STEPS.indexOf('branding_config')) {
      delete cleaned.branding_config;
    }
    if (rollbackIndex <= WORKFLOW_STEPS.indexOf('widget_deploy')) {
      delete cleaned.widget_config;
    }

    return cleaned;
  }
}
