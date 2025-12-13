/**
 * Plan Detection Middleware
 * Detects tenant plan type and loads feature flags
 */

import type { PlanType, FeatureFlags, TenantPlanConfig } from '../types/multi-plan.js';
import { createLazyServiceClient } from './supabase-client';

export class PlanDetector {
  private supabase;
  private cache: Map<string, TenantPlanConfig>;
  private cacheTTL = 300000; // 5 minutes

  constructor() {
    // Use the server-side service client so we don't depend on NEXT_PUBLIC_* env vars.
    this.supabase = createLazyServiceClient();
    this.cache = new Map();
  }

  /**
   * Get tenant plan configuration with caching
   */
  async getTenantPlan(tenantId: string): Promise<TenantPlanConfig | null> {
    // Check cache first
    const cached = this.cache.get(tenantId);
    if (cached) {
      return cached;
    }

    try {
      // Try the multi-plan schema first.
      const { data: v2, error: v2Error } = await this.supabase
        .from('tenants')
        .select('tenant_id, plan_type, industry_vertical, ecommerce_platform, calendar_integration, feature_flags, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!v2Error && v2) {
        const planType = (v2 as any).plan_type || 'service';
        const config: TenantPlanConfig = {
          id: (v2 as any).tenant_id,
          plan_type: planType,
          industry_vertical: (v2 as any).industry_vertical,
          ecommerce_platform: (v2 as any).ecommerce_platform,
          calendar_integration: (v2 as any).calendar_integration,
          feature_flags: (v2 as any).feature_flags || this.getDefaultFeatureFlags(planType),
          created_at: (v2 as any).created_at,
          updated_at: (v2 as any).updated_at,
        };

        this.cache.set(tenantId, config);
        setTimeout(() => this.cache.delete(tenantId), this.cacheTTL);
        return config;
      }

      // Fallback: production tenants table schema (plan/metadata/features) without multi-plan columns.
      const { data: v1, error: v1Error } = await this.supabase
        .from('tenants')
        .select('tenant_id, plan, metadata, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (v1Error) {
        console.error('Error fetching tenant plan:', v1Error);
        return null;
      }
      if (!v1) return null;

      const metadata = ((v1 as any).metadata || {}) as any;
      const planType: PlanType = metadata.plan_type || 'service';
      const featureFlags: FeatureFlags = metadata.feature_flags || this.getDefaultFeatureFlags(planType);

      const config: TenantPlanConfig = {
        id: (v1 as any).tenant_id,
        plan_type: planType,
        industry_vertical: metadata.industry_vertical,
        ecommerce_platform: metadata.ecommerce_platform,
        calendar_integration: metadata.calendar_integration,
        feature_flags: featureFlags,
        created_at: (v1 as any).created_at,
        updated_at: (v1 as any).updated_at,
      };

      // Cache the result
      this.cache.set(tenantId, config);

      // Clear cache after TTL
      setTimeout(() => this.cache.delete(tenantId), this.cacheTTL);

      return config;
    } catch (error) {
      console.error('Exception fetching tenant plan:', error);
      return null;
    }
  }

  /**
   * Get default feature flags based on plan type
   */
  private getDefaultFeatureFlags(planType: PlanType): FeatureFlags {
    if (planType === 'service') {
      return {
        healthcare_engine: false,
        legal_engine: false,
        financial_engine: false,
        technical_support: true,
        appointment_booking: true,
        consultation_booking: true,
        citations: true,
        real_time_streaming: true,
        voice_input: false,
        voice_output: false,
        analytics_dashboard: true,
        a_b_testing: false,
      };
    } else {
      // E-commerce plan
      return {
        product_cards: true,
        product_comparison: true,
        cart_management: true,
        checkout_integration: true,
        booking_system: true,
        recommendations: true,
        inventory_tracking: true,
        order_tracking: true,
        citations: true,
        real_time_streaming: true,
        voice_input: false,
        voice_output: false,
        analytics_dashboard: true,
        a_b_testing: false,
      };
    }
  }

  /**
   * Check if a specific feature is enabled for a tenant
   */
  async isFeatureEnabled(tenantId: string, feature: keyof FeatureFlags): Promise<boolean> {
    const config = await this.getTenantPlan(tenantId);
    if (!config) return false;
    
    return config.feature_flags[feature] === true;
  }

  /**
   * Update tenant plan configuration
   */
  async updateTenantPlan(
    tenantId: string,
    updates: Partial<Pick<TenantPlanConfig, 'plan_type' | 'industry_vertical' | 'ecommerce_platform' | 'calendar_integration' | 'feature_flags'>>
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('tenants')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('Error updating tenant plan:', error);
        return false;
      }

      // Invalidate cache
      this.cache.delete(tenantId);

      return true;
    } catch (error) {
      console.error('Exception updating tenant plan:', error);
      return false;
    }
  }

  /**
   * Enable specific features for a tenant
   */
  async enableFeatures(tenantId: string, features: (keyof FeatureFlags)[]): Promise<boolean> {
    const config = await this.getTenantPlan(tenantId);
    if (!config) return false;

    const updatedFlags = { ...config.feature_flags };
    features.forEach((feature) => {
      updatedFlags[feature] = true;
    });

    return this.updateTenantPlan(tenantId, { feature_flags: updatedFlags });
  }

  /**
   * Disable specific features for a tenant
   */
  async disableFeatures(tenantId: string, features: (keyof FeatureFlags)[]): Promise<boolean> {
    const config = await this.getTenantPlan(tenantId);
    if (!config) return false;

    const updatedFlags = { ...config.feature_flags };
    features.forEach((feature) => {
      updatedFlags[feature] = false;
    });

    return this.updateTenantPlan(tenantId, { feature_flags: updatedFlags });
  }

  /**
   * Get plan-specific prompt modifications
   */
  async getPlanPromptModifiers(tenantId: string): Promise<string[]> {
    const config = await this.getTenantPlan(tenantId);
    if (!config) return [];

    const modifiers: string[] = [];

    if (config.plan_type === 'service') {
      modifiers.push('You are assisting with service-based business needs.');
      
      if (config.industry_vertical === 'healthcare') {
        modifiers.push('Follow HIPAA compliance guidelines. Never share or request PHI without proper authorization.');
      } else if (config.industry_vertical === 'legal') {
        modifiers.push('Provide legal information disclaimers. You are not providing legal advice.');
      } else if (config.industry_vertical === 'financial') {
        modifiers.push('Include financial regulation disclaimers. Not financial advice.');
      }

      if (config.feature_flags.appointment_booking) {
        modifiers.push('You can help schedule appointments and consultations.');
      }
    } else if (config.plan_type === 'ecommerce') {
      modifiers.push('You are assisting with e-commerce product discovery and purchases.');
      
      if (config.feature_flags.product_cards) {
        modifiers.push('You can display product information with images, prices, and ratings.');
      }
      
      if (config.feature_flags.cart_management) {
        modifiers.push('You can add products to cart and manage shopping cart.');
      }
      
      if (config.feature_flags.recommendations) {
        modifiers.push('Provide personalized product recommendations based on conversation context.');
      }
    }

    if (config.feature_flags.citations) {
      modifiers.push('Always provide citations and sources for factual claims.');
    }

    return modifiers;
  }

  /**
   * Clear cache for a specific tenant or all tenants
   */
  clearCache(tenantId?: string): void {
    if (tenantId) {
      this.cache.delete(tenantId);
    } else {
      this.cache.clear();
    }
  }
}

// Singleton instance
let planDetectorInstance: PlanDetector | null = null;

export function getPlanDetector(): PlanDetector {
  if (!planDetectorInstance) {
    planDetectorInstance = new PlanDetector();
  }
  return planDetectorInstance;
}
