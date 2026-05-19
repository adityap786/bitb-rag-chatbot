/**
 * LLM Model Tier Configuration
 * 
 * Provides tiered LLM model selection based on tenant subscription status.
 * - Trial users: Fast model (llama-3.1-8b-instant) - 0.5-1.5s latency
 * - Paid users: Quality model (llama-3.3-70b-versatile) - 3-8s latency
 */

import { createLazyServiceClient } from './supabase-client';

export interface LLMModelConfig {
    model: string;
    maxTokens: number;
    temperature: number;
    tier: 'trial' | 'paid' | 'enterprise';
}

// Model configurations by tier
const MODEL_TIERS: Record<string, LLMModelConfig> = {
    trial: {
        model: 'llama-3.1-8b-instant',  // Fast: 0.5-1.5s
        maxTokens: 512,
        temperature: 0.15,
        tier: 'trial',
    },
    paid: {
        model: 'llama-3.3-70b-versatile',  // Quality: 3-8s
        maxTokens: 512,
        temperature: 0.15,
        tier: 'paid',
    },
    enterprise: {
        model: 'llama-3.3-70b-versatile',  // Quality with higher limits
        maxTokens: 1024,
        temperature: 0.12,
        tier: 'enterprise',
    },
};

// In-memory cache for tenant tiers
const tenantTierCache = new Map<string, { tier: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Determine tenant subscription tier from database
 */
async function getTenantTier(tenantId: string): Promise<'trial' | 'paid' | 'enterprise'> {
    // Check cache first
    const cached = tenantTierCache.get(tenantId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.tier as 'trial' | 'paid' | 'enterprise';
    }

    try {
        const supabase = createLazyServiceClient();
        const { data, error } = await supabase
            .from('tenants')
            .select('status, plan, metadata')
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (error || !data) {
            return 'trial'; // Default to trial tier
        }

        // Determine tier based on status and plan
        let tier: 'trial' | 'paid' | 'enterprise' = 'trial';

        const status = (data as any).status;
        const plan = (data as any).plan;
        const metadata = (data as any).metadata || {};

        if (status === 'active') {
            if (plan === 'enterprise' || metadata.tier === 'enterprise') {
                tier = 'enterprise';
            } else if (plan === 'paid' || plan === 'pro' || plan === 'business' || metadata.tier === 'paid') {
                tier = 'paid';
            } else {
                // Active trial
                tier = 'trial';
            }
        }

        // Cache the result
        tenantTierCache.set(tenantId, { tier, timestamp: Date.now() });

        return tier;
    } catch (error) {
        console.error('[LLM Tier] Error fetching tenant tier:', error);
        return 'trial';
    }
}

/**
 * Get LLM model configuration based on tenant subscription tier
 */
export async function getLLMModelConfig(tenantId: string): Promise<LLMModelConfig> {
    const tier = await getTenantTier(tenantId);
    return MODEL_TIERS[tier] || MODEL_TIERS.trial;
}

/**
 * Get LLM model name for a tenant (convenience function)
 */
export async function getLLMModelForTenant(tenantId: string): Promise<string> {
    const config = await getLLMModelConfig(tenantId);
    return config.model;
}

/**
 * Clear tier cache for a tenant (useful when subscription changes)
 */
export function clearTierCache(tenantId?: string): void {
    if (tenantId) {
        tenantTierCache.delete(tenantId);
    } else {
        tenantTierCache.clear();
    }
}

/**
 * Get model tier information (for logging/debugging)
 */
export function getModelTiers(): typeof MODEL_TIERS {
    return { ...MODEL_TIERS };
}
