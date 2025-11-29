/**
 * Multi-Plan Architecture Types
 * Defines types for service-based and e-commerce plan configurations
 */

export type PlanType = 'service' | 'ecommerce';

export type IndustryVertical =
  | 'healthcare'
  | 'legal'
  | 'financial'
  | 'technical'
  | 'retail'
  | 'hospitality'
  | 'education'
  | 'real_estate';

export type EcommercePlatform = 'shopify' | 'woocommerce' | 'bigcommerce' | 'custom';

export interface CalendarIntegration {
  provider: 'google' | 'outlook' | 'calendly' | 'acuity';
  api_key?: string;
  calendar_id?: string;
  webhook_url?: string;
  timezone?: string;
  booking_duration_minutes?: number;
  buffer_minutes?: number;
}

export interface FeatureFlags {
  // Plan 1 (Service) Features
  healthcare_engine?: boolean;
  legal_engine?: boolean;
  financial_engine?: boolean;
  technical_support?: boolean;
  appointment_booking?: boolean;
  consultation_booking?: boolean;

  // Plan 2 (E-commerce) Features
  product_cards?: boolean;
  product_comparison?: boolean;
  cart_management?: boolean;
  checkout_integration?: boolean;
  booking_system?: boolean;
  recommendations?: boolean;
  inventory_tracking?: boolean;
  order_tracking?: boolean;

  // Common Features
  citations?: boolean;
  real_time_streaming?: boolean;
  voice_input?: boolean;
  voice_output?: boolean;
  analytics_dashboard?: boolean;
  a_b_testing?: boolean;
}

export interface TenantPlanConfig {
  id: string;
  plan_type: PlanType;
  industry_vertical?: IndustryVertical;
  ecommerce_platform?: EcommercePlatform;
  ecommerce_api_key?: string;
  ecommerce_api_secret?: string;
  calendar_integration?: CalendarIntegration;
  feature_flags: FeatureFlags;
  created_at: string;
  updated_at: string;
}

export interface Citation {
  id: string;
  tenant_id: string;
  conversation_id: string;
  message_id: string;
  source_title: string;
  source_url: string;
  excerpt: string;
  confidence_score: number; // 0-1
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ProductInteraction {
  id: string;
  tenant_id: string;
  conversation_id: string;
  message_id: string;
  product_id: string;
  product_name: string;
  product_price: number;
  action: 'view' | 'compare' | 'add_to_cart' | 'remove_from_cart' | 'purchase' | 'inquiry';
  metadata: Record<string, any>;
  created_at: string;
}

export interface Booking {
  id: string;
  tenant_id: string;
  conversation_id: string;
  booking_type: 'appointment' | 'consultation' | 'service' | 'demo' | 'trial';
  service_name: string;
  scheduled_at: string;
  duration_minutes: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  notes?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ConversationFeedback {
  id: string;
  tenant_id: string;
  conversation_id: string;
  message_id?: string;
  feedback_type: 'thumbs_up' | 'thumbs_down' | 'flag' | 'rating';
  quality_score?: number; // 0-5
  user_comment?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface VerticalEngineConfig {
  id: string;
  tenant_id: string;
  vertical: IndustryVertical;
  enabled: boolean;
  compliance_rules: Record<string, any>;
  prompt_templates: Record<string, string>;
  api_integrations: Record<string, any>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Product Card Types for E-commerce
export interface ProductCard {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image_url: string;
  images?: string[];
  rating?: number;
  reviews_count?: number;
  in_stock: boolean;
  stock_quantity?: number;
  variants?: ProductVariant[];
  url: string;
  sku?: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  sku?: string;
  in_stock: boolean;
  attributes: Record<string, string>; // e.g., { size: "M", color: "Blue" }
}

export interface ProductComparison {
  products: ProductCard[];
  comparison_attributes: string[];
  winner_by_attribute: Record<string, string>; // attribute -> product_id
}

// Booking Request Types
export interface BookingRequest {
  service_name: string;
  preferred_date?: string;
  preferred_time?: string;
  duration_minutes?: number;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  notes?: string;
}

export interface BookingAvailability {
  date: string;
  available_slots: TimeSlot[];
}

export interface TimeSlot {
  start_time: string; // ISO 8601
  end_time: string;
  available: boolean;
  booking_id?: string;
}

// Cart Management Types
export interface CartItem {
  product_id: string;
  variant_id?: string;
  quantity: number;
  price: number;
  product: ProductCard;
}

export interface Cart {
  id: string;
  tenant_id: string;
  conversation_id: string;
  items: CartItem[];
  subtotal: number;
  tax?: number;
  shipping?: number;
  total: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

// Recommendation Types
export interface ProductRecommendation {
  product: ProductCard;
  score: number; // 0-1 relevance score
  reason: string; // "Based on your interest in...", "Popular choice", etc.
  type: 'upsell' | 'cross_sell' | 'trending' | 'personalized';
}
