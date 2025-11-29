/**
 * Workflow Interrupt Management
 * Phase 2: Handle manual review points and interrupts
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  WorkflowInterrupt,
  InterruptType,
  RequiredAction,
  WorkflowStep,
} from '../../types/workflow';
import TrialLogger from './logger';

export class WorkflowInterruptManager {
  private db: SupabaseClient;
  private logger: typeof TrialLogger;

  constructor(db: SupabaseClient) {
    this.db = db;
    this.logger = TrialLogger.getInstance();
  }

  /**
   * Create a new interrupt
   */
  async createInterrupt(
    workflowId: string,
    interruptType: InterruptType,
    reason: string,
    requiredAction: RequiredAction,
    contextData: Record<string, unknown> = {},
    affectedStep?: WorkflowStep
  ): Promise<WorkflowInterrupt> {
    try {
      const { data, error } = await this.db
        .from('workflow_interrupts')
        .insert({
          workflow_id: workflowId,
          interrupt_type: interruptType,
          interrupt_reason: reason,
          required_action: requiredAction,
          context_data: contextData,
          affected_step: affectedStep,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      this.logger.info(`Interrupt created: ${interruptType}`, {
        workflow_id: workflowId,
        interrupt_type: interruptType,
        reason,
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to create interrupt', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Resolve an interrupt with decision
   */
  async resolveInterrupt(
    interruptId: string,
    resolution: 'approved' | 'rejected' | 'retry',
    adminId: string,
    resolutionNotes?: string
  ): Promise<WorkflowInterrupt> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await this.db
        .from('workflow_interrupts')
        .update({
          resolved_at: now,
          resolution_action: resolution,
          resolved_by_user_id: adminId,
          resolution_notes: resolutionNotes,
          updated_at: now,
        })
        .eq('interrupt_id', interruptId)
        .select()
        .single();

      if (error) throw error;

      this.logger.info(`Interrupt resolved: ${resolution}`, {
        interrupt_id: interruptId,
        resolution,
        admin_id: adminId,
      });

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
   * Escalate an interrupt for urgent attention
   */
  async escalateInterrupt(
    interruptId: string,
    reason: string,
    adminId: string
  ): Promise<WorkflowInterrupt> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await this.db
        .from('workflow_interrupts')
        .update({
          escalated_at: now,
          escalation_reason: reason,
          updated_at: now,
        })
        .eq('interrupt_id', interruptId)
        .select()
        .single();

      if (error) throw error;

      this.logger.warn(`Interrupt escalated`, {
        interrupt_id: interruptId,
        reason,
        admin_id: adminId,
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to escalate interrupt', {
        interrupt_id: interruptId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Get all interrupts for a workflow
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
   * Get unresolved interrupts for a workflow
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
   * Get interrupts by type
   */
  async getInterruptsByType(
    workflowId: string,
    interruptType: InterruptType
  ): Promise<WorkflowInterrupt[]> {
    try {
      const { data, error } = await this.db
        .from('workflow_interrupts')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('interrupt_type', interruptType)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      this.logger.error('Failed to get interrupts by type', {
        workflow_id: workflowId,
        interrupt_type: interruptType,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Get unresolved interrupts requiring specific action
   */
  async getInterruptsRequiringAction(
    workflowId: string,
    requiredAction: RequiredAction
  ): Promise<WorkflowInterrupt[]> {
    try {
      const { data, error } = await this.db
        .from('workflow_interrupts')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('required_action', requiredAction)
        .is('resolved_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      this.logger.error('Failed to get interrupts requiring action', {
        workflow_id: workflowId,
        required_action: requiredAction,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Check if workflow has unresolved critical interrupts
   */
  async hasCriticalInterrupts(workflowId: string): Promise<boolean> {
    try {
      const critical = await this.getInterruptsByType(workflowId, 'system_error');
      return critical.length > 0;
    } catch (error) {
      this.logger.error('Failed to check for critical interrupts', {
        workflow_id: workflowId,
        error: String(error),
      });
      return false;
    }
  }

  /**
   * Handle quality gate interrupt
   * Returns true if should proceed, false if should pause
   */
  async handleQualityGateInterrupt(
    workflowId: string,
    qualityScore: number,
    threshold: number = 0.5
  ): Promise<{ proceed: boolean; interrupt?: WorkflowInterrupt }> {
    if (qualityScore >= threshold) {
      return { proceed: true };
    }

    // Create quality gate interrupt
    const interrupt = await this.createInterrupt(
      workflowId,
      'quality_gate',
      `Quality score ${qualityScore} is below threshold ${threshold}`,
      'manual_review',
      { quality_score: qualityScore, threshold },
      'kb_ingest'
    );

    return { proceed: false, interrupt };
  }

  /**
   * Handle user input required interrupt
   */
  async handleUserInputInterrupt(
    workflowId: string,
    reason: string,
    step: WorkflowStep,
    contextData: Record<string, unknown> = {}
  ): Promise<WorkflowInterrupt> {
    return this.createInterrupt(
      workflowId,
      'user_input',
      reason,
      'user_input',
      contextData,
      step
    );
  }

  /**
   * Handle system error interrupt
   */
  async handleSystemErrorInterrupt(
    workflowId: string,
    error: Error,
    step: WorkflowStep,
    shouldRetry: boolean = true
  ): Promise<WorkflowInterrupt> {
    return this.createInterrupt(
      workflowId,
      'system_error',
      `System error in ${step}: ${error.message}`,
      shouldRetry ? 'retry' : 'admin_approval',
      {
        error: error.message,
        stack: error.stack,
        step,
        should_retry: shouldRetry,
      },
      step
    );
  }

  /**
   * Handle validation failure interrupt
   */
  async handleValidationFailureInterrupt(
    workflowId: string,
    validationErrors: string[],
    step: WorkflowStep
  ): Promise<WorkflowInterrupt> {
    return this.createInterrupt(
      workflowId,
      'validation_failure',
      `Validation failed in ${step}: ${validationErrors[0]}`,
      'user_input',
      {
        validation_errors: validationErrors,
        step,
      },
      step
    );
  }

  /**
   * Handle timeout interrupt
   */
  async handleTimeoutInterrupt(
    workflowId: string,
    step: WorkflowStep,
    timeoutMs: number
  ): Promise<WorkflowInterrupt> {
    return this.createInterrupt(
      workflowId,
      'timeout',
      `Step ${step} exceeded timeout of ${timeoutMs}ms`,
      'retry',
      {
        step,
        timeout_ms: timeoutMs,
        timestamp: new Date().toISOString(),
      },
      step
    );
  }

  /**
   * Get summary of unresolved interrupts
   */
  async getInterruptSummary(workflowId: string): Promise<{
    total_unresolved: number;
    by_type: Record<InterruptType, number>;
    by_action: Record<RequiredAction, number>;
    by_step: Record<string, number>;
  }> {
    try {
      const interrupts = await this.getUnresolvedInterrupts(workflowId);

      const summary = {
        total_unresolved: interrupts.length,
        by_type: {} as Record<InterruptType, number>,
        by_action: {} as Record<RequiredAction, number>,
        by_step: {} as Record<string, number>,
      };

      for (const interrupt of interrupts) {
        summary.by_type[interrupt.interrupt_type] =
          (summary.by_type[interrupt.interrupt_type] || 0) + 1;
        summary.by_action[interrupt.required_action] =
          (summary.by_action[interrupt.required_action] || 0) + 1;
        if (interrupt.affected_step) {
          summary.by_step[interrupt.affected_step] =
            (summary.by_step[interrupt.affected_step] || 0) + 1;
        }
      }

      return summary;
    } catch (error) {
      this.logger.error('Failed to get interrupt summary', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Clean up resolved interrupts older than retention period
   */
  async cleanupResolvedInterrupts(
    workflowId: string,
    retentionDays: number = 30
  ): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const { data, error } = await this.db
        .from('workflow_interrupts')
        .delete()
        .eq('workflow_id', workflowId)
        .not('resolved_at', 'is', null)
        .lt('resolved_at', cutoffDate.toISOString())
        .select();

      if (error) throw error;

      const deletedCount = (data || []).length;
      this.logger.info(`Cleaned up resolved interrupts`, {
        workflow_id: workflowId,
        deleted_count: deletedCount,
      });

      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup interrupts', {
        workflow_id: workflowId,
        error: String(error),
      });
      throw error;
    }
  }
}

// Export singleton factory
export const createInterruptManager = (db: SupabaseClient) =>
  new WorkflowInterruptManager(db);
