/**
 * Framer Commerce Connector
 * 
 * Integration with Framer's e-commerce capabilities.
 * Framer uses a REST API for commerce features.
 */

import { BasePlatformConnector } from './base-connector';
import {
  PlatformCredentials,
  PlatformProduct,
  PlatformOrder,
  PlatformCustomer,
  PlatformCollection,
  InventoryLevel,
  InventoryLocation,
  PaginatedResult,
  PaginationParams,
  WebhookPayload,
} from './types';

interface FramerProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  compareAtPrice?: number;
  images: Array<{ id: string; url: string; alt?: string }>;
  variants: FramerVariant[];
  categories: string[];
  inventory: number;
  available: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FramerVariant {
  id: string;
  name: string;
  sku?: string;
  price: number;
  inventory: number;
  options: Record<string, string>;
}

interface FramerOrder {
  id: string;
  orderNumber: string;
  status: string;
  email: string;
  total: number;
  subtotal: number;
  tax: number;
  shipping: number;
  currency: string;
  items: FramerOrderItem[];
  shippingAddress: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    country: string;
    zip: string;
    phone?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface FramerOrderItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
  price: number;
}

export class FramerConnector extends BasePlatformConnector {
  private apiBase: string;

  constructor(credentials: PlatformCredentials) {
    super(credentials);
    this.apiBase = `https://api.framer.com/v1/sites/${credentials.storeUrl}/commerce`;
  }

  get platformName(): string {
    return 'framer';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await this.rateLimitWait();

    const response = await fetch(`${this.apiBase}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.credentials.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Framer API error: ${response.status} ${response.statusText}`);
    }

    // Update rate limits
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const limit = response.headers.get('X-RateLimit-Limit');
    const reset = response.headers.get('X-RateLimit-Reset');
    
    if (remaining && limit && reset) {
      this.rateLimitInfo = {
        remaining: parseInt(remaining),
        limit: parseInt(limit),
        resetAt: new Date(parseInt(reset) * 1000),
      };
    }

    return response.json() as Promise<T>;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.request('/info');
      return true;
    } catch {
      return false;
    }
  }

  async getProducts(params?: PaginationParams): Promise<PaginatedResult<PlatformProduct>> {
    const limit = params?.first || 50;
    const cursor = params?.after || '';

    const data = await this.request<{
      products: FramerProduct[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
      total: number;
    }>(`/products?limit=${limit}&cursor=${cursor}`);

    return {
      items: data.products.map(p => this.mapProduct(p)),
      pageInfo: {
        hasNextPage: data.pageInfo.hasNextPage,
        hasPreviousPage: !!cursor,
        endCursor: data.pageInfo.endCursor,
      },
      totalCount: data.total,
    };
  }

  async getProductById(id: string): Promise<PlatformProduct | null> {
    try {
      const product = await this.request<FramerProduct>(`/products/${id}`);
      return this.mapProduct(product);
    } catch {
      return null;
    }
  }

  async searchProducts(query: string, limit: number = 10): Promise<PlatformProduct[]> {
    const data = await this.request<{ products: FramerProduct[] }>(
      `/products?search=${encodeURIComponent(query)}&limit=${limit}`
    );
    return data.products.map(p => this.mapProduct(p));
  }

  async getOrders(params?: PaginationParams & { status?: string }): Promise<PaginatedResult<PlatformOrder>> {
    const limit = params?.first || 50;
    const cursor = params?.after || '';
    const status = params?.status ? `&status=${params.status}` : '';

    const data = await this.request<{
      orders: FramerOrder[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
      total: number;
    }>(`/orders?limit=${limit}&cursor=${cursor}${status}`);

    return {
      items: data.orders.map(o => this.mapOrder(o)),
      pageInfo: {
        hasNextPage: data.pageInfo.hasNextPage,
        hasPreviousPage: !!cursor,
        endCursor: data.pageInfo.endCursor,
      },
      totalCount: data.total,
    };
  }

  async getOrderById(id: string): Promise<PlatformOrder | null> {
    try {
      const order = await this.request<FramerOrder>(`/orders/${id}`);
      return this.mapOrder(order);
    } catch {
      return null;
    }
  }

  async getCustomers(_params?: PaginationParams): Promise<PaginatedResult<PlatformCustomer>> {
    // Framer doesn't have a dedicated customers endpoint
    // Customers are derived from orders
    return {
      items: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
    };
  }

  async getCustomerById(_id: string): Promise<PlatformCustomer | null> {
    return null;
  }

  async getCollections(params?: PaginationParams): Promise<PaginatedResult<PlatformCollection>> {
    const limit = params?.first || 50;
    const cursor = params?.after || '';

    const data = await this.request<{
      categories: Array<{ id: string; name: string; slug: string; productCount: number }>;
      pageInfo: { hasNextPage: boolean; endCursor: string };
    }>(`/categories?limit=${limit}&cursor=${cursor}`);

    return {
      items: data.categories.map(c => ({
        id: c.id,
        platformId: c.id,
        title: c.name,
        handle: c.slug,
        productsCount: c.productCount,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      pageInfo: {
        hasNextPage: data.pageInfo.hasNextPage,
        hasPreviousPage: !!cursor,
        endCursor: data.pageInfo.endCursor,
      },
    };
  }

  async getInventoryLevels(variantIds: string[]): Promise<InventoryLevel[]> {
    const levels: InventoryLevel[] = [];

    for (const variantId of variantIds) {
      try {
        const product = await this.request<FramerProduct>(`/products/${variantId}`);
        levels.push({
          variantId,
          locationId: 'default',
          available: product.inventory,
          updatedAt: new Date(product.updatedAt),
        });
      } catch {
        // Skip if not found
      }
    }

    return levels;
  }

  async getLocations(): Promise<InventoryLocation[]> {
    return [{
      id: 'default',
      platformId: 'default',
      name: 'Framer Store',
      isActive: true,
      fulfillsOnlineOrders: true,
    }];
  }

  async updateInventory(variantId: string, _locationId: string, quantity: number): Promise<boolean> {
    try {
      await this.request(`/products/${variantId}/inventory`, {
        method: 'PUT',
        body: JSON.stringify({ inventory: quantity }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    console.log(`Framer webhook: ${payload.topic}`, payload.payload);
  }

  private mapProduct(product: FramerProduct): PlatformProduct {
    return {
      id: product.id,
      platformId: product.id,
      platform: 'framer',
      title: product.name,
      description: product.description,
      handle: product.slug,
      tags: product.categories,
      status: product.available ? 'active' : 'archived',
      options: [],
      images: product.images.map((img, idx) => ({
        id: img.id,
        platformId: img.id,
        src: img.url,
        altText: img.alt,
        position: idx,
      })),
      variants: product.variants.length > 0
        ? product.variants.map(v => ({
            id: v.id,
            platformId: v.id,
            title: v.name,
            sku: v.sku,
            price: v.price,
            currency: product.currency,
            inventoryQuantity: v.inventory,
            inventoryPolicy: 'deny' as const,
            requiresShipping: true,
            taxable: true,
            options: v.options,
            createdAt: new Date(product.createdAt),
            updatedAt: new Date(product.updatedAt),
          }))
        : [{
            id: product.id,
            platformId: product.id,
            title: 'Default',
            price: product.price,
            compareAtPrice: product.compareAtPrice,
            currency: product.currency,
            inventoryQuantity: product.inventory,
            inventoryPolicy: 'deny' as const,
            requiresShipping: true,
            taxable: true,
            options: {},
            createdAt: new Date(product.createdAt),
            updatedAt: new Date(product.updatedAt),
          }],
      createdAt: new Date(product.createdAt),
      updatedAt: new Date(product.updatedAt),
    };
  }

  private mapOrder(order: FramerOrder): PlatformOrder {
    const statusMap: Record<string, PlatformOrder['financialStatus']> = {
      'pending': 'pending',
      'paid': 'paid',
      'refunded': 'refunded',
      'cancelled': 'voided',
    };

    return {
      id: order.id,
      platformId: order.id,
      platform: 'framer',
      orderNumber: order.orderNumber,
      name: `#${order.orderNumber}`,
      email: order.email,
      financialStatus: statusMap[order.status] || 'pending',
      fulfillmentStatus: 'unfulfilled',
      currency: order.currency,
      subtotalPrice: order.subtotal,
      totalTax: order.tax,
      totalDiscounts: 0,
      totalPrice: order.total,
      lineItems: order.items.map(item => ({
        id: item.id,
        platformId: item.id,
        productId: item.productId,
        variantId: item.variantId || item.productId,
        title: item.name,
        quantity: item.quantity,
        price: item.price,
        totalDiscount: 0,
        taxLines: [],
        fulfillmentStatus: null,
      })),
      shippingAddress: {
        address1: order.shippingAddress.address1,
        address2: order.shippingAddress.address2,
        city: order.shippingAddress.city,
        province: order.shippingAddress.state,
        country: order.shippingAddress.country,
        countryCode: order.shippingAddress.country,
        zip: order.shippingAddress.zip,
        phone: order.shippingAddress.phone,
      },
      shippingLines: [{
        id: 'shipping',
        title: 'Shipping',
        price: order.shipping,
      }],
      discountCodes: [],
      tags: [],
      createdAt: new Date(order.createdAt),
      updatedAt: new Date(order.updatedAt),
    };
  }
}
