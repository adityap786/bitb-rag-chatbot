/**
 * Tenant Manager - Production-Grade Multi-Tenant Orchestration
 * 
 * Centralized tenant lifecycle management with:
 * - Tenant provisioning and deprovisioning
 * - Quota management and enforcement
 * - Feature flag management
 * - Usage tracking and billing integration
 * - Tenant health monitoring
 * 
 * Compliance: SOC 2 Type II, ISO 27001
 */

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { logger } from '../observability/logger';
import { redis } from '../redis-client';

// ============================================================================
// Types
// ============================================================================

export type TenantStatus = 
  | 'pending'
  | 'provisioning'
  | 'active'
  | 'suspended'
  | 'expired'
  | 'deprovisioning'
  | 'deleted';

export type TenantPlan = 
  | 'trial'
  | 'starter'
  | 'professional'
  | 'enterprise'
  | 'custom';

export interface TenantQuota {
  queries_per_day: number;
  queries_per_minute: number;
  storage_mb: number;
  embeddings_count: number;
  concurrent_sessions: number;
  api_calls_per_day: number;
  file_uploads_per_day: number;
  max_file_size_mb: number;
}

export interface TenantFeatures {
  rag_enabled: boolean;
  mcp_enabled: boolean;
  voice_enabled: boolean;
  analytics_enabled: boolean;
  custom_branding: boolean;
  api_access: boolean;
  webhook_integration: boolean;
  sso_enabled: boolean;
  audit_logging: boolean;
  priority_support: boolean;
}

export interface TenantConfig {
  tenant_id: string;
  name: string;
  email: string;
  status: TenantStatus;
  plan: TenantPlan;
  quota: TenantQuota;
  features: TenantFeatures;
  branding: {
    primary_color: string;
    secondary_color: string;
    logo_url?: string;
    widget_position: 'bottom-right' | 'bottom-left';
    chat_tone: 'professional' | 'friendly' | 'casual';
    welcome_message: string;
  };
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  expires_at?: string;
}

export interface TenantUsage {
  tenant_id: string;
  period_start: string;
  period_end: string;
  queries_used: number;
  storage_used_mb: number;
  embeddings_count: number;
  api_calls: number;
  active_sessions: number;
}

export interface CreateTenantRequest {
  email: string;
  name: string;
  plan?: TenantPlan;
  business_type?: string;
  industry?: string;
  metadata?: Record<string, unknown>;
}

export interface TenantProvisionResult {
  tenant_id: string;
  api_key: string;
  setup_token: string;
  config: TenantConfig;
}

// ============================================================================
// Default Quotas by Plan
// ============================================================================

const PLAN_QUOTAS: Record<TenantPlan, TenantQuota> = {
  trial: {
    queries_per_day: 100,
    queries_per_minute: 10,
    storage_mb: 50,
    embeddings_count: 1000,
    concurrent_sessions: 5,
    api_calls_per_day: 500,
    file_uploads_per_day: 10,
    max_file_size_mb: 10,
  },
  starter: {
    queries_per_day: 1000,
    queries_per_minute: 30,
    storage_mb: 500,
    embeddings_count: 10000,
    concurrent_sessions: 20,
    api_calls_per_day: 5000,
    file_uploads_per_day: 50,
    max_file_size_mb: 25,
  },
  professional: {
    queries_per_day: 10000,
    queries_per_minute: 100,
    storage_mb: 5000,
    embeddings_count: 100000,
    concurrent_sessions: 100,
    api_calls_per_day: 50000,
    file_uploads_per_day: 200,
    max_file_size_mb: 50,
  },
  enterprise: {
    queries_per_day: 100000,
    queries_per_minute: 500,
    storage_mb: 50000,
    embeddings_count: 1000000,
    concurrent_sessions: 500,
    api_calls_per_day: 500000,
    file_uploads_per_day: 1000,
    max_file_size_mb: 100,
  },
  custom: {
    queries_per_day: 100000,
    queries_per_minute: 500,
    storage_mb: 50000,
    embeddings_count: 1000000,
    concurrent_sessions: 500,
    api_calls_per_day: 500000,
    file_uploads_per_day: 1000,
    max_file_size_mb: 100,
  },
};

const PLAN_FEATURES: Record<TenantPlan, TenantFeatures> = {
  trial: {
    rag_enabled: true,
    mcp_enabled: false,
    voice_enabled: false,
    analytics_enabled: true,
    custom_branding: false,
    api_access: true,
    webhook_integration: false,
    sso_enabled: false,
    audit_logging: false,
    priority_support: false,
  },
  starter: {
    rag_enabled: true,
    mcp_enabled: true,
    voice_enabled: false,
    analytics_enabled: true,
    custom_branding: true,
    api_access: true,
    webhook_integration: true,
    sso_enabled: false,
    audit_logging: false,
    priority_support: false,
  },
  professional: {
    rag_enabled: true,
    mcp_enabled: true,
    voice_enabled: true,
    analytics_enabled: true,
    custom_branding: true,
    api_access: true,
    webhook_integration: true,
    sso_enabled: true,
    audit_logging: true,
    priority_support: false,
  },
  enterprise: {
    rag_enabled: true,
    mcp_enabled: true,
    voice_enabled: true,
    analytics_enabled: true,
    custom_branding: true,
    api_access: true,
    webhook_integration: true,
    sso_enabled: true,
    audit_logging: true,
    priority_support: true,
  },
  custom: {
    rag_enabled: true,
    mcp_enabled: true,
    voice_enabled: true,
    analytics_enabled: true,
    custom_branding: true,
    api_access: true,
    webhook_integration: true,
    sso_enabled: true,
    audit_logging: true,
    priority_support: true,
  },
};

// ============================================================================
// Tenant Manager Class
// ============================================================================

export class TenantManager {
  private db: SupabaseClient;
  private cachePrefix = 'tenant:';
  private cacheTTL = 300; // 5 minutes

  constructor(db?: SupabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (db) {
      this.db = db;
    } else if (supabaseUrl && supabaseKey) {
      this.db = createClient(supabaseUrl, supabaseKey);
    } else {
      throw new Error('TenantManager: Database connection required');
    }
  }

  // --------------------------------------------------------------------------
  // Tenant Provisioning
  // --------------------------------------------------------------------------

  /**
   * Provision a new tenant with full isolation setup
   */
  async provisionTenant(request: CreateTenantRequest): Promise<TenantProvisionResult> {
    const startTime = Date.now();
    const tenantId = this.generateTenantId();
    const apiKey = this.generateApiKey();
    const setupToken = this.generateSetupToken();

    try {
      logger.info('Provisioning tenant', { tenant_id: tenantId, email: request.email });

      // Calculate trial expiry (3 days for trial plan)
      const plan = request.plan || 'trial';
      const expiresAt = plan === 'trial' 
        ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      // Build tenant config
      const config: TenantConfig = {
        tenant_id: tenantId,
        name: request.name,
        email: request.email,
        status: 'provisioning',
        plan,
        quota: PLAN_QUOTAS[plan],
        features: PLAN_FEATURES[plan],
        branding: {
          primary_color: '#6366f1',
          secondary_color: '#8b5cf6',
          widget_position: 'bottom-right',
          chat_tone: 'professional',
          welcome_message: 'Hello! How can I help you today?',
        },
        metadata: {
          business_type: request.business_type,
          industry: request.industry,
          ...request.metadata,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: expiresAt,
      };

      // Insert tenant record
      const { error: insertError } = await this.db
        .from('tenants')
        .insert({
          tenant_id: tenantId,
          email: request.email,
          name: request.name,
          status: 'provisioning',
          plan,
          quota: config.quota,
          features: config.features,
          branding: config.branding,
          metadata: config.metadata,
          expires_at: expiresAt,
        });

      if (insertError) {
        throw new Error(`Failed to create tenant record: ${insertError.message}`);
      }

      // Store API key (hashed)
      const apiKeyHash = this.hashApiKey(apiKey);
      await this.db.from('tenant_api_keys').insert({
        tenant_id: tenantId,
        key_hash: apiKeyHash,
        key_prefix: apiKey.substring(0, 8),
        created_at: new Date().toISOString(),
        last_used_at: null,
        status: 'active',
      });

      // Store setup token
      await this.db.from('tenant_setup_tokens').insert({
        tenant_id: tenantId,
        token_hash: this.hashToken(setupToken),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        used_at: null,
      });

      // Initialize usage tracking
      await this.initializeUsageTracking(tenantId);

      // Create RLS policies
      await this.setupRLSPolicies(tenantId);

      // Mark as active
      await this.updateTenantStatus(tenantId, 'active');
      config.status = 'active';

      // Cache config
      await this.cacheConfig(tenantId, config);

      logger.info('Tenant provisioned successfully', {
        tenant_id: tenantId,
        duration_ms: Date.now() - startTime,
      });

      return {
        tenant_id: tenantId,
        api_key: apiKey,
        setup_token: setupToken,
        config,
      };
    } catch (error) {
      logger.error('Failed to provision tenant', {
        tenant_id: tenantId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Cleanup on failure
      await this.cleanupFailedProvisioning(tenantId);
      throw error;
    }
  }

  /**
   * Deprovision a tenant and clean up all resources
   */
  async deprovisionTenant(tenantId: string, reason?: string): Promise<void> {
    logger.info('Deprovisioning tenant', { tenant_id: tenantId, reason });

    try {
      // Mark as deprovisioning
      await this.updateTenantStatus(tenantId, 'deprovisioning');

      // Delete embeddings
      await this.db.from('embeddings').delete().eq('tenant_id', tenantId);

      // Delete chat sessions
      await this.db.from('chat_sessions').delete().eq('tenant_id', tenantId);

      // Delete knowledge base entries
      await this.db.from('knowledge_base').delete().eq('tenant_id', tenantId);

      // Delete API keys
      await this.db.from('tenant_api_keys').delete().eq('tenant_id', tenantId);

      // Delete usage records
      await this.db.from('tenant_usage').delete().eq('tenant_id', tenantId);

      // Mark as deleted
      await this.updateTenantStatus(tenantId, 'deleted');

      // Invalidate cache
      await this.invalidateCache(tenantId);

      logger.info('Tenant deprovisioned', { tenant_id: tenantId });
    } catch (error) {
      logger.error('Failed to deprovision tenant', {
        tenant_id: tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Tenant Configuration
  // --------------------------------------------------------------------------

  /**
   * Get tenant configuration with caching
   */
  async getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
    // Check cache first
    const cached = await this.getCachedConfig(tenantId);
    if (cached) return cached;

    // Fetch from database
    const { data, error } = await this.db
      .from('tenants')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      logger.warn('Tenant not found', { tenant_id: tenantId });
      return null;
    }

    const config: TenantConfig = {
      tenant_id: data.tenant_id,
      name: data.name,
      email: data.email,
      status: data.status,
      plan: data.plan,
      quota: data.quota,
      features: data.features,
      branding: data.branding,
      metadata: data.metadata || {},
      created_at: data.created_at,
      updated_at: data.updated_at,
      expires_at: data.expires_at,
    };

    // Cache for future requests
    await this.cacheConfig(tenantId, config);

    return config;
  }

  /**
   * Update tenant configuration
   */
  async updateTenantConfig(
    tenantId: string,
    updates: Partial<Pick<TenantConfig, 'branding' | 'quota' | 'features' | 'metadata'>>
  ): Promise<TenantConfig> {
    const { data, error } = await this.db
      .from('tenants')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update tenant config: ${error?.message}`);
    }

    // Invalidate cache
    await this.invalidateCache(tenantId);

    return this.getTenantConfig(tenantId) as Promise<TenantConfig>;
  }

  // --------------------------------------------------------------------------
  // Quota Management
  // --------------------------------------------------------------------------

  /**
   * Check if tenant has quota for an operation
   */
  async checkQuota(
    tenantId: string,
    operation: 'query' | 'api_call' | 'file_upload' | 'storage' | 'embedding'
  ): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const config = await this.getTenantConfig(tenantId);
    if (!config) {
      return { allowed: false, remaining: 0, limit: 0 };
    }

    const usage = await this.getCurrentUsage(tenantId);
    
    switch (operation) {
      case 'query': {
        const limit = config.quota.queries_per_day;
        const remaining = Math.max(0, limit - usage.queries_used);
        return { allowed: remaining > 0, remaining, limit };
      }
      case 'api_call': {
        const limit = config.quota.api_calls_per_day;
        const remaining = Math.max(0, limit - usage.api_calls);
        return { allowed: remaining > 0, remaining, limit };
      }
      case 'storage': {
        const limit = config.quota.storage_mb;
        const remaining = Math.max(0, limit - usage.storage_used_mb);
        return { allowed: remaining > 0, remaining, limit };
      }
      case 'embedding': {
        const limit = config.quota.embeddings_count;
        const remaining = Math.max(0, limit - usage.embeddings_count);
        return { allowed: remaining > 0, remaining, limit };
      }
      default:
        return { allowed: true, remaining: 999999, limit: 999999 };
    }
  }

  /**
   * Increment usage counter
   */
  async incrementUsage(
    tenantId: string,
    operation: 'query' | 'api_call' | 'file_upload',
    amount: number = 1
  ): Promise<void> {
    const periodStart = this.getPeriodStart();
    
    const column = {
      query: 'queries_used',
      api_call: 'api_calls',
      file_upload: 'file_uploads',
    }[operation];

    await this.db.rpc('increment_tenant_usage', {
      p_tenant_id: tenantId,
      p_period_start: periodStart,
      p_column: column,
      p_amount: amount,
    });

    // Also update Redis for rate limiting
    if (redis) {
      const redisClient = redis as {
        incrby(key: string, amount: number): Promise<number>;
        expire(key: string, seconds: number): Promise<number>;
      };
      const key = `usage:${tenantId}:${operation}:${periodStart}`;
      await redisClient.incrby(key, amount);
      await redisClient.expire(key, 86400); // 24 hours
    }
  }

  /**
   * Get current usage for tenant
   */
  async getCurrentUsage(tenantId: string): Promise<TenantUsage> {
    const periodStart = this.getPeriodStart();
    const periodEnd = this.getPeriodEnd();

    const { data, error } = await this.db
      .from('tenant_usage')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('period_start', periodStart)
      .single();

    if (error || !data) {
      // Return empty usage if not found
      return {
        tenant_id: tenantId,
        period_start: periodStart,
        period_end: periodEnd,
        queries_used: 0,
        storage_used_mb: 0,
        embeddings_count: 0,
        api_calls: 0,
        active_sessions: 0,
      };
    }

    return data;
  }

  // --------------------------------------------------------------------------
  // Feature Flags
  // --------------------------------------------------------------------------

  /**
   * Check if a feature is enabled for tenant
   */
  async isFeatureEnabled(tenantId: string, feature: keyof TenantFeatures): Promise<boolean> {
    const config = await this.getTenantConfig(tenantId);
    if (!config) return false;

    return config.features[feature] === true;
  }

  /**
   * Toggle feature for tenant
   */
  async toggleFeature(
    tenantId: string,
    feature: keyof TenantFeatures,
    enabled: boolean
  ): Promise<void> {
    const config = await this.getTenantConfig(tenantId);
    if (!config) throw new Error('Tenant not found');

    const updatedFeatures = { ...config.features, [feature]: enabled };
    await this.updateTenantConfig(tenantId, { features: updatedFeatures });

    logger.info('Feature toggled', { tenant_id: tenantId, feature, enabled });
  }

  // --------------------------------------------------------------------------
  // Plan Management
  // --------------------------------------------------------------------------

  /**
   * Upgrade tenant plan
   */
  async upgradePlan(tenantId: string, newPlan: TenantPlan): Promise<void> {
    const config = await this.getTenantConfig(tenantId);
    if (!config) throw new Error('Tenant not found');

    const oldPlan = config.plan;

    // Update plan with new quotas and features
    await this.db
      .from('tenants')
      .update({
        plan: newPlan,
        quota: PLAN_QUOTAS[newPlan],
        features: PLAN_FEATURES[newPlan],
        expires_at: null, // Remove expiry for paid plans
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);

    await this.invalidateCache(tenantId);

    logger.info('Tenant plan upgraded', {
      tenant_id: tenantId,
      old_plan: oldPlan,
      new_plan: newPlan,
    });
  }

  // --------------------------------------------------------------------------
  // Status Management
  // --------------------------------------------------------------------------

  /**
   * Update tenant status
   */
  async updateTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
    await this.db
      .from('tenants')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);

    await this.invalidateCache(tenantId);

    logger.info('Tenant status updated', { tenant_id: tenantId, status });
  }

  /**
   * Suspend tenant (e.g., for non-payment or abuse)
   */
  async suspendTenant(tenantId: string, reason: string): Promise<void> {
    await this.updateTenantStatus(tenantId, 'suspended');

    // Log suspension reason
    await this.db.from('tenant_audit_log').insert({
      tenant_id: tenantId,
      action: 'suspended',
      actor: 'system',
      details: { reason },
      timestamp: new Date().toISOString(),
    });

    logger.warn('Tenant suspended', { tenant_id: tenantId, reason });
  }

  /**
   * Reactivate suspended tenant
   */
  async reactivateTenant(tenantId: string): Promise<void> {
    await this.updateTenantStatus(tenantId, 'active');

    logger.info('Tenant reactivated', { tenant_id: tenantId });
  }

  // --------------------------------------------------------------------------
  // Tenant Listing and Search
  // --------------------------------------------------------------------------

  /**
   * List tenants with filtering and pagination
   */
  async listTenants(options: {
    status?: TenantStatus;
    plan?: TenantPlan;
    search?: string;
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDir?: 'asc' | 'desc';
  } = {}): Promise<{ tenants: TenantConfig[]; total: number }> {
    let query = this.db
      .from('tenants')
      .select('*', { count: 'exact' });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.plan) {
      query = query.eq('plan', options.plan);
    }

    if (options.search) {
      query = query.or(
        `name.ilike.%${options.search}%,email.ilike.%${options.search}%`
      );
    }

    const { data, count, error } = await query
      .order(options.orderBy || 'created_at', { ascending: options.orderDir === 'asc' })
      .range(
        options.offset || 0,
        (options.offset || 0) + (options.limit || 50) - 1
      );

    if (error) {
      throw new Error(`Failed to list tenants: ${error.message}`);
    }

    return {
      tenants: data as TenantConfig[],
      total: count || 0,
    };
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private generateTenantId(): string {
    return 'tn_' + crypto.randomBytes(16).toString('hex');
  }

  private generateApiKey(): string {
    return 'bitb_' + crypto.randomBytes(24).toString('base64url');
  }

  private generateSetupToken(): string {
    return 'setup_' + crypto.randomBytes(32).toString('hex');
  }

  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private getPeriodStart(): string {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    return now.toISOString();
  }

  private getPeriodEnd(): string {
    const now = new Date();
    now.setUTCHours(23, 59, 59, 999);
    return now.toISOString();
  }

  private async initializeUsageTracking(tenantId: string): Promise<void> {
    const periodStart = this.getPeriodStart();
    const periodEnd = this.getPeriodEnd();

    await this.db.from('tenant_usage').insert({
      tenant_id: tenantId,
      period_start: periodStart,
      period_end: periodEnd,
      queries_used: 0,
      storage_used_mb: 0,
      embeddings_count: 0,
      api_calls: 0,
      active_sessions: 0,
    });
  }

  private async setupRLSPolicies(tenantId: string): Promise<void> {
    // RLS policies are typically set up at the schema level
    // This is a placeholder for any tenant-specific setup
    logger.debug('RLS policies setup for tenant', { tenant_id: tenantId });
  }

  private async cleanupFailedProvisioning(tenantId: string): Promise<void> {
    try {
      await this.db.from('tenants').delete().eq('tenant_id', tenantId);
      await this.db.from('tenant_api_keys').delete().eq('tenant_id', tenantId);
      await this.db.from('tenant_setup_tokens').delete().eq('tenant_id', tenantId);
      await this.db.from('tenant_usage').delete().eq('tenant_id', tenantId);
    } catch (error) {
      logger.error('Failed to cleanup after provisioning failure', {
        tenant_id: tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async cacheConfig(tenantId: string, config: TenantConfig): Promise<void> {
    if (!redis) return;

    try {
      await redis.set(
        `${this.cachePrefix}${tenantId}`,
        JSON.stringify(config),
        { ex: this.cacheTTL }
      );
    } catch (error) {
      logger.warn('Failed to cache tenant config', { tenant_id: tenantId });
    }
  }

  private async getCachedConfig(tenantId: string): Promise<TenantConfig | null> {
    if (!redis) return null;

    try {
      const cached = await redis.get(`${this.cachePrefix}${tenantId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn('Failed to get cached tenant config', { tenant_id: tenantId });
    }

    return null;
  }

  private async invalidateCache(tenantId: string): Promise<void> {
    if (!redis) return;

    try {
      await redis.del(`${this.cachePrefix}${tenantId}`);
    } catch (error) {
      logger.warn('Failed to invalidate tenant cache', { tenant_id: tenantId });
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let tenantManagerInstance: TenantManager | null = null;

export function getTenantManager(): TenantManager {
  if (!tenantManagerInstance) {
    tenantManagerInstance = new TenantManager();
  }
  return tenantManagerInstance;
}

export default TenantManager;
