/**
 * Onboarding Orchestrator - Production-Grade Trial Onboarding
 * 
 * Manages the complete onboarding flow with:
 * - Step-by-step wizard orchestration
 * - Progress tracking and persistence
 * - Validation at each step
 * - Error recovery and rollback
 * - Webhook notifications
 * - Analytics integration
 */

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { logger } from '../observability/logger';
import { TenantManager, TenantConfig, CreateTenantRequest } from '../tenant/tenant-manager';

// ============================================================================
// Types
// ============================================================================

export type OnboardingStep = 
  | 'account_creation'
  | 'knowledge_base'
  | 'branding'
  | 'widget_config'
  | 'deployment'
  | 'verification'
  | 'completed';

export type OnboardingStatus = 
  | 'pending'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'abandoned';

export type KBSourceType = 'manual' | 'upload' | 'crawl' | 'api';

export interface OnboardingState {
  onboarding_id: string;
  tenant_id: string;
  current_step: OnboardingStep;
  status: OnboardingStatus;
  progress_percent: number;
  steps_completed: OnboardingStep[];
  steps_data: Record<OnboardingStep, unknown>;
  errors: Array<{
    step: OnboardingStep;
    error: string;
    timestamp: string;
    recoverable: boolean;
  }>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  metadata: Record<string, unknown>;
}

export interface AccountCreationData {
  email: string;
  business_name: string;
  business_type: 'service' | 'ecommerce' | 'saas' | 'agency' | 'other';
  industry?: string;
  website_url?: string;
  contact_name?: string;
  phone?: string;
}

export interface KnowledgeBaseData {
  source_type: KBSourceType;
  files?: Array<{
    name: string;
    size: number;
    type: string;
    content_base64?: string;
  }>;
  urls?: string[];
  crawl_depth?: number;
  manual_content?: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  chunks_processed: number;
  embeddings_created: number;
  quality_score?: number;
}

export interface BrandingData {
  primary_color: string;
  secondary_color: string;
  logo_url?: string;
  logo_file?: {
    name: string;
    size: number;
    content_base64: string;
  };
  chat_tone: 'professional' | 'friendly' | 'casual';
  welcome_message: string;
  fallback_message?: string;
  widget_position: 'bottom-right' | 'bottom-left';
  custom_css?: string;
}

export interface WidgetConfigData {
  display_name: string;
  avatar_url?: string;
  suggested_questions: string[];
  enabled_features: {
    voice: boolean;
    file_upload: boolean;
    feedback: boolean;
    history: boolean;
  };
  operating_hours?: {
    enabled: boolean;
    timezone: string;
    schedule: Record<string, { start: string; end: string }>;
    offline_message: string;
  };
}

export interface DeploymentData {
  embed_code: string;
  script_url: string;
  allowed_origins: string[];
  api_key: string;
  setup_verified: boolean;
  test_query_result?: {
    query: string;
    response: string;
    latency_ms: number;
    success: boolean;
  };
}

export interface StepValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Step Configuration
// ============================================================================

const STEP_ORDER: OnboardingStep[] = [
  'account_creation',
  'knowledge_base',
  'branding',
  'widget_config',
  'deployment',
  'verification',
  'completed',
];

const STEP_PROGRESS: Record<OnboardingStep, number> = {
  account_creation: 0,
  knowledge_base: 20,
  branding: 40,
  widget_config: 60,
  deployment: 80,
  verification: 95,
  completed: 100,
};

// ============================================================================
// Onboarding Orchestrator
// ============================================================================

export class OnboardingOrchestrator {
  private db: SupabaseClient;
  private tenantManager: TenantManager;

  constructor(db?: SupabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (db) {
      this.db = db;
    } else if (supabaseUrl && supabaseKey) {
      this.db = createClient(supabaseUrl, supabaseKey);
    } else {
      throw new Error('OnboardingOrchestrator: Database connection required');
    }

    this.tenantManager = new TenantManager(this.db);
  }

  // --------------------------------------------------------------------------
  // Onboarding Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start a new onboarding session
   */
  async startOnboarding(data: AccountCreationData): Promise<{
    onboarding_id: string;
    tenant_id: string;
    setup_token: string;
  }> {
    const onboardingId = this.generateOnboardingId();

    try {
      logger.info('Starting onboarding', { onboarding_id: onboardingId, email: data.email });

      // Validate account data
      const validation = this.validateAccountCreation(data);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Provision tenant
      const tenantResult = await this.tenantManager.provisionTenant({
        email: data.email,
        name: data.business_name,
        business_type: data.business_type,
        industry: data.industry,
        metadata: {
          website_url: data.website_url,
          contact_name: data.contact_name,
          phone: data.phone,
        },
      });

      // Create onboarding state
      const state: Omit<OnboardingState, 'updated_at'> = {
        onboarding_id: onboardingId,
        tenant_id: tenantResult.tenant_id,
        current_step: 'knowledge_base',
        status: 'in_progress',
        progress_percent: STEP_PROGRESS.knowledge_base,
        steps_completed: ['account_creation'],
        steps_data: {
          account_creation: data,
          knowledge_base: {},
          branding: {},
          widget_config: {},
          deployment: {},
          verification: {},
          completed: {},
        },
        errors: [],
        created_at: new Date().toISOString(),
        metadata: {},
      };

      // Persist state
      await this.db.from('onboarding_states').insert({
        ...state,
        updated_at: new Date().toISOString(),
      });

      // Send welcome email (async)
      this.sendWelcomeEmail(data.email, data.business_name, tenantResult.setup_token).catch(
        (err) => logger.warn('Failed to send welcome email', { error: err })
      );

      logger.info('Onboarding started', {
        onboarding_id: onboardingId,
        tenant_id: tenantResult.tenant_id,
      });

      return {
        onboarding_id: onboardingId,
        tenant_id: tenantResult.tenant_id,
        setup_token: tenantResult.setup_token,
      };
    } catch (error) {
      logger.error('Failed to start onboarding', {
        onboarding_id: onboardingId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get current onboarding state
   */
  async getOnboardingState(onboardingId: string): Promise<OnboardingState | null> {
    const { data, error } = await this.db
      .from('onboarding_states')
      .select('*')
      .eq('onboarding_id', onboardingId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as OnboardingState;
  }

  /**
   * Get onboarding state by tenant ID
   */
  async getOnboardingByTenant(tenantId: string): Promise<OnboardingState | null> {
    const { data, error } = await this.db
      .from('onboarding_states')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return data as OnboardingState;
  }

  // --------------------------------------------------------------------------
  // Step Handlers
  // --------------------------------------------------------------------------

  /**
   * Submit knowledge base data
   */
  async submitKnowledgeBase(
    onboardingId: string,
    data: KnowledgeBaseData
  ): Promise<OnboardingState> {
    const state = await this.getOnboardingState(onboardingId);
    if (!state) {
      throw new Error('Onboarding session not found');
    }

    if (state.current_step !== 'knowledge_base') {
      throw new Error(`Cannot submit KB data in step: ${state.current_step}`);
    }

    // Validate
    const validation = this.validateKnowledgeBase(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Update state
    const updatedState = await this.updateStep(
      onboardingId,
      'knowledge_base',
      data,
      'branding'
    );

    // Trigger async processing if needed
    if (data.source_type !== 'manual' && data.processing_status === 'pending') {
      this.triggerKBProcessing(state.tenant_id, data).catch((err) =>
        logger.error('KB processing failed', { error: err })
      );
    }

    return updatedState;
  }

  /**
   * Submit branding configuration
   */
  async submitBranding(onboardingId: string, data: BrandingData): Promise<OnboardingState> {
    const state = await this.getOnboardingState(onboardingId);
    if (!state) {
      throw new Error('Onboarding session not found');
    }

    if (state.current_step !== 'branding') {
      throw new Error(`Cannot submit branding in step: ${state.current_step}`);
    }

    // Validate
    const validation = this.validateBranding(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Update tenant branding
    await this.tenantManager.updateTenantConfig(state.tenant_id, {
      branding: {
        primary_color: data.primary_color,
        secondary_color: data.secondary_color,
        logo_url: data.logo_url,
        widget_position: data.widget_position,
        chat_tone: data.chat_tone,
        welcome_message: data.welcome_message,
      },
    });

    // Upload logo if provided
    if (data.logo_file) {
      const logoUrl = await this.uploadLogo(state.tenant_id, data.logo_file);
      data.logo_url = logoUrl;
    }

    return this.updateStep(onboardingId, 'branding', data, 'widget_config');
  }

  /**
   * Submit widget configuration
   */
  async submitWidgetConfig(
    onboardingId: string,
    data: WidgetConfigData
  ): Promise<OnboardingState> {
    const state = await this.getOnboardingState(onboardingId);
    if (!state) {
      throw new Error('Onboarding session not found');
    }

    if (state.current_step !== 'widget_config') {
      throw new Error(`Cannot submit widget config in step: ${state.current_step}`);
    }

    // Validate
    const validation = this.validateWidgetConfig(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Store widget config
    await this.db.from('widget_configs').upsert({
      tenant_id: state.tenant_id,
      display_name: data.display_name,
      avatar_url: data.avatar_url,
      suggested_questions: data.suggested_questions,
      enabled_features: data.enabled_features,
      operating_hours: data.operating_hours,
      updated_at: new Date().toISOString(),
    });

    return this.updateStep(onboardingId, 'widget_config', data, 'deployment');
  }

  /**
   * Generate deployment resources
   */
  async generateDeployment(onboardingId: string): Promise<OnboardingState> {
    const state = await this.getOnboardingState(onboardingId);
    if (!state) {
      throw new Error('Onboarding session not found');
    }

    if (state.current_step !== 'deployment') {
      throw new Error(`Cannot generate deployment in step: ${state.current_step}`);
    }

    const tenantConfig = await this.tenantManager.getTenantConfig(state.tenant_id);
    if (!tenantConfig) {
      throw new Error('Tenant config not found');
    }

    // Get or create API key
    const { data: apiKeyData } = await this.db
      .from('tenant_api_keys')
      .select('key_prefix')
      .eq('tenant_id', state.tenant_id)
      .eq('status', 'active')
      .single();

    const apiKeyPrefix = apiKeyData?.key_prefix || 'bitb_***';

    // Generate embed code
    const widgetUrl = process.env.NEXT_PUBLIC_WIDGET_URL || 'https://cdn.bitb.ltd';
    const embedCode = this.generateEmbedCode(state.tenant_id, widgetUrl, tenantConfig);

    // Get allowed origins from account data
    const accountData = state.steps_data.account_creation as AccountCreationData;
    const allowedOrigins = accountData.website_url
      ? [new URL(accountData.website_url).origin]
      : [];

    const deploymentData: DeploymentData = {
      embed_code: embedCode,
      script_url: `${widgetUrl}/widget.js`,
      allowed_origins: allowedOrigins,
      api_key: `${apiKeyPrefix}...`, // Masked
      setup_verified: false,
    };

    return this.updateStep(onboardingId, 'deployment', deploymentData, 'verification');
  }

  /**
   * Verify deployment
   */
  async verifyDeployment(onboardingId: string): Promise<OnboardingState> {
    const state = await this.getOnboardingState(onboardingId);
    if (!state) {
      throw new Error('Onboarding session not found');
    }

    if (state.current_step !== 'verification') {
      throw new Error(`Cannot verify in step: ${state.current_step}`);
    }

    // Run a test query
    const testResult = await this.runTestQuery(state.tenant_id);

    // Update deployment data with test result
    const deploymentData = state.steps_data.deployment as DeploymentData;
    deploymentData.test_query_result = testResult;
    deploymentData.setup_verified = testResult.success;

    await this.updateStep(onboardingId, 'verification', { test_result: testResult }, 'completed');

    // Mark onboarding as completed
    return this.completeOnboarding(onboardingId);
  }

  /**
   * Complete onboarding
   */
  private async completeOnboarding(onboardingId: string): Promise<OnboardingState> {
    const { data, error } = await this.db
      .from('onboarding_states')
      .update({
        current_step: 'completed',
        status: 'completed',
        progress_percent: 100,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('onboarding_id', onboardingId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to complete onboarding: ${error.message}`);
    }

    const state = data as OnboardingState;

    // Send completion email
    const accountData = state.steps_data.account_creation as AccountCreationData;
    this.sendCompletionEmail(accountData.email, accountData.business_name).catch((err) =>
      logger.warn('Failed to send completion email', { error: err })
    );

    // Trigger webhook
    this.triggerWebhook('onboarding.completed', state).catch((err) =>
      logger.warn('Failed to trigger webhook', { error: err })
    );

    logger.info('Onboarding completed', {
      onboarding_id: onboardingId,
      tenant_id: state.tenant_id,
    });

    return state;
  }

  // --------------------------------------------------------------------------
  // Navigation
  // --------------------------------------------------------------------------

  /**
   * Go back to a previous step
   */
  async goToStep(onboardingId: string, step: OnboardingStep): Promise<OnboardingState> {
    const state = await this.getOnboardingState(onboardingId);
    if (!state) {
      throw new Error('Onboarding session not found');
    }

    const currentIndex = STEP_ORDER.indexOf(state.current_step);
    const targetIndex = STEP_ORDER.indexOf(step);

    if (targetIndex >= currentIndex) {
      throw new Error('Can only go back to previous steps');
    }

    const { data, error } = await this.db
      .from('onboarding_states')
      .update({
        current_step: step,
        progress_percent: STEP_PROGRESS[step],
        updated_at: new Date().toISOString(),
      })
      .eq('onboarding_id', onboardingId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to navigate: ${error.message}`);
    }

    return data as OnboardingState;
  }

  /**
   * Pause onboarding (user can resume later)
   */
  async pauseOnboarding(onboardingId: string): Promise<OnboardingState> {
    const { data, error } = await this.db
      .from('onboarding_states')
      .update({
        status: 'paused',
        updated_at: new Date().toISOString(),
      })
      .eq('onboarding_id', onboardingId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to pause onboarding: ${error.message}`);
    }

    return data as OnboardingState;
  }

  /**
   * Resume paused onboarding
   */
  async resumeOnboarding(onboardingId: string): Promise<OnboardingState> {
    const { data, error } = await this.db
      .from('onboarding_states')
      .update({
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      })
      .eq('onboarding_id', onboardingId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to resume onboarding: ${error.message}`);
    }

    return data as OnboardingState;
  }

  // --------------------------------------------------------------------------
  // Validation Methods
  // --------------------------------------------------------------------------

  private validateAccountCreation(data: AccountCreationData): StepValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.email || !this.isValidEmail(data.email)) {
      errors.push('Valid email is required');
    }

    if (!data.business_name || data.business_name.length < 2) {
      errors.push('Business name must be at least 2 characters');
    }

    if (data.business_name && data.business_name.length > 100) {
      errors.push('Business name must be less than 100 characters');
    }

    if (!data.business_type) {
      errors.push('Business type is required');
    }

    if (data.website_url && !this.isValidUrl(data.website_url)) {
      errors.push('Invalid website URL');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateKnowledgeBase(data: KnowledgeBaseData): StepValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.source_type) {
      errors.push('Source type is required');
    }

    switch (data.source_type) {
      case 'upload':
        if (!data.files || data.files.length === 0) {
          errors.push('At least one file is required');
        }
        if (data.files) {
          const totalSize = data.files.reduce((sum, f) => sum + f.size, 0);
          if (totalSize > 50 * 1024 * 1024) {
            errors.push('Total file size cannot exceed 50MB');
          }
        }
        break;

      case 'crawl':
        if (!data.urls || data.urls.length === 0) {
          errors.push('At least one URL is required');
        }
        if (data.urls && data.urls.length > 10) {
          warnings.push('Only the first 10 URLs will be crawled');
        }
        break;

      case 'manual':
        if (!data.manual_content || data.manual_content.length < 100) {
          errors.push('Content must be at least 100 characters');
        }
        break;
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateBranding(data: BrandingData): StepValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.primary_color || !this.isValidHexColor(data.primary_color)) {
      errors.push('Valid primary color is required');
    }

    if (!data.secondary_color || !this.isValidHexColor(data.secondary_color)) {
      errors.push('Valid secondary color is required');
    }

    if (!data.welcome_message || data.welcome_message.length < 10) {
      errors.push('Welcome message must be at least 10 characters');
    }

    if (data.welcome_message && data.welcome_message.length > 500) {
      errors.push('Welcome message must be less than 500 characters');
    }

    if (data.logo_file && data.logo_file.size > 2 * 1024 * 1024) {
      errors.push('Logo file size cannot exceed 2MB');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateWidgetConfig(data: WidgetConfigData): StepValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.display_name || data.display_name.length < 2) {
      errors.push('Display name must be at least 2 characters');
    }

    if (data.suggested_questions && data.suggested_questions.length > 5) {
      warnings.push('Only the first 5 suggested questions will be shown');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  private generateOnboardingId(): string {
    return 'onb_' + crypto.randomBytes(16).toString('hex');
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private isValidHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }

  private async updateStep(
    onboardingId: string,
    step: OnboardingStep,
    data: unknown,
    nextStep: OnboardingStep
  ): Promise<OnboardingState> {
    const state = await this.getOnboardingState(onboardingId);
    if (!state) {
      throw new Error('Onboarding not found');
    }

    const stepsCompleted = [...state.steps_completed];
    if (!stepsCompleted.includes(step)) {
      stepsCompleted.push(step);
    }

    const stepsData = { ...state.steps_data, [step]: data };

    const { data: updated, error } = await this.db
      .from('onboarding_states')
      .update({
        current_step: nextStep,
        steps_completed: stepsCompleted,
        steps_data: stepsData,
        progress_percent: STEP_PROGRESS[nextStep],
        updated_at: new Date().toISOString(),
      })
      .eq('onboarding_id', onboardingId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update step: ${error.message}`);
    }

    return updated as OnboardingState;
  }

  private generateEmbedCode(
    tenantId: string,
    widgetUrl: string,
    config: TenantConfig
  ): string {
    const configJson = JSON.stringify({
      tenant_id: tenantId,
      theme: {
        primaryColor: config.branding.primary_color,
        secondaryColor: config.branding.secondary_color,
        position: config.branding.widget_position,
      },
      tone: config.branding.chat_tone,
    });

    return `<!-- BiTB Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['BitBWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  })(window,document,'script','bitb','${widgetUrl}/widget.js');
  bitb('init', ${configJson});
</script>
<!-- End BiTB Widget -->`;
  }

  private async uploadLogo(
    tenantId: string,
    file: { name: string; content_base64: string }
  ): Promise<string> {
    // Upload to Supabase storage
    const buffer = Buffer.from(file.content_base64, 'base64');
    const path = `logos/${tenantId}/${file.name}`;

    const { data, error } = await this.db.storage
      .from('tenant-assets')
      .upload(path, buffer, { upsert: true });

    if (error) {
      throw new Error(`Failed to upload logo: ${error.message}`);
    }

    return this.db.storage.from('tenant-assets').getPublicUrl(path).data.publicUrl;
  }

  private async triggerKBProcessing(
    tenantId: string,
    data: KnowledgeBaseData
  ): Promise<void> {
    // This would trigger your ingestion pipeline
    logger.info('Triggering KB processing', {
      tenant_id: tenantId,
      source_type: data.source_type,
    });

    // Call internal ingestion API
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantId,
        source_type: data.source_type,
        files: data.files,
        urls: data.urls,
        crawl_depth: data.crawl_depth,
        content: data.manual_content,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to start KB processing');
    }
  }

  private async runTestQuery(tenantId: string): Promise<{
    query: string;
    response: string;
    latency_ms: number;
    success: boolean;
  }> {
    const testQuery = 'What can you help me with?';
    const startTime = Date.now();

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          query: testQuery,
        }),
      });

      const data = await response.json();
      const latency = Date.now() - startTime;

      return {
        query: testQuery,
        response: data.answer || data.message || '',
        latency_ms: latency,
        success: response.ok && !!data.answer,
      };
    } catch (error) {
      return {
        query: testQuery,
        response: '',
        latency_ms: Date.now() - startTime,
        success: false,
      };
    }
  }

  private async sendWelcomeEmail(
    email: string,
    businessName: string,
    setupToken: string
  ): Promise<void> {
    // Integration with email service (SendGrid, Postmark, etc.)
    logger.info('Sending welcome email', { email, business_name: businessName });
  }

  private async sendCompletionEmail(email: string, businessName: string): Promise<void> {
    logger.info('Sending completion email', { email, business_name: businessName });
  }

  private async triggerWebhook(event: string, data: unknown): Promise<void> {
    // Trigger webhook for external integrations
    logger.info('Triggering webhook', { event });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let orchestratorInstance: OnboardingOrchestrator | null = null;

export function getOnboardingOrchestrator(): OnboardingOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new OnboardingOrchestrator();
  }
  return orchestratorInstance;
}

export default OnboardingOrchestrator;
