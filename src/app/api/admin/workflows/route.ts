/**
 * Admin Workflows API Route
 * Phase 2: Central endpoint for workflow management
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handleGetWorkflows,
  handleGetWorkflow,
  handleResumeWorkflow,
  handleRetryStep,
  handleRollbackWorkflow,
  handleGetPendingInterrupts,
  handleResolveInterrupt,
  handleGetDashboard,
} from './handlers';
import TrialLogger from '@/lib/trial/logger';

const logger = TrialLogger.getInstance();

/**
 * Route mapping for workflow endpoints
 */
export async function GET(
  req: any,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const slug = resolvedParams.slug || [];
    const [action, resourceId, subAction] = slug;

    // GET /api/admin/workflows - List all workflows
    if (!action) {
      return handleGetWorkflows(req);
    }

    // GET /api/admin/workflows/dashboard - Dashboard view
    if (action === 'dashboard') {
      return handleGetDashboard(req);
    }

    // GET /api/admin/workflows/interrupts - List pending interrupts
    if (action === 'interrupts') {
      return handleGetPendingInterrupts(req);
    }

    // GET /api/admin/workflows/:id - Get workflow details
    if (action && !resourceId) {
      return handleGetWorkflow(req, action);
    }

    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  } catch (error) {
    logger.error('Workflow API error', { error: String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST routes for workflow actions
 */
export async function POST(
  req: any,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const slug = resolvedParams.slug || [];
    const [workflowId, action, resourceId, subAction] = slug;

    // POST /api/admin/workflows/:id/resume
    if (action === 'resume') {
      return handleResumeWorkflow(req, workflowId);
    }

    // POST /api/admin/workflows/:id/retry
    if (action === 'retry') {
      return handleRetryStep(req, workflowId);
    }

    // POST /api/admin/workflows/:id/rollback
    if (action === 'rollback') {
      return handleRollbackWorkflow(req, workflowId);
    }

    // POST /api/admin/workflows/:id/interrupts/:interruptId/resolve
    if (action === 'interrupts' && subAction === 'resolve') {
      return handleResolveInterrupt(req, workflowId, resourceId);
    }

    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  } catch (error) {
    logger.error('Workflow API error', { error: String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT routes for workflow updates (if needed in future)
 */
export async function PUT(
  req: any,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

/**
 * DELETE routes for workflow cleanup
 */
export async function DELETE(
  req: any,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
