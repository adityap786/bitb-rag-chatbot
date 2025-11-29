/**
 * Wix Studio (Wix Stores) Commerce Connector
 * 
 * Production-ready integration with Wix Stores API.
 * Uses OAuth2 for authentication.
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

const WIX_API_BASE = 'https://www.wixapis.com';

interface WixProduct {
  id: string;
  name: string;
  slug: string;
  visible: boolean;
  productType: string;
  description: string;
  sku: string;
  weight: number;
  stock: {
    inStock: boolean;
    quantity: number;
    trackInventory: boolean;
  };
  price: {
    currency: string;
    price: number;
    discountedPrice?: number;
    formatted: { price: string; discountedPrice?: string };
  };
  priceData: {
    currency: string;
    price: number;
    discountedPrice?: number;
  };
  convertedPriceData?: {
    currency: string;
    price: number;
  };
  productOptions: Array<{
    name: string;
    choices: Array<{ value: string; description: string }>;
  }>;
  productPageUrl: { base: string; path: string };
  numericId: string;
  inventoryItemId: string;
  discount?: { type: string; value: number };
  collectionIds: string[];
  variants: WixVariant[];
  media: {
    mainMedia: { image: { url: string; width: number; height: number } };
    items: Array<{ image: { url: string; width: number; height: number } }>;
  };
  createdDate: string;
  lastUpdated: string;
}

interface WixVariant {
  id: string;
  choices: Record<string, string>;
  variant: {
    priceData: { currency: string; price: number; discountedPrice?: number };
    convertedPriceData?: { currency: string; price: number };
    weight: number;
    sku: string;
    visible: boolean;
  };
  stock: {
    trackQuantity: boolean;
    quantity: number;
    inStock: boolean;
  };
}

interface WixOrder {
  id: string;
  number: number;
  createdDate: string;
  updatedDate: string;
  buyerInfo: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  paymentStatus: string;
  fulfillmentStatus: string;
  lineItems: Array<{
    id: string;
    productId: string;
    name: string;
    quantity: number;
    price: string;
    totalPrice: string;
    sku: string;
    options: Array<{ option: string; selection: string }>;
    mediaItem?: { url: string };
  }>;
  totals: {
    subtotal: string;
    shipping: string;
    tax: string;
    discount: string;
    total: string;
    weight: string;
    quantity: number;
  };
  billingInfo: {
    address: WixAddress;
    paymentMethod: string;
  };
  shippingInfo: {
    deliveryOption: string;
    shipmentDetails: {
      address: WixAddress;
    };
  };
  activities: Array<{
    type: string;
    timestamp: string;
  }>;
  currency: string;
}

interface WixAddress {
  fullName?: { firstName: string; lastName: string };
  email?: string;
  phone?: string;
  address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    subdivision?: string;
    country: string;
    postalCode: string;
  };
}

interface WixCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  addresses: WixAddress[];
  createdDate: string;
}

interface WixCollection {
  id: string;
  name: string;
  slug: string;
  visible: boolean;
  numberOfProducts: number;
  media?: {
    mainMedia?: { image: { url: string } };
  };
}

interface WixLocation {
  id: string;
  name: string;
  description?: string;
  default: boolean;
  address?: {
    addressLine1: string;
    city: string;
    country: string;
  };
}

export class WixConnector extends BasePlatformConnector {
  private siteId: string;

  constructor(credentials: PlatformCredentials) {
    super(credentials);
    this.siteId = credentials.storeUrl;
  }

  get platformName(): string {
    return 'wix';
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.rateLimitWait();

    const response = await fetch(`${WIX_API_BASE}${path}`, {
      ...options,
      headers: {
        'Authorization': this.credentials.accessToken || this.credentials.apiKey,
        'wix-site-id': this.siteId,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Wix API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Parse rate limit headers
    const remaining = response.headers.get('X-Wix-Rate-Limit-Remaining');
    if (remaining) {
      this.rateLimitInfo = {
        remaining: parseInt(remaining),
        limit: 100,
        resetAt: new Date(Date.now() + 60000),
      };
    }

    return response.json() as Promise<T>;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.request('/stores/v1/products/query', {
        method: 'POST',
        body: JSON.stringify({
          query: { paging: { limit: 1 } },
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async getProducts(params?: PaginationParams): Promise<PaginatedResult<PlatformProduct>> {
    const limit = params?.first || 50;
    const cursor = params?.after;

    const response = await this.request<{
      products: WixProduct[];
      metadata: { count: number; cursors?: { next?: string; prev?: string } };
    }>('/stores/v1/products/query', {
      method: 'POST',
      body: JSON.stringify({
        query: {
          paging: { limit, ...(cursor && { cursor }) },
        },
        includeVariants: true,
      }),
    });

    return {
      items: response.products.map(p => this.mapProduct(p)),
      pageInfo: {
        hasNextPage: !!response.metadata.cursors?.next,
        hasPreviousPage: !!response.metadata.cursors?.prev,
        startCursor: cursor,
        endCursor: response.metadata.cursors?.next,
      },
      totalCount: response.metadata.count,
    };
  }

  async getProductById(id: string): Promise<PlatformProduct | null> {
    try {
      const response = await this.request<{ product: WixProduct }>(
        `/stores/v1/products/${id}?includeVariants=true`
      );
      return this.mapProduct(response.product);
    } catch {
      return null;
    }
  }

  async searchProducts(query: string, limit: number = 10): Promise<PlatformProduct[]> {
    const response = await this.request<{ products: WixProduct[] }>(
      '/stores/v1/products/query',
      {
        method: 'POST',
        body: JSON.stringify({
          query: {
            filter: { name: { $contains: query } },
            paging: { limit },
          },
          includeVariants: true,
        }),
      }
    );

    return response.products.map(p => this.mapProduct(p));
  }

  async getOrders(params?: PaginationParams & { status?: string }): Promise<PaginatedResult<PlatformOrder>> {
    const limit = params?.first || 50;
    const cursor = params?.after;

    interface OrderFilter {
      paymentStatus?: { $eq: string };
    }

    const filter: OrderFilter = {};
    if (params?.status) {
      filter.paymentStatus = { $eq: params.status.toUpperCase() };
    }

    const response = await this.request<{
      orders: WixOrder[];
      metadata: { count: number; cursors?: { next?: string } };
    }>('/ecom/v1/orders/query', {
      method: 'POST',
      body: JSON.stringify({
        query: {
          filter,
          paging: { limit, ...(cursor && { cursor }) },
          sort: [{ fieldName: 'createdDate', order: 'DESC' }],
        },
      }),
    });

    return {
      items: response.orders.map(o => this.mapOrder(o)),
      pageInfo: {
        hasNextPage: !!response.metadata.cursors?.next,
        hasPreviousPage: !!cursor,
        endCursor: response.metadata.cursors?.next,
      },
      totalCount: response.metadata.count,
    };
  }

  async getOrderById(id: string): Promise<PlatformOrder | null> {
    try {
      const response = await this.request<{ order: WixOrder }>(
        `/ecom/v1/orders/${id}`
      );
      return this.mapOrder(response.order);
    } catch {
      return null;
    }
  }

  async getCustomers(params?: PaginationParams): Promise<PaginatedResult<PlatformCustomer>> {
    const limit = params?.first || 50;
    const cursor = params?.after;

    const response = await this.request<{
      contacts: WixCustomer[];
      pagingMetadata: { count: number; cursors?: { next?: string } };
    }>('/contacts/v4/contacts/query', {
      method: 'POST',
      body: JSON.stringify({
        query: {
          paging: { limit, ...(cursor && { cursor }) },
        },
      }),
    });

    return {
      items: response.contacts.map(c => this.mapCustomer(c)),
      pageInfo: {
        hasNextPage: !!response.pagingMetadata.cursors?.next,
        hasPreviousPage: !!cursor,
        endCursor: response.pagingMetadata.cursors?.next,
      },
      totalCount: response.pagingMetadata.count,
    };
  }

  async getCustomerById(id: string): Promise<PlatformCustomer | null> {
    try {
      const response = await this.request<{ contact: WixCustomer }>(
        `/contacts/v4/contacts/${id}`
      );
      return this.mapCustomer(response.contact);
    } catch {
      return null;
    }
  }

  async getCollections(params?: PaginationParams): Promise<PaginatedResult<PlatformCollection>> {
    const limit = params?.first || 50;
    const cursor = params?.after;

    const response = await this.request<{
      collections: WixCollection[];
      metadata: { count: number; cursors?: { next?: string } };
    }>('/stores/v1/collections/query', {
      method: 'POST',
      body: JSON.stringify({
        query: {
          paging: { limit, ...(cursor && { cursor }) },
        },
      }),
    });

    return {
      items: response.collections.map(c => ({
        id: c.id,
        platformId: c.id,
        title: c.name,
        handle: c.slug,
        productsCount: c.numberOfProducts,
        image: c.media?.mainMedia?.image ? {
          id: c.id,
          platformId: c.id,
          src: c.media.mainMedia.image.url,
          position: 0,
        } : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      pageInfo: {
        hasNextPage: !!response.metadata.cursors?.next,
        hasPreviousPage: !!cursor,
        endCursor: response.metadata.cursors?.next,
      },
      totalCount: response.metadata.count,
    };
  }

  async getInventoryLevels(variantIds: string[]): Promise<InventoryLevel[]> {
    const response = await this.request<{
      inventoryItems: Array<{
        id: string;
        productId: string;
        variantId: string;
        trackQuantity: boolean;
        variants: Array<{
          variantId: string;
          inStock: boolean;
          quantity: number;
        }>;
        lastUpdated: string;
      }>;
    }>('/stores/v1/inventoryItems/query', {
      method: 'POST',
      body: JSON.stringify({
        query: {
          filter: {
            variantId: { $in: variantIds },
          },
        },
      }),
    });

    return response.inventoryItems.flatMap(item =>
      item.variants.map(v => ({
        variantId: v.variantId,
        locationId: 'default',
        available: v.quantity,
        updatedAt: new Date(item.lastUpdated),
      }))
    );
  }

  async getLocations(): Promise<InventoryLocation[]> {
    try {
      const response = await this.request<{ locations: WixLocation[] }>(
        '/stores/v1/inventoryLocations'
      );

      return response.locations.map(loc => ({
        id: loc.id,
        platformId: loc.id,
        name: loc.name,
        isActive: true,
        fulfillsOnlineOrders: loc.default,
        address: loc.address ? {
          address1: loc.address.addressLine1,
          city: loc.address.city,
          country: loc.address.country,
          countryCode: loc.address.country,
          zip: '',
        } : undefined,
      }));
    } catch {
      return [{
        id: 'default',
        platformId: 'default',
        name: 'Default Location',
        isActive: true,
        fulfillsOnlineOrders: true,
      }];
    }
  }

  async updateInventory(variantId: string, _locationId: string, quantity: number): Promise<boolean> {
    try {
      await this.request('/stores/v1/inventoryItems/update', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItem: {
            variantId,
            trackQuantity: true,
            variants: [{
              variantId,
              quantity,
              inStock: quantity > 0,
            }],
          },
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    console.log(`Wix webhook: ${payload.topic}`, payload.payload);
  }

  private mapProduct(product: WixProduct): PlatformProduct {
    return {
      id: product.id,
      platformId: product.id,
      platform: 'wix',
      title: product.name,
      description: product.description.replace(/<[^>]*>/g, ''),
      descriptionHtml: product.description,
      handle: product.slug,
      productType: product.productType,
      tags: [],
      status: product.visible ? 'active' : 'draft',
      options: product.productOptions.map((opt, idx) => ({
        id: String(idx),
        name: opt.name,
        position: idx,
        values: opt.choices.map(c => c.value),
      })),
      images: product.media?.items?.map((img, idx) => ({
        id: String(idx),
        platformId: String(idx),
        src: img.image.url,
        width: img.image.width,
        height: img.image.height,
        position: idx,
      })) || [],
      variants: product.variants?.length > 0
        ? product.variants.map(v => ({
            id: v.id,
            platformId: v.id,
            title: Object.values(v.choices).join(' / '),
            sku: v.variant.sku,
            price: v.variant.priceData.price,
            compareAtPrice: v.variant.priceData.discountedPrice,
            currency: v.variant.priceData.currency,
            weight: v.variant.weight,
            inventoryQuantity: v.stock.quantity,
            inventoryPolicy: v.stock.trackQuantity ? 'deny' : 'continue' as const,
            requiresShipping: true,
            taxable: true,
            options: v.choices,
            createdAt: new Date(product.createdDate),
            updatedAt: new Date(product.lastUpdated),
          }))
        : [{
            id: product.id,
            platformId: product.id,
            title: 'Default',
            sku: product.sku,
            price: product.priceData.price,
            compareAtPrice: product.priceData.discountedPrice,
            currency: product.priceData.currency,
            weight: product.weight,
            inventoryQuantity: product.stock.quantity,
            inventoryPolicy: product.stock.trackInventory ? 'deny' : 'continue' as const,
            requiresShipping: true,
            taxable: true,
            options: {},
            createdAt: new Date(product.createdDate),
            updatedAt: new Date(product.lastUpdated),
          }],
      createdAt: new Date(product.createdDate),
      updatedAt: new Date(product.lastUpdated),
    };
  }

  private mapOrder(order: WixOrder): PlatformOrder {
    const financialStatusMap: Record<string, PlatformOrder['financialStatus']> = {
      'NOT_PAID': 'pending',
      'PENDING': 'pending',
      'PAID': 'paid',
      'PARTIALLY_REFUNDED': 'partially_refunded',
      'FULLY_REFUNDED': 'refunded',
    };

    const fulfillmentStatusMap: Record<string, PlatformOrder['fulfillmentStatus']> = {
      'NOT_FULFILLED': 'unfulfilled',
      'PARTIALLY_FULFILLED': 'partial',
      'FULFILLED': 'fulfilled',
    };

    return {
      id: order.id,
      platformId: order.id,
      platform: 'wix',
      orderNumber: String(order.number),
      name: `#${order.number}`,
      email: order.buyerInfo.email,
      phone: order.buyerInfo.phone,
      financialStatus: financialStatusMap[order.paymentStatus] || 'pending',
      fulfillmentStatus: fulfillmentStatusMap[order.fulfillmentStatus] || 'unfulfilled',
      currency: order.currency,
      subtotalPrice: parseFloat(order.totals.subtotal),
      totalTax: parseFloat(order.totals.tax),
      totalDiscounts: parseFloat(order.totals.discount),
      totalPrice: parseFloat(order.totals.total),
      lineItems: order.lineItems.map(li => ({
        id: li.id,
        platformId: li.id,
        productId: li.productId,
        variantId: li.productId,
        title: li.name,
        sku: li.sku,
        quantity: li.quantity,
        price: parseFloat(li.price),
        totalDiscount: 0,
        taxLines: [],
        fulfillmentStatus: null,
      })),
      shippingAddress: order.shippingInfo?.shipmentDetails?.address ? {
        address1: order.shippingInfo.shipmentDetails.address.address.addressLine1,
        address2: order.shippingInfo.shipmentDetails.address.address.addressLine2,
        city: order.shippingInfo.shipmentDetails.address.address.city,
        province: order.shippingInfo.shipmentDetails.address.address.subdivision,
        country: order.shippingInfo.shipmentDetails.address.address.country,
        countryCode: order.shippingInfo.shipmentDetails.address.address.country,
        zip: order.shippingInfo.shipmentDetails.address.address.postalCode,
        phone: order.shippingInfo.shipmentDetails.address.phone,
      } : undefined,
      billingAddress: order.billingInfo?.address ? {
        address1: order.billingInfo.address.address.addressLine1,
        address2: order.billingInfo.address.address.addressLine2,
        city: order.billingInfo.address.address.city,
        province: order.billingInfo.address.address.subdivision,
        country: order.billingInfo.address.address.country,
        countryCode: order.billingInfo.address.address.country,
        zip: order.billingInfo.address.address.postalCode,
        phone: order.billingInfo.address.phone,
      } : undefined,
      shippingLines: [{
        id: 'shipping',
        title: order.shippingInfo?.deliveryOption || 'Shipping',
        price: parseFloat(order.totals.shipping),
      }],
      discountCodes: [],
      tags: [],
      createdAt: new Date(order.createdDate),
      updatedAt: new Date(order.updatedDate),
    };
  }

  private mapCustomer(customer: WixCustomer): PlatformCustomer {
    return {
      id: customer.id,
      platformId: customer.id,
      platform: 'wix',
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      verifiedEmail: true,
      taxExempt: false,
      tags: [],
      ordersCount: 0,
      totalSpent: 0,
      defaultAddress: customer.addresses?.[0] ? {
        address1: customer.addresses[0].address.addressLine1,
        address2: customer.addresses[0].address.addressLine2,
        city: customer.addresses[0].address.city,
        province: customer.addresses[0].address.subdivision,
        country: customer.addresses[0].address.country,
        countryCode: customer.addresses[0].address.country,
        zip: customer.addresses[0].address.postalCode,
        phone: customer.addresses[0].phone,
      } : undefined,
      addresses: customer.addresses?.map(addr => ({
        address1: addr.address.addressLine1,
        address2: addr.address.addressLine2,
        city: addr.address.city,
        province: addr.address.subdivision,
        country: addr.address.country,
        countryCode: addr.address.country,
        zip: addr.address.postalCode,
        phone: addr.phone,
      })) || [],
      createdAt: new Date(customer.createdDate),
      updatedAt: new Date(customer.createdDate),
    };
  }
}
