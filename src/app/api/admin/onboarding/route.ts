/**
 * Admin Onboarding API - Monitor and Manage Onboarding Sessions
 * 
 * Endpoints:
 * - GET /api/admin/onboarding - List all onboarding sessions
 * - GET /api/admin/onboarding/:id - Get onboarding details
 * - POST /api/admin/onboarding/:id/nudge - Send reminder to user
 * - POST /api/admin/onboarding/:id/assist - Admin-assisted progression
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase-client';
import { logger } from '@/lib/observability/logger';
import { verifyAdminAuth, logAdminAction } from '@/lib/admin/auth';
import { OnboardingOrchestrator, OnboardingState, OnboardingStep } from '@/lib/onboarding';

// ============================================================================
// Validation Schemas
// ============================================================================

const ListOnboardingSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'paused', 'completed', 'failed', 'abandoned']).optional(),
  step: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const NudgeSchema = z.object({
  message: z.string().min(1).max(500).optional(),
  channel: z.enum(['email', 'in_app']).default('email'),
});

const AssistSchema = z.object({
  step: z.enum([
    'account_creation',
    'knowledge_base',
    'branding',
    'widget_config',
    'deployment',
    'verification',
  ]),
  data: z.record(z.string(), z.unknown()),
  skip_validation: z.boolean().default(false),
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/admin/onboarding
 * List all onboarding sessions
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.error },
        { status: 401 }
      );
    }

    // Check for specific onboarding ID in path
    const pathParts = req.nextUrl.pathname.split('/');
    const onboardingId = pathParts[pathParts.length - 1];
    
    if (onboardingId && onboardingId !== 'onboarding' && !onboardingId.includes('?')) {
      return getOnboardingDetails(req, onboardingId);
    }

    // Parse query parameters
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const validation = ListOnboardingSchema.safeParse(searchParams);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid parameters', details: validation.error.issues },
        { status: 400 }
      );
    }

    const params = validation.data;
    const db = getServiceClient();

    let query = db
      .from('onboarding_states')
      .select('*, tenants(name, email)', { count: 'exact' });

    if (params.status) {
      query = query.eq('status', params.status);
    }

    if (params.step) {
      query = query.eq('current_step', params.step);
    }

    if (params.search) {
      query = query.or(
        `tenant_id.ilike.%${params.search}%`
      );
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(params.offset, params.offset + params.limit - 1);

    if (error) {
      throw error;
    }

    // Calculate funnel metrics
    const { data: funnelData } = await db
      .from('onboarding_states')
      .select('current_step, status');

    const stepCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    
    for (const row of funnelData || []) {
      stepCounts[row.current_step] = (stepCounts[row.current_step] || 0) + 1;
      statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    }

    const conversionFunnel = {
      account_creation: stepCounts.knowledge_base || 0,
      knowledge_base: stepCounts.branding || 0,
      branding: stepCounts.widget_config || 0,
      widget_config: stepCounts.deployment || 0,
      deployment: stepCounts.verification || 0,
      verification: stepCounts.completed || 0,
      completed: stepCounts.completed || 0,
    };

    logger.info('Admin listed onboarding sessions', {
      admin_id: authResult.adminId,
      filters: params,
      result_count: data?.length,
    });

    return NextResponse.json({
      onboarding_sessions: data,
      pagination: {
        total: count || 0,
        limit: params.limit,
        offset: params.offset,
        has_more: params.offset + (data?.length || 0) < (count || 0),
      },
      metrics: {
        status_distribution: statusCounts,
        conversion_funnel: conversionFunnel,
        average_time_to_complete: 0, // Calculate from completed sessions
        drop_off_rate: 0, // Calculate from abandoned sessions
      },
    });
  } catch (error) {
    logger.error('Failed to list onboarding sessions', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get specific onboarding details
 */
async function getOnboardingDetails(
  req: NextRequest,
  onboardingId: string
): Promise<NextResponse> {
  const db = getServiceClient();

  const { data, error } = await db
    .from('onboarding_states')
    .select('*, tenants(*)')
    .eq('onboarding_id', onboardingId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Onboarding session not found' },
      { status: 404 }
    );
  }

  // Get activity timeline
  const { data: timeline } = await db
    .from('onboarding_events')
    .select('*')
    .eq('onboarding_id', onboardingId)
    .order('timestamp', { ascending: false })
    .limit(50);

  return NextResponse.json({
    onboarding: data,
    timeline: timeline || [],
  });
}

/**
 * POST /api/admin/onboarding
 * Handle onboarding actions
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyAdminAuth(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized', message: authResult.error },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { onboarding_id, action, ...actionData } = body;

    if (!onboarding_id) {
      return NextResponse.json(
        { error: 'onboarding_id is required' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'nudge':
        return handleNudge(req, onboarding_id, actionData, authResult.adminId!);
      case 'assist':
        return handleAssist(req, onboarding_id, actionData, authResult.adminId!);
      case 'abandon':
        return handleAbandon(req, onboarding_id, authResult.adminId!);
      case 'reset':
        return handleReset(req, onboarding_id, actionData, authResult.adminId!);
      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('Failed to perform onboarding action', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Send nudge/reminder to user
 */
async function handleNudge(
  req: NextRequest,
  onboardingId: string,
  data: unknown,
  adminId: string
): Promise<NextResponse> {
  const validation = NudgeSchema.safeParse(data);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: validation.error.issues },
      { status: 400 }
    );
  }

  const db = getServiceClient();

  // Get onboarding session
  const { data: onboarding, error } = await db
    .from('onboarding_states')
    .select('*, tenants(email, name)')
    .eq('onboarding_id', onboardingId)
    .single();

  if (error || !onboarding) {
    return NextResponse.json(
      { error: 'Onboarding session not found' },
      { status: 404 }
    );
  }

  // Send notification
  const message = validation.data.message || getDefaultNudgeMessage(onboarding.current_step);
  
  if (validation.data.channel === 'email') {
    // TODO: Integrate with email service
    logger.info('Sending nudge email', {
      onboarding_id: onboardingId,
      email: onboarding.tenants?.email,
      step: onboarding.current_step,
    });
  }

  // Log action
  await logAdminAction(adminId, 'onboarding_nudge', {
    onboarding_id: onboardingId,
    channel: validation.data.channel,
    message,
  });

  // Record event
  await db.from('onboarding_events').insert({
    onboarding_id: onboardingId,
    event_type: 'nudge_sent',
    data: { channel: validation.data.channel, message, admin_id: adminId },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    message: 'Nudge sent successfully',
  });
}

/**
 * Admin-assisted step progression
 */
async function handleAssist(
  req: NextRequest,
  onboardingId: string,
  data: unknown,
  adminId: string
): Promise<NextResponse> {
  const validation = AssistSchema.safeParse(data);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: validation.error.issues },
      { status: 400 }
    );
  }

  const orchestrator = new OnboardingOrchestrator();

  try {
    let result: OnboardingState;

    switch (validation.data.step) {
      case 'knowledge_base':
        result = await orchestrator.submitKnowledgeBase(
          onboardingId,
          validation.data.data as any
        );
        break;
      case 'branding':
        result = await orchestrator.submitBranding(
          onboardingId,
          validation.data.data as any
        );
        break;
      case 'widget_config':
        result = await orchestrator.submitWidgetConfig(
          onboardingId,
          validation.data.data as any
        );
        break;
      case 'deployment':
        result = await orchestrator.generateDeployment(onboardingId);
        break;
      case 'verification':
        result = await orchestrator.verifyDeployment(onboardingId);
        break;
      default:
        return NextResponse.json(
          { error: 'Cannot assist with this step' },
          { status: 400 }
        );
    }

    // Log action
    await logAdminAction(adminId, 'onboarding_assist', {
      onboarding_id: onboardingId,
      step: validation.data.step,
    });

    return NextResponse.json({
      success: true,
      onboarding: result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to assist' },
      { status: 400 }
    );
  }
}

/**
 * Mark onboarding as abandoned
 */
async function handleAbandon(
  req: NextRequest,
  onboardingId: string,
  adminId: string
): Promise<NextResponse> {
  const db = getServiceClient();

  const { data, error } = await db
    .from('onboarding_states')
    .update({
      status: 'abandoned',
      updated_at: new Date().toISOString(),
    })
    .eq('onboarding_id', onboardingId)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to abandon onboarding' },
      { status: 500 }
    );
  }

  await logAdminAction(adminId, 'onboarding_abandoned', {
    onboarding_id: onboardingId,
  });

  return NextResponse.json({
    success: true,
    onboarding: data,
  });
}

/**
 * Reset onboarding to a specific step
 */
async function handleReset(
  req: NextRequest,
  onboardingId: string,
  data: { step?: OnboardingStep },
  adminId: string
): Promise<NextResponse> {
  const orchestrator = new OnboardingOrchestrator();
  const step = data.step || 'knowledge_base';

  try {
    const result = await orchestrator.goToStep(onboardingId, step);

    await logAdminAction(adminId, 'onboarding_reset', {
      onboarding_id: onboardingId,
      reset_to_step: step,
    });

    return NextResponse.json({
      success: true,
      onboarding: result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset' },
      { status: 400 }
    );
  }
}

/**
 * Get default nudge message based on step
 */
function getDefaultNudgeMessage(step: string): string {
  const messages: Record<string, string> = {
    knowledge_base: "You're almost there! Upload your knowledge base to unlock your AI assistant.",
    branding: "Let's make your chatbot unique! Customize the branding to match your brand.",
    widget_config: "Final steps! Configure your widget settings and you'll be ready to go.",
    deployment: "You're so close! Get your embed code and start using your AI assistant.",
    verification: "Verify your setup and your AI assistant will be live!",
  };

  return messages[step] || "Continue your setup to unlock your AI assistant!";
}
