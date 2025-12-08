/**
 * E-commerce Platform Types
 * 
 * Unified types for multi-platform e-commerce integrations.
 * Supports Shopify, WooCommerce, Framer Commerce, Wix Studio.
 */

export interface PlatformCredentials {
  platform: 'shopify' | 'woocommerce' | 'framer' | 'wix';
  apiKey: string;
  apiSecret?: string;
  storeUrl: string;
  accessToken?: string;
  webhookSecret?: string;
}

export interface PlatformProduct {
  id: string;
  platformId: string;
  platform: string;
  title: string;
  description: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags: string[];
  handle: string;
  status: 'active' | 'archived' | 'draft';
  variants: ProductVariant[];
  images: ProductImage[];
  options: ProductOption[];
  metafields?: Record<string, unknown>;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariant {
  id: string;
  platformId: string;
  title: string;
  sku?: string;
  barcode?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  weight?: number;
  weightUnit?: 'kg' | 'lb' | 'oz' | 'g';
  inventoryQuantity: number;
  inventoryPolicy: 'deny' | 'continue';
  fulfillmentService?: string;
  requiresShipping: boolean;
  taxable: boolean;
  imageId?: string;
  options: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImage {
  id: string;
  platformId: string;
  src: string;
  altText?: string;
  width?: number;
  height?: number;
  position: number;
  variantIds?: string[];
}

export interface ProductOption {
  id: string;
  name: string;
  position: number;
  values: string[];
}

export interface InventoryLevel {
  variantId: string;
  locationId: string;
  available: number;
  onHand?: number;
  committed?: number;
  incoming?: number;
  updatedAt: Date;
}

export interface InventoryLocation {
  id: string;
  platformId: string;
  name: string;
  address?: Address;
  isActive: boolean;
  fulfillsOnlineOrders: boolean;
}

export interface Address {
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  provinceCode?: string;
  country: string;
  countryCode: string;
  zip: string;
  phone?: string;
}

export interface PlatformOrder {
  id: string;
  platformId: string;
  platform: string;
  orderNumber: string;
  name: string;
  email: string;
  phone?: string;
  financialStatus: 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'partially_refunded' | 'refunded' | 'voided';
  fulfillmentStatus: 'unfulfilled' | 'partial' | 'fulfilled' | 'restocked';
  currency: string;
  subtotalPrice: number;
  totalTax: number;
  totalDiscounts: number;
  totalPrice: number;
  lineItems: OrderLineItem[];
  shippingAddress?: Address;
  billingAddress?: Address;
  shippingLines: ShippingLine[];
  discountCodes: DiscountCode[];
  note?: string;
  tags: string[];
  cancelledAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderLineItem {
  id: string;
  platformId: string;
  productId: string;
  variantId: string;
  title: string;
  variantTitle?: string;
  sku?: string;
  quantity: number;
  price: number;
  totalDiscount: number;
  taxLines: TaxLine[];
  fulfillmentStatus: 'fulfilled' | 'partial' | 'not_eligible' | null;
  properties?: Record<string, string>;
}

export interface ShippingLine {
  id: string;
  title: string;
  price: number;
  code?: string;
  source?: string;
}

export interface TaxLine {
  title: string;
  price: number;
  rate: number;
}

export interface DiscountCode {
  code: string;
  amount: number;
  type: 'fixed_amount' | 'percentage' | 'shipping';
}

export interface PlatformCustomer {
  id: string;
  platformId: string;
  platform: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  verifiedEmail: boolean;
  taxExempt: boolean;
  currency?: string;
  tags: string[];
  defaultAddress?: Address;
  addresses: Address[];
  ordersCount: number;
  totalSpent: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformCollection {
  id: string;
  platformId: string;
  title: string;
  description?: string;
  handle: string;
  image?: ProductImage;
  productsCount: number;
  sortOrder?: string;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookPayload {
  topic: string;
  shopDomain: string;
  payload: unknown;
  timestamp: Date;
  hmac?: string;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: SyncError[];
  lastSyncedAt: Date;
}

export interface SyncError {
  itemId: string;
  itemType: string;
  error: string;
  timestamp: Date;
}

export interface PlatformConfig {
  credentials: PlatformCredentials;
  syncInterval?: number; // in minutes
  webhooksEnabled: boolean;
  inventorySync: boolean;
  orderSync: boolean;
  customerSync: boolean;
  autoFulfillment: boolean;
}

// Rate limiting types for API calls
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

// Pagination types
export interface PaginatedResult<T> {
  items: T[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
  totalCount?: number;
}

export interface PaginationParams {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
}
