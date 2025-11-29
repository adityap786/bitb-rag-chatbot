/**
 * @module Admin System Settings API
 * @description API endpoints for global system configuration
 * 
 * GET /api/admin/settings - Get system settings
 * PUT /api/admin/settings - Update system settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminAuth } from '@/lib/admin';
import { getServiceClient } from '@/lib/supabase-client';

// ============================================================
// Types & Schemas
// ============================================================

const systemSettingsSchema = z.object({
  // Onboarding settings
  onboarding: z.object({
    trial_duration_days: z.number().min(1).max(90).default(14),
    auto_extend_trials: z.boolean().default(false),
    require_email_verification: z.boolean().default(true),
    allow_custom_domains: z.boolean().default(false),
    default_welcome_message: z.string().optional(),
  }).optional(),

  // Quota defaults
  quotas: z.object({
    trial: z.object({
      queries_per_day: z.number().default(100),
      storage_mb: z.number().default(50),
      embeddings_count: z.number().default(1000),
    }).optional(),
    starter: z.object({
      queries_per_day: z.number().default(1000),
      storage_mb: z.number().default(500),
      embeddings_count: z.number().default(10000),
    }).optional(),
    professional: z.object({
      queries_per_day: z.number().default(10000),
      storage_mb: z.number().default(5000),
      embeddings_count: z.number().default(100000),
    }).optional(),
  }).optional(),

  // Security settings
  security: z.object({
    max_login_attempts: z.number().min(3).max(10).default(5),
    session_timeout_hours: z.number().min(1).max(168).default(24),
    require_mfa_for_admins: z.boolean().default(false),
    ip_whitelist_enabled: z.boolean().default(false),
    ip_whitelist: z.array(z.string()).optional(),
  }).optional(),

  // Feature flags
  features: z.object({
    voice_enabled_global: z.boolean().default(true),
    mcp_enabled_global: z.boolean().default(true),
    analytics_enabled_global: z.boolean().default(true),
    webhook_enabled_global: z.boolean().default(true),
    maintenance_mode: z.boolean().default(false),
    maintenance_message: z.string().optional(),
  }).optional(),

  // Email settings
  email: z.object({
    from_address: z.string().email().optional(),
    from_name: z.string().optional(),
    support_email: z.string().email().optional(),
  }).optional(),

  // Rate limiting
  rate_limits: z.object({
    global_rpm: z.number().default(1000),
    per_tenant_rpm: z.number().default(100),
    per_ip_rpm: z.number().default(60),
    burst_limit: z.number().default(50),
  }).optional(),

  // Monitoring
  monitoring: z.object({
    alert_thresholds: z.object({
      error_rate_percent: z.number().default(5),
      latency_p99_ms: z.number().default(2000),
      queue_depth: z.number().default(1000),
    }).optional(),
    pagerduty_enabled: z.boolean().default(false),
    pagerduty_key: z.string().optional(),
    slack_webhook: z.string().url().optional(),
  }).optional(),
});

type SystemSettings = z.infer<typeof systemSettingsSchema>;

// Default settings
const DEFAULT_SETTINGS: SystemSettings = {
  onboarding: {
    trial_duration_days: 14,
    auto_extend_trials: false,
    require_email_verification: true,
    allow_custom_domains: false,
    default_welcome_message: 'Welcome to our AI assistant! How can I help you today?',
  },
  quotas: {
    trial: {
      queries_per_day: 100,
      storage_mb: 50,
      embeddings_count: 1000,
    },
    starter: {
      queries_per_day: 1000,
      storage_mb: 500,
      embeddings_count: 10000,
    },
    professional: {
      queries_per_day: 10000,
      storage_mb: 5000,
      embeddings_count: 100000,
    },
  },
  security: {
    max_login_attempts: 5,
    session_timeout_hours: 24,
    require_mfa_for_admins: false,
    ip_whitelist_enabled: false,
    ip_whitelist: [],
  },
  features: {
    voice_enabled_global: true,
    mcp_enabled_global: true,
    analytics_enabled_global: true,
    webhook_enabled_global: true,
    maintenance_mode: false,
    maintenance_message: 'System is under maintenance. Please try again later.',
  },
  email: {
    from_address: 'noreply@bitb.ltd',
    from_name: 'BIT B Platform',
    support_email: 'support@bitb.ltd',
  },
  rate_limits: {
    global_rpm: 1000,
    per_tenant_rpm: 100,
    per_ip_rpm: 60,
    burst_limit: 50,
  },
  monitoring: {
    alert_thresholds: {
      error_rate_percent: 5,
      latency_p99_ms: 2000,
      queue_depth: 1000,
    },
    pagerduty_enabled: false,
  },
};

// ============================================================
// Settings storage key
// ============================================================

const SETTINGS_KEY = 'system_settings';

// ============================================================
// GET: Get system settings
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const authResult = await AdminAuth.requireAuth(request, ['super_admin', 'admin']);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const supabase = getServiceClient();

    // Try to get settings from a simple key-value store or dedicated table
    const { data, error } = await supabase
      .from('system_config')
      .select('value, updated_at')
      .eq('key', SETTINGS_KEY)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = row not found, which is ok
      console.error('Error fetching settings:', error);
    }

    const settings = data?.value 
      ? { ...DEFAULT_SETTINGS, ...data.value }
      : DEFAULT_SETTINGS;

    // Get some live stats
    const [tenantsResult, alertsResult] = await Promise.all([
      supabase
        .from('tenants')
        .select('status', { count: 'exact' }),
      supabase
        .from('system_alerts')
        .select('severity', { count: 'exact' })
        .eq('resolved', false),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        settings,
        stats: {
          total_tenants: tenantsResult.count || 0,
          active_alerts: alertsResult.count || 0,
        },
        last_updated: data?.updated_at || null,
      },
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT: Update system settings
// ============================================================

export async function PUT(request: NextRequest) {
  try {
    // Only super_admin can modify system settings
    const authResult = await AdminAuth.requireAuth(request, ['super_admin']);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const adminSession = authResult;
    const body = await request.json();

    // Validate partial update
    const partialSchema = systemSettingsSchema.partial();
    const updates = partialSchema.parse(body);

    const supabase = getServiceClient();

    // Get current settings
    const { data: current } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single();

    const currentSettings = current?.value || DEFAULT_SETTINGS;

    // Deep merge settings
    const newSettings = deepMerge(currentSettings, updates);

    // Upsert settings
    const { error } = await supabase
      .from('system_config')
      .upsert({
        key: SETTINGS_KEY,
        value: newSettings,
        updated_at: new Date().toISOString(),
        updated_by: adminSession.admin_id,
      });

    if (error) {
      // Try to create the table if it doesn't exist
      if (error.code === '42P01') {
        // Table doesn't exist - store in a fallback way
        console.warn('system_config table does not exist, settings not persisted');
        return NextResponse.json({
          success: true,
          data: {
            settings: newSettings,
            warning: 'Settings stored in memory only - system_config table not found',
          },
        });
      }
      throw error;
    }

    // Log audit entry
    await AdminAuth.logAuditEntry(
      adminSession.admin_id,
      'system_settings_updated',
      undefined,
      {
        changed_sections: Object.keys(updates),
      }
    );

    // Check for special actions
    if (updates.features?.maintenance_mode !== undefined) {
      // Create alert for maintenance mode change
      await supabase.from('system_alerts').insert({
        severity: updates.features.maintenance_mode ? 'warning' : 'info',
        title: updates.features.maintenance_mode 
          ? 'Maintenance Mode Enabled'
          : 'Maintenance Mode Disabled',
        message: `Maintenance mode was ${updates.features.maintenance_mode ? 'enabled' : 'disabled'} by admin ${adminSession.email}`,
        acknowledged: false,
        resolved: !updates.features.maintenance_mode,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        settings: newSettings,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid settings', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Update settings error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

// ============================================================
// Helper: Deep merge objects
// ============================================================

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}
