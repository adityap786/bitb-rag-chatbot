/**
 * Admin Workflow API Endpoints
 * Phase 2: Monitor, control, and manage workflows
 * 
 * Endpoints:
 * - GET /api/admin/workflows - List workflows with filters
 * - GET /api/admin/workflows/:id - Get workflow details
 * - POST /api/admin/workflows/:id/resume - Resume paused workflow
 * - POST /api/admin/workflows/:id/retry - Retry failed step
 * - POST /api/admin/workflows/:id/rollback - Rollback to previous step
 * - POST /api/admin/workflows/:id/interrupts/:interruptId/resolve - Resolve interrupt
 * - GET /api/admin/workflows/interrupts - List all pending interrupts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-client';
import TrialLogger from '@/lib/trial/logger';
import { TrialWorkflowEngine } from '@/lib/trial/workflow-engine';
import { WorkflowInterruptManager } from '@/lib/trial/workflow-interrupts';
import {
  GetWorkflowResponse,
  AdminActionRequest,
  AdminActionResponse,
  WorkflowDashboardView,
  WorkflowTimelineEntry,
} from '@/types/workflow';

const logger = TrialLogger.getInstance();

/**
 * GET /api/admin/workflows
 * List workflows with filtering
 */
export async function handleGetWorkflows(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const tenantId = searchParams.get('tenantId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const db = getServiceClient();

    let query = db.from('workflow_states').select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      workflows: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to get workflows', { error: String(error) });
    return NextResponse.json(
      { error: 'Failed to get workflows' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/workflows/:id
 * Get workflow details with history and interrupts
 */
export async function handleGetWorkflow(
  req: NextRequest,
  workflowId: string
) {
  try {
    const db = getServiceClient();

    const engine = new TrialWorkflowEngine(db);

    // Get workflow
    const workflow = await engine.getWorkflow(workflowId);
    if (!workflow) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    // Get interrupts
    const interrupts = await engine.getInterrupts(workflowId);

    // Get history
    const { data: history, error: historyError } = await db
      .from('workflow_history')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('timestamp', { ascending: false });

    if (historyError) throw historyError;

    const response: GetWorkflowResponse = {
      workflow,
      interrupts,
      history: history || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to get workflow', {
      workflow_id: workflowId,
      error: String(error),
    });
    return NextResponse.json(
      { error: 'Failed to get workflow' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/workflows/:id/resume
 * Resume a paused workflow
 */
export async function handleResumeWorkflow(
  req: NextRequest,
  workflowId: string
) {
  try {
    const adminId = req.headers.get('x-admin-id') || 'system';
    const db = getServiceClient();

    const engine = new TrialWorkflowEngine(db);

    // Resume workflow
    const result = await engine.resumeWorkflow(workflowId, adminId, 'admin');

    const workflow = await engine.getWorkflow(workflowId);

    const response: AdminActionResponse = {
      success: true,
      workflow_id: workflowId,
      new_status: workflow!.status,
      current_step: workflow!.current_step,
      message: 'Workflow resumed successfully',
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to resume workflow', {
      workflow_id: workflowId,
      error: String(error),
    });
    return NextResponse.json(
      { error: 'Failed to resume workflow' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/workflows/:id/retry
 * Retry the current step
 */
export async function handleRetryStep(
  req: NextRequest,
  workflowId: string
) {
  try {
    const adminId = req.headers.get('x-admin-id') || 'system';
    const db = getServiceClient();

    const engine = new TrialWorkflowEngine(db);

    const workflow = await engine.getWorkflow(workflowId);
    if (!workflow) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    // Reset retry count and re-execute step
    const result = await engine.executeStep(workflowId, workflow.current_step, {
      auto_advance: true,
    });

    const updatedWorkflow = await engine.getWorkflow(workflowId);

    const response: AdminActionResponse = {
      success: result.success,
      workflow_id: workflowId,
      new_status: updatedWorkflow!.status,
      current_step: updatedWorkflow!.current_step,
      message: result.success
        ? 'Step retried successfully'
        : `Step retry failed: ${result.error}`,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to retry step', {
      workflow_id: workflowId,
      error: String(error),
    });
    return NextResponse.json(
      { error: 'Failed to retry step' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/workflows/:id/rollback
 * Rollback to a previous step
 */
export async function handleRollbackWorkflow(
  req: NextRequest,
  workflowId: string
) {
  try {
    const { target_step } = await req.json();
    const adminId = req.headers.get('x-admin-id') || 'system';

    const db = getServiceClient();

    const engine = new TrialWorkflowEngine(db);

    // Rollback workflow
    await engine.rollbackWorkflow(workflowId, target_step, adminId, 'admin');

    const workflow = await engine.getWorkflow(workflowId);

    const response: AdminActionResponse = {
      success: true,
      workflow_id: workflowId,
      new_status: workflow!.status,
      current_step: workflow!.current_step,
      message: `Workflow rolled back to ${target_step}`,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to rollback workflow', {
      workflow_id: workflowId,
      error: String(error),
    });
    return NextResponse.json(
      { error: 'Failed to rollback workflow' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/workflows/interrupts
 * List all pending interrupts across workflows
 */
export async function handleGetPendingInterrupts(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const tenantId = searchParams.get('tenantId');

    const db = getServiceClient();

    let query = db
      .from('workflow_interrupts')
      .select('*, workflow_states(tenant_id, current_step)', {
        count: 'exact',
      })
      .is('resolved_at', null);

    if (tenantId) {
      query = query.eq('workflow_states.tenant_id', tenantId);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      interrupts: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to get pending interrupts', {
      error: String(error),
    });
    return NextResponse.json(
      { error: 'Failed to get pending interrupts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/workflows/:id/interrupts/:interruptId/resolve
 * Resolve an interrupt
 */
export async function handleResolveInterrupt(
  req: NextRequest,
  workflowId: string,
  interruptId: string
) {
  try {
    const { resolution, notes } = await req.json();
    const adminId = req.headers.get('x-admin-id') || 'system';

    const db = getServiceClient();

    const engine = new TrialWorkflowEngine(db);

    // Resolve interrupt
    const interrupt = await engine.resolveInterrupt(
      interruptId,
      resolution,
      notes,
      adminId
    );

    // If approved, resume workflow
    if (resolution === 'approved') {
      await engine.resumeWorkflow(workflowId, adminId, 'admin');
    }

    return NextResponse.json({
      success: true,
      interrupt,
      message: `Interrupt resolved with: ${resolution}`,
    });
  } catch (error) {
    logger.error('Failed to resolve interrupt', {
      workflow_id: workflowId,
      interrupt_id: interruptId,
      error: String(error),
    });
    return NextResponse.json(
      { error: 'Failed to resolve interrupt' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/workflows/dashboard
 * Get dashboard view for admin monitoring
 */
export async function handleGetDashboard(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    const db = getServiceClient();

    const engine = new TrialWorkflowEngine(db);

    let workflowQuery = db.from('workflow_states').select('*');

    if (tenantId) {
      workflowQuery = workflowQuery.eq('tenant_id', tenantId);
    }

    const { data: workflows, error: workflowError } = await workflowQuery;
    if (workflowError) throw workflowError;

    // Build dashboard views
    const dashboardViews: WorkflowDashboardView[] = [];

    for (const workflow of workflows || []) {
      const interrupts = await engine.getInterrupts(workflow.workflow_id);

      // Get timeline from history
      const { data: history } = await db
        .from('workflow_history')
        .select('*')
        .eq('workflow_id', workflow.workflow_id)
        .order('timestamp', { ascending: true });

      const timeline: WorkflowTimelineEntry[] = (history || [])
        .filter((event) => event.event_type.includes('step_'))
        .map((event) => ({
          step: event.new_step || event.previous_step || 'unknown',
          status: event.new_status || 'pending',
          started_at: event.timestamp,
          completed_at: event.timestamp, // Simplified
          duration_ms: 0, // Would calculate from history
          error: event.error,
        }));

      const tenantData = await db
        .from('tenants')
        .select('email')
        .eq('tenant_id', workflow.tenant_id)
        .single();

      dashboardViews.push({
        workflow_id: workflow.workflow_id,
        tenant_id: workflow.tenant_id,
        tenant_email: tenantData.data?.email || 'unknown',
        status: workflow.status,
        current_step: workflow.current_step,
        progress_percent: workflow.progress_percent,
        steps_completed: workflow.steps_completed,
        steps_pending: workflow.steps_completed
          ? []
          : [],
        steps_failed: workflow.steps_failed,
        pause_reason: workflow.paused_reason,
        paused_since: workflow.paused_at,
        interrupts,
        timeline,
      });
    }

    return NextResponse.json({
      workflows: dashboardViews,
      total: dashboardViews.length,
    });
  } catch (error) {
    logger.error('Failed to get dashboard', {
      error: String(error),
    });
    return NextResponse.json(
      { error: 'Failed to get dashboard' },
      { status: 500 }
    );
  }
}
