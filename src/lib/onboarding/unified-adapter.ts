/**
 * Unified Onboarding Adapter
 * 
 * This module provides a unified interface to the admin onboarding systems.
 * While `OnboardingOrchestrator` and `TrialWorkflowEngine` serve different purposes:
 * - OnboardingOrchestrator: User-facing trial wizard state management
 * - TrialWorkflowEngine: Admin workflow management with LlamaIndex integration
 * 
 * This adapter provides a common interface to reduce code duplication and
 * simplify future consolidation efforts.
 */

import { createLazyServiceClient } from '../supabase-client';
import { logger } from '../observability/logger';

const supabase = createLazyServiceClient();

export type OnboardingStep =
    | 'account_creation'
    | 'knowledge_base'
    | 'branding'
    | 'widget_config'
    | 'deployment'
    | 'verification'
    | 'completed';

export interface UnifiedOnboardingState {
    tenantId: string;
    currentStep: OnboardingStep;
    status: 'active' | 'completed' | 'failed' | 'paused';
    progress: number; // 0-100
    completedSteps: OnboardingStep[];
    metadata: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}

/**
 * Get the current onboarding state for a tenant.
 * Checks both onboarding_states and workflow_states tables.
 */
export async function getOnboardingState(tenantId: string): Promise<UnifiedOnboardingState | null> {
    // First try onboarding_states (primary for user-facing flow)
    const { data: onboardingState } = await supabase
        .from('onboarding_states')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

    if (onboardingState) {
        return {
            tenantId,
            currentStep: onboardingState.current_step || 'account_creation',
            status: onboardingState.status || 'active',
            progress: onboardingState.progress || 0,
            completedSteps: onboardingState.completed_steps || [],
            metadata: onboardingState.metadata || {},
            createdAt: onboardingState.created_at,
            updatedAt: onboardingState.updated_at,
        };
    }

    // Fallback to workflow_states (admin flow)
    const { data: workflowState } = await supabase
        .from('workflow_states')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

    if (workflowState) {
        const stepMap: Record<string, OnboardingStep> = {
            'trial_init': 'account_creation',
            'kb_ingest': 'knowledge_base',
            'branding_config': 'branding',
            'widget_deploy': 'widget_config',
            'go_live': 'completed',
        };

        return {
            tenantId,
            currentStep: stepMap[workflowState.current_step] || 'account_creation',
            status: workflowState.status || 'active',
            progress: workflowState.progress || 0,
            completedSteps: (workflowState.completed_steps || []).map((s: string) => stepMap[s] || s) as OnboardingStep[],
            metadata: workflowState.context || {},
            createdAt: workflowState.created_at,
            updatedAt: workflowState.updated_at,
        };
    }

    return null;
}

/**
 * Update the onboarding progress for a tenant.
 */
export async function updateOnboardingProgress(
    tenantId: string,
    step: OnboardingStep,
    progress: number,
    metadata?: Record<string, any>
): Promise<void> {
    const now = new Date().toISOString();

    // Update onboarding_states
    const { error: onboardingError } = await supabase
        .from('onboarding_states')
        .upsert({
            tenant_id: tenantId,
            current_step: step,
            progress: Math.min(100, Math.max(0, progress)),
            metadata: metadata || {},
            updated_at: now,
        }, { onConflict: 'tenant_id' });

    if (onboardingError) {
        logger.warn('Failed to update onboarding_states', { tenantId, error: onboardingError.message });
    }
}

/**
 * Mark a step as completed for a tenant.
 */
export async function completeOnboardingStep(
    tenantId: string,
    step: OnboardingStep
): Promise<void> {
    const state = await getOnboardingState(tenantId);
    if (!state) {
        logger.error('Cannot complete step for unknown tenant', { tenantId, step });
        return;
    }

    const completedSteps = [...new Set([...state.completedSteps, step])];
    const stepOrder: OnboardingStep[] = [
        'account_creation',
        'knowledge_base',
        'branding',
        'widget_config',
        'deployment',
        'verification',
        'completed',
    ];

    // Calculate progress based on completed steps
    const progress = Math.round((completedSteps.length / (stepOrder.length - 1)) * 100);

    const { error } = await supabase
        .from('onboarding_states')
        .update({
            completed_steps: completedSteps,
            progress,
            updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId);

    if (error) {
        logger.error('Failed to complete onboarding step', { tenantId, step, error: error.message });
    }
}

/**
 * Get onboarding analytics for dashboard.
 */
export async function getOnboardingAnalytics(): Promise<{
    totalTenants: number;
    completedOnboarding: number;
    inProgress: number;
    failed: number;
    averageProgress: number;
    dropoffByStep: Record<OnboardingStep, number>;
}> {
    const { data: states, error } = await supabase
        .from('onboarding_states')
        .select('current_step, status, progress');

    if (error || !states) {
        return {
            totalTenants: 0,
            completedOnboarding: 0,
            inProgress: 0,
            failed: 0,
            averageProgress: 0,
            dropoffByStep: {} as Record<OnboardingStep, number>,
        };
    }

    const dropoffByStep: Record<string, number> = {};
    let totalProgress = 0;
    let completedOnboarding = 0;
    let inProgress = 0;
    let failed = 0;

    for (const state of states) {
        totalProgress += state.progress || 0;

        if (state.status === 'completed') {
            completedOnboarding++;
        } else if (state.status === 'failed') {
            failed++;
        } else {
            inProgress++;
        }

        // Track dropoff by step
        if (state.status !== 'completed' && state.current_step) {
            dropoffByStep[state.current_step] = (dropoffByStep[state.current_step] || 0) + 1;
        }
    }

    return {
        totalTenants: states.length,
        completedOnboarding,
        inProgress,
        failed,
        averageProgress: states.length > 0 ? Math.round(totalProgress / states.length) : 0,
        dropoffByStep: dropoffByStep as Record<OnboardingStep, number>,
    };
}
