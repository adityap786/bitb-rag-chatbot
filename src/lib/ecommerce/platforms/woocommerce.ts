/**
 * WooCommerce Platform Connector
 * 
 * Production-ready integration with WooCommerce REST API v3.
 * Supports authentication via consumer key/secret.
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
import crypto from 'crypto';

interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  manage_stock: boolean;
  categories: Array<{ id: number; name: string; slug: string }>;
  tags: Array<{ id: number; name: string; slug: string }>;
  images: Array<{ id: number; src: string; name: string; alt: string }>;
  attributes: Array<{ id: number; name: string; position: number; options: string[] }>;
  variations: number[];
  date_created: string;
  date_modified: string;
  meta_data: Array<{ id: number; key: string; value: string }>;
}

interface WooCommerceVariation {
  id: number;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  stock_status: string;
  manage_stock: boolean;
  weight: string;
  dimensions: { length: string; width: string; height: string };
  attributes: Array<{ id: number; name: string; option: string }>;
  image: { id: number; src: string; name: string; alt: string };
  date_created: string;
  date_modified: string;
}

interface WooCommerceOrder {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  subtotal: string;
  total_tax: string;
  discount_total: string;
  shipping_total: string;
  customer_id: number;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    subtotal: string;
    total: string;
    total_tax: string;
    sku: string;
    price: number;
  }>;
  shipping_lines: Array<{
    id: number;
    method_title: string;
    method_id: string;
    total: string;
  }>;
  coupon_lines: Array<{
    id: number;
    code: string;
    discount: string;
  }>;
  customer_note: string;
  date_created: string;
  date_modified: string;
}

interface WooCommerceCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  orders_count: number;
  total_spent: string;
  date_created: string;
  date_modified: string;
}

interface WooCommerceCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  count: number;
  image: { id: number; src: string; name: string; alt: string } | null;
}

export class WooCommerceConnector extends BasePlatformConnector {
  private apiBase: string;

  constructor(credentials: PlatformCredentials) {
    super(credentials);
    // Ensure storeUrl doesn't have trailing slash
    const baseUrl = credentials.storeUrl.replace(/\/$/, '');
    this.apiBase = `${baseUrl}/wp-json/wc/v3`;
  }

  get platformName(): string {
    return 'woocommerce';
  }

  private getAuthHeader(): string {
    const credentials = `${this.credentials.apiKey}:${this.credentials.apiSecret}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T; headers: Headers }> {
    await this.rateLimitWait();

    const url = `${this.apiBase}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
    }

    // Parse rate limit headers
    const remaining = response.headers.get('X-WP-TotalPages');
    if (remaining) {
      this.rateLimitInfo = {
        limit: 100,
        remaining: parseInt(remaining),
        resetAt: new Date(Date.now() + 60000),
      };
    }

    const data = await response.json() as T;
    return { data, headers: response.headers };
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.request('/system_status');
      return true;
    } catch {
      return false;
    }
  }

  async getProducts(params?: PaginationParams): Promise<PaginatedResult<PlatformProduct>> {
    const page = params?.after ? parseInt(params.after) + 1 : 1;
    const perPage = params?.first || 50;

    const { data, headers } = await this.request<WooCommerceProduct[]>(
      `/products?page=${page}&per_page=${perPage}`
    );

    const totalPages = parseInt(headers.get('X-WP-TotalPages') || '1');
    const total = parseInt(headers.get('X-WP-Total') || '0');

    const products = await Promise.all(
      data.map(async (product) => {
        // Fetch variations if product has them
        let variations: WooCommerceVariation[] = [];
        if (product.variations.length > 0) {
          const { data: vars } = await this.request<WooCommerceVariation[]>(
            `/products/${product.id}/variations?per_page=100`
          );
          variations = vars;
        }
        return this.mapProduct(product, variations);
      })
    );

    return {
      items: products,
      pageInfo: {
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        startCursor: String(page),
        endCursor: String(page),
      },
      totalCount: total,
    };
  }

  async getProductById(id: string): Promise<PlatformProduct | null> {
    try {
      const { data: product } = await this.request<WooCommerceProduct>(`/products/${id}`);
      
      let variations: WooCommerceVariation[] = [];
      if (product.variations.length > 0) {
        const { data: vars } = await this.request<WooCommerceVariation[]>(
          `/products/${id}/variations?per_page=100`
        );
        variations = vars;
      }
      
      return this.mapProduct(product, variations);
    } catch {
      return null;
    }
  }

  async searchProducts(query: string, limit: number = 10): Promise<PlatformProduct[]> {
    const { data } = await this.request<WooCommerceProduct[]>(
      `/products?search=${encodeURIComponent(query)}&per_page=${limit}`
    );

    return Promise.all(data.map(async (product) => {
      let variations: WooCommerceVariation[] = [];
      if (product.variations.length > 0) {
        const { data: vars } = await this.request<WooCommerceVariation[]>(
          `/products/${product.id}/variations?per_page=100`
        );
        variations = vars;
      }
      return this.mapProduct(product, variations);
    }));
  }

  async getOrders(params?: PaginationParams & { status?: string }): Promise<PaginatedResult<PlatformOrder>> {
    const page = params?.after ? parseInt(params.after) + 1 : 1;
    const perPage = params?.first || 50;
    const status = params?.status || 'any';

    const { data, headers } = await this.request<WooCommerceOrder[]>(
      `/orders?page=${page}&per_page=${perPage}&status=${status}`
    );

    const totalPages = parseInt(headers.get('X-WP-TotalPages') || '1');
    const total = parseInt(headers.get('X-WP-Total') || '0');

    return {
      items: data.map(order => this.mapOrder(order)),
      pageInfo: {
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        startCursor: String(page),
        endCursor: String(page),
      },
      totalCount: total,
    };
  }

  async getOrderById(id: string): Promise<PlatformOrder | null> {
    try {
      const { data } = await this.request<WooCommerceOrder>(`/orders/${id}`);
      return this.mapOrder(data);
    } catch {
      return null;
    }
  }

  async getCustomers(params?: PaginationParams): Promise<PaginatedResult<PlatformCustomer>> {
    const page = params?.after ? parseInt(params.after) + 1 : 1;
    const perPage = params?.first || 50;

    const { data, headers } = await this.request<WooCommerceCustomer[]>(
      `/customers?page=${page}&per_page=${perPage}`
    );

    const totalPages = parseInt(headers.get('X-WP-TotalPages') || '1');
    const total = parseInt(headers.get('X-WP-Total') || '0');

    return {
      items: data.map(customer => this.mapCustomer(customer)),
      pageInfo: {
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        startCursor: String(page),
        endCursor: String(page),
      },
      totalCount: total,
    };
  }

  async getCustomerById(id: string): Promise<PlatformCustomer | null> {
    try {
      const { data } = await this.request<WooCommerceCustomer>(`/customers/${id}`);
      return this.mapCustomer(data);
    } catch {
      return null;
    }
  }

  async getCollections(params?: PaginationParams): Promise<PaginatedResult<PlatformCollection>> {
    const page = params?.after ? parseInt(params.after) + 1 : 1;
    const perPage = params?.first || 50;

    const { data, headers } = await this.request<WooCommerceCategory[]>(
      `/products/categories?page=${page}&per_page=${perPage}`
    );

    const totalPages = parseInt(headers.get('X-WP-TotalPages') || '1');
    const total = parseInt(headers.get('X-WP-Total') || '0');

    return {
      items: data.map(category => ({
        id: String(category.id),
        platformId: String(category.id),
        title: category.name,
        description: category.description,
        handle: category.slug,
        productsCount: category.count,
        image: category.image ? {
          id: String(category.image.id),
          platformId: String(category.image.id),
          src: category.image.src,
          altText: category.image.alt,
          position: 0,
        } : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      pageInfo: {
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        startCursor: String(page),
        endCursor: String(page),
      },
      totalCount: total,
    };
  }

  async getInventoryLevels(variantIds: string[]): Promise<InventoryLevel[]> {
    const levels: InventoryLevel[] = [];

    for (const variantId of variantIds) {
      try {
        // WooCommerce stores inventory on products/variations directly
        const { data } = await this.request<WooCommerceVariation | WooCommerceProduct>(
          `/products/${variantId}`
        );

        if (data.manage_stock) {
          levels.push({
            variantId,
            locationId: 'default',
            available: data.stock_quantity || 0,
            updatedAt: new Date(data.date_modified),
          });
        }
      } catch {
        // Skip if variant not found
      }
    }

    return levels;
  }

  async getLocations(): Promise<InventoryLocation[]> {
    // WooCommerce doesn't have native multi-location support
    // Return a default location
    return [{
      id: 'default',
      platformId: 'default',
      name: 'Default Warehouse',
      isActive: true,
      fulfillsOnlineOrders: true,
    }];
  }

  async updateInventory(variantId: string, _locationId: string, quantity: number): Promise<boolean> {
    try {
      await this.request(`/products/${variantId}`, {
        method: 'PUT',
        body: JSON.stringify({
          stock_quantity: quantity,
          manage_stock: true,
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    // Verify webhook signature if secret is set
    if (this.credentials.webhookSecret && payload.hmac) {
      const calculatedHmac = crypto
        .createHmac('sha256', this.credentials.webhookSecret)
        .update(JSON.stringify(payload.payload), 'utf8')
        .digest('base64');

      if (calculatedHmac !== payload.hmac) {
        throw new Error('Invalid webhook signature');
      }
    }

    switch (payload.topic) {
      case 'product.created':
      case 'product.updated':
        console.log(`WooCommerce product webhook: ${payload.topic}`);
        break;
      case 'order.created':
      case 'order.updated':
        console.log(`WooCommerce order webhook: ${payload.topic}`);
        break;
      default:
        console.log(`Unhandled WooCommerce webhook: ${payload.topic}`);
    }
  }

  // Mapping helpers
  private mapProduct(product: WooCommerceProduct, variations: WooCommerceVariation[]): PlatformProduct {
    const statusMap: Record<string, 'active' | 'archived' | 'draft'> = {
      'publish': 'active',
      'draft': 'draft',
      'pending': 'draft',
      'private': 'archived',
      'trash': 'archived',
    };

    return {
      id: String(product.id),
      platformId: String(product.id),
      platform: 'woocommerce',
      title: product.name,
      description: product.description.replace(/<[^>]*>/g, ''), // Strip HTML
      descriptionHtml: product.description,
      handle: product.slug,
      productType: product.type,
      tags: product.tags.map(t => t.name),
      status: statusMap[product.status] || 'draft',
      options: product.attributes.map(attr => ({
        id: String(attr.id),
        name: attr.name,
        position: attr.position,
        values: attr.options,
      })),
      images: product.images.map((img, idx) => ({
        id: String(img.id),
        platformId: String(img.id),
        src: img.src,
        altText: img.alt,
        position: idx,
      })),
      variants: variations.length > 0 
        ? variations.map(v => this.mapVariation(v))
        : [{
            id: String(product.id),
            platformId: String(product.id),
            title: 'Default',
            sku: product.sku,
            price: parseFloat(product.price) || 0,
            compareAtPrice: product.regular_price ? parseFloat(product.regular_price) : undefined,
            currency: 'USD',
            inventoryQuantity: product.stock_quantity || 0,
            inventoryPolicy: product.stock_status === 'instock' ? 'continue' : 'deny',
            requiresShipping: true,
            taxable: true,
            options: {},
            createdAt: new Date(product.date_created),
            updatedAt: new Date(product.date_modified),
          }],
      createdAt: new Date(product.date_created),
      updatedAt: new Date(product.date_modified),
    };
  }

  private mapVariation(variation: WooCommerceVariation): PlatformProduct['variants'][0] {
    return {
      id: String(variation.id),
      platformId: String(variation.id),
      title: variation.attributes.map(a => a.option).join(' / '),
      sku: variation.sku,
      price: parseFloat(variation.price) || 0,
      compareAtPrice: variation.regular_price ? parseFloat(variation.regular_price) : undefined,
      currency: 'USD',
      weight: parseFloat(variation.weight) || undefined,
      weightUnit: 'kg',
      inventoryQuantity: variation.stock_quantity || 0,
      inventoryPolicy: variation.stock_status === 'instock' ? 'continue' : 'deny',
      requiresShipping: true,
      taxable: true,
      options: variation.attributes.reduce((acc, attr) => {
        acc[attr.name] = attr.option;
        return acc;
      }, {} as Record<string, string>),
      createdAt: new Date(variation.date_created),
      updatedAt: new Date(variation.date_modified),
    };
  }

  private mapOrder(order: WooCommerceOrder): PlatformOrder {
    const statusMap: Record<string, PlatformOrder['financialStatus']> = {
      'pending': 'pending',
      'processing': 'authorized',
      'on-hold': 'pending',
      'completed': 'paid',
      'cancelled': 'voided',
      'refunded': 'refunded',
      'failed': 'voided',
    };

    const fulfillmentMap: Record<string, PlatformOrder['fulfillmentStatus']> = {
      'pending': 'unfulfilled',
      'processing': 'unfulfilled',
      'on-hold': 'unfulfilled',
      'completed': 'fulfilled',
      'cancelled': 'restocked',
      'refunded': 'restocked',
      'failed': 'unfulfilled',
    };

    return {
      id: String(order.id),
      platformId: String(order.id),
      platform: 'woocommerce',
      orderNumber: order.number,
      name: `#${order.number}`,
      email: order.billing.email,
      phone: order.billing.phone,
      financialStatus: statusMap[order.status] || 'pending',
      fulfillmentStatus: fulfillmentMap[order.status] || 'unfulfilled',
      currency: order.currency,
      subtotalPrice: parseFloat(order.subtotal),
      totalTax: parseFloat(order.total_tax),
      totalDiscounts: parseFloat(order.discount_total),
      totalPrice: parseFloat(order.total),
      lineItems: order.line_items.map(li => ({
        id: String(li.id),
        platformId: String(li.id),
        productId: String(li.product_id),
        variantId: String(li.variation_id || li.product_id),
        title: li.name,
        sku: li.sku,
        quantity: li.quantity,
        price: li.price,
        totalDiscount: 0,
        taxLines: [{
          title: 'Tax',
          price: parseFloat(li.total_tax),
          rate: 0,
        }],
        fulfillmentStatus: null,
      })),
      shippingAddress: {
        address1: order.shipping.address_1,
        address2: order.shipping.address_2,
        city: order.shipping.city,
        province: order.shipping.state,
        country: order.shipping.country,
        countryCode: order.shipping.country,
        zip: order.shipping.postcode,
      },
      billingAddress: {
        address1: order.billing.address_1,
        address2: order.billing.address_2,
        city: order.billing.city,
        province: order.billing.state,
        country: order.billing.country,
        countryCode: order.billing.country,
        zip: order.billing.postcode,
        phone: order.billing.phone,
      },
      shippingLines: order.shipping_lines.map(sl => ({
        id: String(sl.id),
        title: sl.method_title,
        price: parseFloat(sl.total),
        code: sl.method_id,
      })),
      discountCodes: order.coupon_lines.map(cl => ({
        code: cl.code,
        amount: parseFloat(cl.discount),
        type: 'fixed_amount' as const,
      })),
      note: order.customer_note,
      tags: [],
      createdAt: new Date(order.date_created),
      updatedAt: new Date(order.date_modified),
    };
  }

  private mapCustomer(customer: WooCommerceCustomer): PlatformCustomer {
    return {
      id: String(customer.id),
      platformId: String(customer.id),
      platform: 'woocommerce',
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.billing.phone,
      verifiedEmail: true,
      taxExempt: false,
      tags: [],
      ordersCount: customer.orders_count,
      totalSpent: parseFloat(customer.total_spent),
      defaultAddress: {
        address1: customer.billing.address_1,
        address2: customer.billing.address_2,
        city: customer.billing.city,
        province: customer.billing.state,
        country: customer.billing.country,
        countryCode: customer.billing.country,
        zip: customer.billing.postcode,
        phone: customer.billing.phone,
      },
      addresses: [
        {
          address1: customer.billing.address_1,
          address2: customer.billing.address_2,
          city: customer.billing.city,
          province: customer.billing.state,
          country: customer.billing.country,
          countryCode: customer.billing.country,
          zip: customer.billing.postcode,
          phone: customer.billing.phone,
        },
        {
          address1: customer.shipping.address_1,
          address2: customer.shipping.address_2,
          city: customer.shipping.city,
          province: customer.shipping.state,
          country: customer.shipping.country,
          countryCode: customer.shipping.country,
          zip: customer.shipping.postcode,
        },
      ],
      createdAt: new Date(customer.date_created),
      updatedAt: new Date(customer.date_modified),
    };
  }
}
