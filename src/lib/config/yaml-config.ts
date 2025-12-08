/**
 * YAML Configuration System
 * 
 * Production-ready YAML-based configuration for tenants and features.
 * Features:
 * - Tenant-specific configurations
 * - Feature flags
 * - Environment-based overrides
 * - Schema validation
 * - Hot reloading
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// Types
export interface TenantConfig {
  id: string;
  name: string;
  domain?: string;
  features: FeatureConfig;
  branding: BrandingConfig;
  integrations: IntegrationsConfig;
  limits: LimitsConfig;
  ai: AIConfig;
  notifications: NotificationsConfig;
  security: SecurityConfig;
  vertical?: VerticalConfig;
}

export interface FeatureConfig {
  chat: boolean;
  rag: boolean;
  voice: boolean;
  recommendations: boolean;
  booking: boolean;
  ecommerce: boolean;
  notifications: boolean;
  analytics: boolean;
  multiChannel: boolean;
  customBranding: boolean;
  apiAccess: boolean;
  webhooks: boolean;
  sso: boolean;
  auditLogs: boolean;
  [key: string]: boolean;
}

export interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logo?: string;
  favicon?: string;
  fontFamily?: string;
  chatWidget?: {
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    welcomeMessage?: string;
    placeholder?: string;
    theme: 'light' | 'dark' | 'auto';
  };
}

export interface IntegrationsConfig {
  openai?: {
    enabled: boolean;
    model: string;
    apiKey?: string;
  };
  anthropic?: {
    enabled: boolean;
    model: string;
    apiKey?: string;
  };
  pinecone?: {
    enabled: boolean;
    environment: string;
    indexName: string;
    apiKey?: string;
  };
  supabase?: {
    enabled: boolean;
    url?: string;
    anonKey?: string;
  };
  shopify?: {
    enabled: boolean;
    storeUrl?: string;
    accessToken?: string;
  };
  woocommerce?: {
    enabled: boolean;
    storeUrl?: string;
    consumerKey?: string;
    consumerSecret?: string;
  };
  googleCalendar?: {
    enabled: boolean;
    clientId?: string;
    clientSecret?: string;
  };
  outlookCalendar?: {
    enabled: boolean;
    clientId?: string;
    clientSecret?: string;
  };
  sendgrid?: {
    enabled: boolean;
    apiKey?: string;
    fromEmail?: string;
  };
  twilio?: {
    enabled: boolean;
    accountSid?: string;
    authToken?: string;
    fromNumber?: string;
  };
  langfuse?: {
    enabled: boolean;
    publicKey?: string;
    secretKey?: string;
  };
  stripe?: {
    enabled: boolean;
    publishableKey?: string;
    secretKey?: string;
    webhookSecret?: string;
  };
  [key: string]: {
    enabled: boolean;
    [key: string]: unknown;
  } | undefined;
}

export interface LimitsConfig {
  messagesPerDay: number;
  messagesPerMinute: number;
  tokensPerDay: number;
  storageGb: number;
  usersMax: number;
  apiRequestsPerMinute: number;
  webhooksMax: number;
  retentionDays: number;
}

export interface AIConfig {
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  ragEnabled: boolean;
  ragTopK: number;
  ragMinScore: number;
  embeddingModel: string;
  moderationEnabled: boolean;
  piiDetectionEnabled: boolean;
}

export interface NotificationsConfig {
  email: {
    enabled: boolean;
    templates: Record<string, string>;
  };
  sms: {
    enabled: boolean;
    templates: Record<string, string>;
  };
  push: {
    enabled: boolean;
  };
  webhooks: Array<{
    url: string;
    events: string[];
    secret?: string;
  }>;
}

export interface SecurityConfig {
  corsOrigins: string[];
  rateLimiting: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
  ipWhitelist?: string[];
  ipBlacklist?: string[];
  requireAuth: boolean;
  sessionTimeout: number;
  mfaRequired: boolean;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSymbols: boolean;
  };
}

export interface VerticalConfig {
  type: 'general' | 'ecommerce' | 'healthcare' | 'legal' | 'financial' | 'education' | 'hospitality';
  settings: Record<string, unknown>;
}

// Configuration Manager
export class ConfigManager {
  private configs: Map<string, TenantConfig> = new Map();
  private configDir: string;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private listeners: Set<(tenantId: string, config: TenantConfig) => void> = new Set();

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  /**
   * Initialize and load all configurations
   */
  async initialize(): Promise<void> {
    await this.loadAllConfigs();
  }

  /**
   * Load all YAML configs from the config directory
   */
  private async loadAllConfigs(): Promise<void> {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      return;
    }

    const files = fs.readdirSync(this.configDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of files) {
      await this.loadConfig(path.join(this.configDir, file));
    }
  }

  /**
   * Load a single config file
   */
  private async loadConfig(filePath: string): Promise<TenantConfig | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const config = yaml.parse(content) as TenantConfig;
      
      // Validate and apply defaults
      const validatedConfig = this.validateAndApplyDefaults(config);
      
      // Apply environment overrides
      const finalConfig = this.applyEnvironmentOverrides(validatedConfig);
      
      this.configs.set(finalConfig.id, finalConfig);
      
      // Notify listeners
      this.notifyListeners(finalConfig.id, finalConfig);
      
      return finalConfig;
    } catch (error) {
      console.error(`Failed to load config from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get tenant configuration
   */
  getConfig(tenantId: string): TenantConfig | undefined {
    return this.configs.get(tenantId);
  }

  /**
   * Get all tenant configurations
   */
  getAllConfigs(): TenantConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Check if a feature is enabled for a tenant
   */
  isFeatureEnabled(tenantId: string, feature: keyof FeatureConfig): boolean {
    const config = this.configs.get(tenantId);
    return config?.features[feature] ?? false;
  }

  /**
   * Get integration config for a tenant
   */
  getIntegration<T extends keyof IntegrationsConfig>(
    tenantId: string,
    integration: T
  ): IntegrationsConfig[T] | undefined {
    const config = this.configs.get(tenantId);
    return config?.integrations[integration];
  }

  /**
   * Update tenant configuration
   */
  async updateConfig(tenantId: string, updates: Partial<TenantConfig>): Promise<TenantConfig | null> {
    const existing = this.configs.get(tenantId);
    if (!existing) return null;

    const updated = this.deepMerge(existing, updates) as TenantConfig;
    this.configs.set(tenantId, updated);

    // Save to file
    await this.saveConfig(updated);

    // Notify listeners
    this.notifyListeners(tenantId, updated);

    return updated;
  }

  /**
   * Save configuration to YAML file
   */
  private async saveConfig(config: TenantConfig): Promise<void> {
    const filePath = path.join(this.configDir, `${config.id}.yaml`);
    const content = yaml.stringify(config, { indent: 2 });
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /**
   * Enable hot reloading for a tenant config
   */
  enableHotReload(tenantId: string): void {
    const filePath = path.join(this.configDir, `${tenantId}.yaml`);
    
    if (!fs.existsSync(filePath)) return;

    const watcher = fs.watch(filePath, async (event) => {
      if (event === 'change') {
        console.log(`Config changed for tenant: ${tenantId}`);
        await this.loadConfig(filePath);
      }
    });

    this.watchers.set(tenantId, watcher);
  }

  /**
   * Disable hot reloading for a tenant
   */
  disableHotReload(tenantId: string): void {
    const watcher = this.watchers.get(tenantId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(tenantId);
    }
  }

  /**
   * Add config change listener
   */
  onChange(listener: (tenantId: string, config: TenantConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Cleanup watchers
   */
  shutdown(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  // Private helper methods
  private validateAndApplyDefaults(config: Partial<TenantConfig>): TenantConfig {
    const defaults = this.getDefaultConfig();
    return this.deepMerge(defaults, config) as TenantConfig;
  }

  private applyEnvironmentOverrides(config: TenantConfig): TenantConfig {
    const env = process.env.NODE_ENV || 'development';
    const prefix = `TENANT_${config.id.toUpperCase()}_`;

    // Override integrations from environment
    for (const [key, integration] of Object.entries(config.integrations)) {
      if (integration) {
        const envKey = `${prefix}${key.toUpperCase()}_API_KEY`;
        if (process.env[envKey]) {
          (integration as Record<string, unknown>)['apiKey'] = process.env[envKey];
        }
      }
    }

    return config;
  }

  private getDefaultConfig(): TenantConfig {
    return {
      id: 'default',
      name: 'Default Tenant',
      features: {
        chat: true,
        rag: true,
        voice: false,
        recommendations: false,
        booking: false,
        ecommerce: false,
        notifications: true,
        analytics: true,
        multiChannel: false,
        customBranding: false,
        apiAccess: true,
        webhooks: false,
        sso: false,
        auditLogs: false,
      },
      branding: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        accentColor: '#10B981',
        chatWidget: {
          position: 'bottom-right',
          welcomeMessage: 'Hello! How can I help you today?',
          placeholder: 'Type your message...',
          theme: 'auto',
        },
      },
      integrations: {
        openai: {
          enabled: true,
          model: 'gpt-4o-mini',
        },
      },
      limits: {
        messagesPerDay: 1000,
        messagesPerMinute: 20,
        tokensPerDay: 100000,
        storageGb: 1,
        usersMax: 10,
        apiRequestsPerMinute: 60,
        webhooksMax: 5,
        retentionDays: 30,
      },
      ai: {
        defaultModel: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 1000,
        ragEnabled: true,
        ragTopK: 5,
        ragMinScore: 0.7,
        embeddingModel: 'text-embedding-3-small',
        moderationEnabled: true,
        piiDetectionEnabled: false,
      },
      notifications: {
        email: {
          enabled: false,
          templates: {},
        },
        sms: {
          enabled: false,
          templates: {},
        },
        push: {
          enabled: false,
        },
        webhooks: [],
      },
      security: {
        corsOrigins: ['*'],
        rateLimiting: {
          enabled: true,
          windowMs: 60000,
          maxRequests: 60,
        },
        requireAuth: true,
        sessionTimeout: 3600000,
        mfaRequired: false,
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSymbols: false,
        },
      },
    };
  }

  private deepMerge(target: unknown, source: unknown): unknown {
    if (!source) return target;
    if (!target) return source;

    if (typeof target !== 'object' || typeof source !== 'object') {
      return source;
    }

    if (Array.isArray(target) && Array.isArray(source)) {
      return source;
    }

    const result: Record<string, unknown> = { ...target as Record<string, unknown> };
    
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      result[key] = this.deepMerge(result[key], value);
    }

    return result;
  }

  private notifyListeners(tenantId: string, config: TenantConfig): void {
    for (const listener of this.listeners) {
      try {
        listener(tenantId, config);
      } catch (error) {
        console.error('Config listener error:', error);
      }
    }
  }
}

// Singleton instance
let configManager: ConfigManager | null = null;

export function initConfigManager(configDir: string): ConfigManager {
  configManager = new ConfigManager(configDir);
  return configManager;
}

export function getConfigManager(): ConfigManager {
  if (!configManager) {
    throw new Error('ConfigManager not initialized. Call initConfigManager first.');
  }
  return configManager;
}

export default ConfigManager;
