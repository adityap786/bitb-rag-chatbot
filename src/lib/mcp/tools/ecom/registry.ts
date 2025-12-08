/**
 * E-com Tool Registry
 *
 * Dedicated registry for e-commerce tools, strictly accessible only to E-com tenants.
 * Each tool is defined with a schema, handler, and metadata for RBAC and audit.
 */

import { MCPToolDefinition } from '../../types';
import { catalogIngestion, paymentLink, inventorySync, productDetail, orderTracking, returnsAndRefunds, abandonedCartRecovery, fraudCheck, productReviewSummary, personalizedRecommendation, sizeAndFitRecommender, bundleAndBogoEngine, checkAvailabilityRealtime, addToCart, initiateCheckout, subscriptionAndReplenishment, explainRecommendation, websiteNavigation, comparePriceAcrossSellers, analyticsInsightGenerator, updateSettings } from './handlers';

// --- Strict Access Control ---
// Only allow access to ECOM_TOOLS if tenant type is 'ecom'.
export function enforceEcomAccess(tenantType: string) {
  if (tenantType !== 'ecom') {
    throw new Error('Access denied: E-com tools are only available to E-com tenants.');
  }
}

// --- Advanced Config Support ---
// Per-tenant tool config, feature flags, and overrides
// Example: Enable/disable tools, set per-tenant rate limits, feature flags, or custom schemas

export interface EcomToolConfig {
  enabled?: boolean;
  rate_limit?: { max_calls_per_minute?: number; max_calls_per_hour?: number };
  feature_flags?: Record<string, boolean>;
  custom_schema?: object;
  [key: string]: any;
}

// Per-tenant config map (could be loaded from DB or config service in production)
export const ECOM_TOOL_CONFIGS: Record<string, Partial<Record<string, EcomToolConfig>>> = {
  // Example:
  // 'tenant_abc123': {
  //   payment_link: { enabled: false },
  //   catalog_ingestion: { rate_limit: { max_calls_per_minute: 2 } },
  //   personalized_recommendation: { feature_flags: { new_algo: true } }
  // }
};

/**
 * Get effective tool config for a tenant and tool
 * Falls back to default registry config if no override is present
 */
export function getEcomToolConfig(tenantId: string, toolName: string): EcomToolConfig {
  const tenantConfig = ECOM_TOOL_CONFIGS[tenantId]?.[toolName] || {};
  const defaultTool = ECOM_TOOLS[toolName];
  return {
    enabled: tenantConfig.enabled ?? true,
    rate_limit: tenantConfig.rate_limit ?? defaultTool?.rate_limit,
    feature_flags: tenantConfig.feature_flags ?? {},
    custom_schema: tenantConfig.custom_schema ?? defaultTool?.parameters_schema,
    ...tenantConfig
  };
}

// Extension points:
// - Add per-tenant feature flags (e.g., beta features, A/B tests)
// - Override schemas for custom onboarding or validation
// - Enable/disable tools per tenant (compliance, plan, etc.)
// - Integrate with external config service or DB for dynamic updates

export const ECOM_TOOLS: Record<string, MCPToolDefinition> = {
  update_settings: {
    name: 'update_settings',
    description: 'Update chatbot configuration (theme, display name, etc.)',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      properties: {
        theme: { type: 'object', properties: { theme: { type: 'string' }, primary_color: { type: 'string' }, position: { type: 'string' } }, additionalProperties: false },
        display_name: { type: 'string' },
        greeting_message: { type: 'string' },
        placeholder_text: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: updateSettings,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  catalog_ingestion: {
    name: 'catalog_ingestion',
    description: 'Ingest product catalog data (CSV, API, manual entry)',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['catalog_source'],
      properties: {
        catalog_source: { type: 'string', description: 'URL, file, or API endpoint for catalog data' },
        format: { type: 'string', enum: ['csv', 'json', 'api'], default: 'csv' },
        notify_email: { type: 'string', format: 'email', description: 'Notify when ingestion completes' }
      },
      additionalProperties: false
    },
    handler: catalogIngestion,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  payment_link: {
    name: 'payment_link',
    description: 'Generate a payment gateway redirection link for onboarding or checkout',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['amount', 'currency', 'return_url'],
      properties: {
        amount: { type: 'number', minimum: 0.01 },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        return_url: { type: 'string', format: 'uri' }
      },
      additionalProperties: false
    },
    handler: paymentLink,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 20, max_calls_per_hour: 200 },
  },
  inventory_sync: {
    name: 'inventory_sync',
    description: 'Sync inventory data from external sources',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['source'],
      properties: {
        source: { type: 'string', description: 'External inventory source (API, file, etc.)' }
      },
      additionalProperties: false
    },
    handler: inventorySync,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  product_detail: {
    name: 'product_detail',
    description: 'Fetch product details for a given product_id',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['product_id'],
      properties: {
        product_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: productDetail,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 30, max_calls_per_hour: 300 },
  },
  order_tracking: {
    name: 'order_tracking',
    description: 'Track order status for a given order_id',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: orderTracking,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 30, max_calls_per_hour: 300 },
  },
  returns_and_refunds: {
    name: 'returns_and_refunds',
    description: 'Handle returns and refunds for orders',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: returnsAndRefunds,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  abandoned_cart_recovery: {
    name: 'abandoned_cart_recovery',
    description: 'Recover abandoned carts by sending reminders',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: abandonedCartRecovery,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  fraud_check: {
    name: 'fraud_check',
    description: 'Check for fraudulent activity in orders',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: fraudCheck,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  product_review_summary: {
    name: 'product_review_summary',
    description: 'Summarize product reviews',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: productReviewSummary,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  personalized_recommendation: {
    name: 'personalized_recommendation',
    description: 'Recommend products based on user profile',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: personalizedRecommendation,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 20, max_calls_per_hour: 200 },
  },
  size_and_fit_recommender: {
    name: 'size_and_fit_recommender',
    description: 'Recommend size and fit for apparel',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: sizeAndFitRecommender,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  bundle_and_bogo_engine: {
    name: 'bundle_and_bogo_engine',
    description: 'Suggest bundles and BOGO offers',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: bundleAndBogoEngine,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  check_availability_realtime: {
    name: 'check_availability_realtime',
    description: 'Check real-time product availability',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: checkAvailabilityRealtime,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 30, max_calls_per_hour: 300 },
  },
  add_to_cart: {
    name: 'add_to_cart',
    description: 'Add product to cart',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: addToCart,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 30, max_calls_per_hour: 300 },
  },
  initiate_checkout: {
    name: 'initiate_checkout',
    description: 'Initiate checkout process',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: initiateCheckout,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 20, max_calls_per_hour: 200 },
  },
  subscription_and_replenishment: {
    name: 'subscription_and_replenishment',
    description: 'Manage subscriptions and replenishment',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: subscriptionAndReplenishment,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  explain_recommendation: {
    name: 'explain_recommendation',
    description: 'Explain why a recommendation was made',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: explainRecommendation,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  website_navigation: {
    name: 'website_navigation',
    description: 'Guide user through website navigation',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: websiteNavigation,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 20, max_calls_per_hour: 200 },
  },
  compare_price_across_sellers: {
    name: 'compare_price_across_sellers',
    description: 'Compare product prices across sellers',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: comparePriceAcrossSellers,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
  analytics_insight_generator: {
    name: 'analytics_insight_generator',
    description: 'Generate analytics insights for the store',
    version: '1.0.0',
    parameters_schema: {
      type: 'object',
      required: ['cart_id'],
      properties: {
        cart_id: { type: 'string' }
      },
      additionalProperties: false
    },
    handler: analyticsInsightGenerator,
    requires_trial_token: false,
    rate_limit: { max_calls_per_minute: 10, max_calls_per_hour: 100 },
  },
};

export function getEcomToolDefinition(toolName: string) {
  return ECOM_TOOLS[toolName] || null;
}

export function isValidEcomTool(toolName: string): boolean {
  return toolName in ECOM_TOOLS;
}

export function getAllEcomToolNames(): string[] {
  return Object.keys(ECOM_TOOLS);
}
