/**
 * Shopify Platform Connector
 * 
 * Production-ready integration with Shopify Admin API (2024-01).
 * Supports GraphQL API for efficient data fetching.
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
  ProductVariant,
  ProductImage,
} from './types';
import crypto from 'crypto';

const SHOPIFY_API_VERSION = '2024-01';

interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }> }>;
  extensions?: {
    cost: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

export class ShopifyConnector extends BasePlatformConnector {
  private graphqlEndpoint: string;
  private restEndpoint: string;

  constructor(credentials: PlatformCredentials) {
    super(credentials);
    this.graphqlEndpoint = `https://${credentials.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    this.restEndpoint = `https://${credentials.storeUrl}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  get platformName(): string {
    return 'shopify';
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await this.graphqlQuery<{ shop: { name: string; email: string; myshopifyDomain: string } }>(`
        {
          shop {
            name
            email
            myshopifyDomain
          }
        }
      `);
      return !!response.data?.shop;
    } catch {
      return false;
    }
  }

  private async graphqlQuery<T>(query: string, variables?: Record<string, unknown>): Promise<ShopifyGraphQLResponse<T>> {
    await this.rateLimitWait();

    const response = await fetch(this.graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.credentials.accessToken || this.credentials.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as ShopifyGraphQLResponse<T>;

    // Update rate limit info from extensions
    if (result.extensions?.cost?.throttleStatus) {
      const { maximumAvailable, currentlyAvailable, restoreRate } = result.extensions.cost.throttleStatus;
      this.rateLimitInfo = {
        limit: maximumAvailable,
        remaining: currentlyAvailable,
        resetAt: new Date(Date.now() + ((maximumAvailable - currentlyAvailable) / restoreRate) * 1000),
      };
    }

    if (result.errors && result.errors.length > 0) {
      throw new Error(`Shopify GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
    }

    return result;
  }

  async getProducts(params?: PaginationParams): Promise<PaginatedResult<PlatformProduct>> {
    const first = params?.first || 50;
    const after = params?.after ? `, after: "${params.after}"` : '';

    interface ProductsResponse {
      products: {
        pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string; endCursor: string };
        edges: Array<{
          cursor: string;
          node: {
            id: string;
            title: string;
            description: string;
            descriptionHtml: string;
            handle: string;
            vendor: string;
            productType: string;
            tags: string[];
            status: string;
            createdAt: string;
            updatedAt: string;
            seo: { title: string; description: string };
            options: Array<{ id: string; name: string; position: number; values: string[] }>;
            images: { edges: Array<{ node: { id: string; url: string; altText: string; width: number; height: number } }> };
            variants: {
              edges: Array<{
                node: {
                  id: string;
                  title: string;
                  sku: string;
                  barcode: string;
                  price: string;
                  compareAtPrice: string;
                  weight: number;
                  weightUnit: string;
                  inventoryQuantity: number;
                  inventoryPolicy: string;
                  requiresShipping: boolean;
                  taxable: boolean;
                  selectedOptions: Array<{ name: string; value: string }>;
                  createdAt: string;
                  updatedAt: string;
                };
              }>;
            };
          };
        }>;
      };
    }

    const response = await this.graphqlQuery<ProductsResponse>(`
      {
        products(first: ${first}${after}) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            cursor
            node {
              id
              title
              description
              descriptionHtml
              handle
              vendor
              productType
              tags
              status
              createdAt
              updatedAt
              seo {
                title
                description
              }
              options {
                id
                name
                position
                values
              }
              images(first: 10) {
                edges {
                  node {
                    id
                    url
                    altText
                    width
                    height
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    barcode
                    price
                    compareAtPrice
                    weight
                    weightUnit
                    inventoryQuantity
                    inventoryPolicy
                    requiresShipping
                    taxable
                    selectedOptions {
                      name
                      value
                    }
                    createdAt
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }
    `);

    const products = response.data!.products;

    return {
      items: products.edges.map(edge => this.mapProduct(edge.node)),
      pageInfo: products.pageInfo,
    };
  }

  async getProductById(id: string): Promise<PlatformProduct | null> {
    interface ProductResponse {
      product: {
        id: string;
        title: string;
        description: string;
        descriptionHtml: string;
        handle: string;
        vendor: string;
        productType: string;
        tags: string[];
        status: string;
        createdAt: string;
        updatedAt: string;
        seo: { title: string; description: string };
        options: Array<{ id: string; name: string; position: number; values: string[] }>;
        images: { edges: Array<{ node: { id: string; url: string; altText: string; width: number; height: number } }> };
        variants: {
          edges: Array<{
            node: {
              id: string;
              title: string;
              sku: string;
              barcode: string;
              price: string;
              compareAtPrice: string;
              weight: number;
              weightUnit: string;
              inventoryQuantity: number;
              inventoryPolicy: string;
              requiresShipping: boolean;
              taxable: boolean;
              selectedOptions: Array<{ name: string; value: string }>;
              createdAt: string;
              updatedAt: string;
            };
          }>;
        };
      };
    }

    const gid = id.startsWith('gid://') ? id : `gid://shopify/Product/${id}`;

    const response = await this.graphqlQuery<ProductResponse>(`
      {
        product(id: "${gid}") {
          id
          title
          description
          descriptionHtml
          handle
          vendor
          productType
          tags
          status
          createdAt
          updatedAt
          seo {
            title
            description
          }
          options {
            id
            name
            position
            values
          }
          images(first: 10) {
            edges {
              node {
                id
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
                compareAtPrice
                weight
                weightUnit
                inventoryQuantity
                inventoryPolicy
                requiresShipping
                taxable
                selectedOptions {
                  name
                  value
                }
                createdAt
                updatedAt
              }
            }
          }
        }
      }
    `);

    if (!response.data?.product) return null;
    return this.mapProduct(response.data.product);
  }

  async searchProducts(query: string, limit: number = 10): Promise<PlatformProduct[]> {
    interface SearchResponse {
      products: {
        edges: Array<{
          node: {
            id: string;
            title: string;
            description: string;
            descriptionHtml: string;
            handle: string;
            vendor: string;
            productType: string;
            tags: string[];
            status: string;
            createdAt: string;
            updatedAt: string;
            seo: { title: string; description: string };
            options: Array<{ id: string; name: string; position: number; values: string[] }>;
            images: { edges: Array<{ node: { id: string; url: string; altText: string; width: number; height: number } }> };
            variants: {
              edges: Array<{
                node: {
                  id: string;
                  title: string;
                  sku: string;
                  barcode: string;
                  price: string;
                  compareAtPrice: string;
                  weight: number;
                  weightUnit: string;
                  inventoryQuantity: number;
                  inventoryPolicy: string;
                  requiresShipping: boolean;
                  taxable: boolean;
                  selectedOptions: Array<{ name: string; value: string }>;
                  createdAt: string;
                  updatedAt: string;
                };
              }>;
            };
          };
        }>;
      };
    }

    const response = await this.graphqlQuery<SearchResponse>(`
      {
        products(first: ${limit}, query: "${query.replace(/"/g, '\\"')}") {
          edges {
            node {
              id
              title
              description
              descriptionHtml
              handle
              vendor
              productType
              tags
              status
              createdAt
              updatedAt
              seo {
                title
                description
              }
              options {
                id
                name
                position
                values
              }
              images(first: 5) {
                edges {
                  node {
                    id
                    url
                    altText
                    width
                    height
                  }
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    sku
                    barcode
                    price
                    compareAtPrice
                    weight
                    weightUnit
                    inventoryQuantity
                    inventoryPolicy
                    requiresShipping
                    taxable
                    selectedOptions {
                      name
                      value
                    }
                    createdAt
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }
    `);

    return response.data!.products.edges.map(edge => this.mapProduct(edge.node));
  }

  async getOrders(params?: PaginationParams & { status?: string }): Promise<PaginatedResult<PlatformOrder>> {
    const first = params?.first || 50;
    const after = params?.after ? `, after: "${params.after}"` : '';
    const query = params?.status ? `, query: "financial_status:${params.status}"` : '';

    interface OrdersResponse {
      orders: {
        pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string; endCursor: string };
        edges: Array<{
          cursor: string;
          node: {
            id: string;
            name: string;
            email: string;
            phone: string;
            displayFinancialStatus: string;
            displayFulfillmentStatus: string;
            currencyCode: string;
            subtotalPriceSet: { shopMoney: { amount: string } };
            totalTaxSet: { shopMoney: { amount: string } };
            totalDiscountsSet: { shopMoney: { amount: string } };
            totalPriceSet: { shopMoney: { amount: string } };
            note: string;
            tags: string[];
            cancelledAt: string;
            closedAt: string;
            createdAt: string;
            updatedAt: string;
            lineItems: {
              edges: Array<{
                node: {
                  id: string;
                  title: string;
                  variantTitle: string;
                  sku: string;
                  quantity: number;
                  originalUnitPriceSet: { shopMoney: { amount: string } };
                  totalDiscountSet: { shopMoney: { amount: string } };
                  product: { id: string };
                  variant: { id: string };
                };
              }>;
            };
            shippingAddress: {
              address1: string;
              address2: string;
              city: string;
              province: string;
              provinceCode: string;
              country: string;
              countryCode: string;
              zip: string;
              phone: string;
            };
            billingAddress: {
              address1: string;
              address2: string;
              city: string;
              province: string;
              provinceCode: string;
              country: string;
              countryCode: string;
              zip: string;
              phone: string;
            };
            shippingLines: Array<{ title: string; originalPriceSet: { shopMoney: { amount: string } }; code: string }>;
            discountCodes: string[];
          };
        }>;
      };
    }

    const response = await this.graphqlQuery<OrdersResponse>(`
      {
        orders(first: ${first}${after}${query}) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            cursor
            node {
              id
              name
              email
              phone
              displayFinancialStatus
              displayFulfillmentStatus
              currencyCode
              subtotalPriceSet { shopMoney { amount } }
              totalTaxSet { shopMoney { amount } }
              totalDiscountsSet { shopMoney { amount } }
              totalPriceSet { shopMoney { amount } }
              note
              tags
              cancelledAt
              closedAt
              createdAt
              updatedAt
              lineItems(first: 50) {
                edges {
                  node {
                    id
                    title
                    variantTitle
                    sku
                    quantity
                    originalUnitPriceSet { shopMoney { amount } }
                    totalDiscountSet { shopMoney { amount } }
                    product { id }
                    variant { id }
                  }
                }
              }
              shippingAddress {
                address1
                address2
                city
                province
                provinceCode
                country
                countryCode
                zip
                phone
              }
              billingAddress {
                address1
                address2
                city
                province
                provinceCode
                country
                countryCode
                zip
                phone
              }
              shippingLines {
                title
                originalPriceSet { shopMoney { amount } }
                code
              }
              discountCodes
            }
          }
        }
      }
    `);

    const orders = response.data!.orders;

    return {
      items: orders.edges.map(edge => this.mapOrder(edge.node)),
      pageInfo: orders.pageInfo,
    };
  }

  async getOrderById(id: string): Promise<PlatformOrder | null> {
    // Similar implementation to getOrders but for single order
    const result = await this.getOrders({ first: 1 });
    return result.items.find(o => o.id === id) || null;
  }

  async getCustomers(params?: PaginationParams): Promise<PaginatedResult<PlatformCustomer>> {
    const first = params?.first || 50;
    const after = params?.after ? `, after: "${params.after}"` : '';

    interface CustomersResponse {
      customers: {
        pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string; endCursor: string };
        edges: Array<{
          cursor: string;
          node: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            phone: string;
            verifiedEmail: boolean;
            taxExempt: boolean;
            tags: string[];
            note: string;
            ordersCount: string;
            totalSpentV2: { amount: string; currencyCode: string };
            createdAt: string;
            updatedAt: string;
            defaultAddress: {
              address1: string;
              address2: string;
              city: string;
              province: string;
              provinceCode: string;
              country: string;
              countryCode: string;
              zip: string;
              phone: string;
            };
            addresses: Array<{
              address1: string;
              address2: string;
              city: string;
              province: string;
              provinceCode: string;
              country: string;
              countryCode: string;
              zip: string;
              phone: string;
            }>;
          };
        }>;
      };
    }

    const response = await this.graphqlQuery<CustomersResponse>(`
      {
        customers(first: ${first}${after}) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            cursor
            node {
              id
              email
              firstName
              lastName
              phone
              verifiedEmail
              taxExempt
              tags
              note
              ordersCount
              totalSpentV2 { amount currencyCode }
              createdAt
              updatedAt
              defaultAddress {
                address1
                address2
                city
                province
                provinceCode
                country
                countryCode
                zip
                phone
              }
              addresses {
                address1
                address2
                city
                province
                provinceCode
                country
                countryCode
                zip
                phone
              }
            }
          }
        }
      }
    `);

    const customers = response.data!.customers;

    return {
      items: customers.edges.map(edge => this.mapCustomer(edge.node)),
      pageInfo: customers.pageInfo,
    };
  }

  async getCustomerById(id: string): Promise<PlatformCustomer | null> {
    const result = await this.getCustomers({ first: 1 });
    return result.items.find(c => c.id === id) || null;
  }

  async getCollections(params?: PaginationParams): Promise<PaginatedResult<PlatformCollection>> {
    const first = params?.first || 50;
    const after = params?.after ? `, after: "${params.after}"` : '';

    interface CollectionsResponse {
      collections: {
        pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string; endCursor: string };
        edges: Array<{
          cursor: string;
          node: {
            id: string;
            title: string;
            description: string;
            handle: string;
            productsCount: { count: number };
            sortOrder: string;
            image: { id: string; url: string; altText: string; width: number; height: number };
            createdAt: string;
            updatedAt: string;
          };
        }>;
      };
    }

    const response = await this.graphqlQuery<CollectionsResponse>(`
      {
        collections(first: ${first}${after}) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            cursor
            node {
              id
              title
              description
              handle
              productsCount { count }
              sortOrder
              image {
                id
                url
                altText
                width
                height
              }
              createdAt
              updatedAt
            }
          }
        }
      }
    `);

    const collections = response.data!.collections;

    return {
      items: collections.edges.map(edge => ({
        id: this.extractId(edge.node.id),
        platformId: edge.node.id,
        title: edge.node.title,
        description: edge.node.description,
        handle: edge.node.handle,
        productsCount: edge.node.productsCount?.count || 0,
        sortOrder: edge.node.sortOrder,
        image: edge.node.image ? {
          id: this.extractId(edge.node.image.id),
          platformId: edge.node.image.id,
          src: edge.node.image.url,
          altText: edge.node.image.altText,
          width: edge.node.image.width,
          height: edge.node.image.height,
          position: 0,
        } : undefined,
        createdAt: new Date(edge.node.createdAt),
        updatedAt: new Date(edge.node.updatedAt),
      })),
      pageInfo: collections.pageInfo,
    };
  }

  async getInventoryLevels(variantIds: string[]): Promise<InventoryLevel[]> {
    interface InventoryResponse {
      productVariants: {
        edges: Array<{
          node: {
            id: string;
            inventoryItem: {
              id: string;
              inventoryLevels: {
                edges: Array<{
                  node: {
                    id: string;
                    available: number;
                    location: {
                      id: string;
                    };
                    updatedAt: string;
                  };
                }>;
              };
            };
          };
        }>;
      };
    }

    const gids = variantIds.map(id => 
      id.startsWith('gid://') ? id : `gid://shopify/ProductVariant/${id}`
    );

    const response = await this.graphqlQuery<InventoryResponse>(`
      {
        productVariants(first: 50, query: "id:${gids.join(' OR id:')}") {
          edges {
            node {
              id
              inventoryItem {
                id
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      id
                      available
                      location { id }
                      updatedAt
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const levels: InventoryLevel[] = [];

    for (const variant of response.data!.productVariants.edges) {
      for (const level of variant.node.inventoryItem.inventoryLevels.edges) {
        levels.push({
          variantId: this.extractId(variant.node.id),
          locationId: this.extractId(level.node.location.id),
          available: level.node.available,
          updatedAt: new Date(level.node.updatedAt),
        });
      }
    }

    return levels;
  }

  async getLocations(): Promise<InventoryLocation[]> {
    interface LocationsResponse {
      locations: {
        edges: Array<{
          node: {
            id: string;
            name: string;
            isActive: boolean;
            fulfillsOnlineOrders: boolean;
            address: {
              address1: string;
              address2: string;
              city: string;
              province: string;
              provinceCode: string;
              country: string;
              countryCode: string;
              zip: string;
              phone: string;
            };
          };
        }>;
      };
    }

    const response = await this.graphqlQuery<LocationsResponse>(`
      {
        locations(first: 50) {
          edges {
            node {
              id
              name
              isActive
              fulfillsOnlineOrders
              address {
                address1
                address2
                city
                province
                provinceCode
                country
                countryCode
                zip
                phone
              }
            }
          }
        }
      }
    `);

    return response.data!.locations.edges.map(edge => ({
      id: this.extractId(edge.node.id),
      platformId: edge.node.id,
      name: edge.node.name,
      isActive: edge.node.isActive,
      fulfillsOnlineOrders: edge.node.fulfillsOnlineOrders,
      address: edge.node.address ? {
        address1: edge.node.address.address1,
        address2: edge.node.address.address2,
        city: edge.node.address.city,
        province: edge.node.address.province,
        provinceCode: edge.node.address.provinceCode,
        country: edge.node.address.country,
        countryCode: edge.node.address.countryCode,
        zip: edge.node.address.zip,
        phone: edge.node.address.phone,
      } : undefined,
    }));
  }

  async updateInventory(variantId: string, locationId: string, quantity: number): Promise<boolean> {
    interface InventoryAdjustResponse {
      inventoryAdjustQuantities: {
        inventoryAdjustmentGroup: { id: string };
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }

    const gidVariant = variantId.startsWith('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}`;
    const gidLocation = locationId.startsWith('gid://') ? locationId : `gid://shopify/Location/${locationId}`;

    // First get the inventory item ID
    interface VariantResponse {
      productVariant: {
        inventoryItem: { id: string };
      };
    }

    const variantResponse = await this.graphqlQuery<VariantResponse>(`
      {
        productVariant(id: "${gidVariant}") {
          inventoryItem { id }
        }
      }
    `);

    if (!variantResponse.data?.productVariant?.inventoryItem) {
      return false;
    }

    const inventoryItemId = variantResponse.data.productVariant.inventoryItem.id;

    const response = await this.graphqlQuery<InventoryAdjustResponse>(`
      mutation {
        inventoryAdjustQuantities(input: {
          reason: "correction"
          name: "available"
          changes: [{
            delta: ${quantity}
            inventoryItemId: "${inventoryItemId}"
            locationId: "${gidLocation}"
          }]
        }) {
          inventoryAdjustmentGroup { id }
          userErrors { field message }
        }
      }
    `);

    return !response.data?.inventoryAdjustQuantities?.userErrors?.length;
  }

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    // Verify HMAC signature
    if (this.credentials.webhookSecret && payload.hmac) {
      const calculatedHmac = crypto
        .createHmac('sha256', this.credentials.webhookSecret)
        .update(JSON.stringify(payload.payload), 'utf8')
        .digest('base64');

      if (calculatedHmac !== payload.hmac) {
        throw new Error('Invalid webhook signature');
      }
    }

    // Handle different webhook topics
    switch (payload.topic) {
      case 'products/create':
      case 'products/update':
        // Sync product to local DB
        console.log(`Shopify product webhook: ${payload.topic}`);
        break;
      case 'orders/create':
      case 'orders/updated':
        // Sync order to local DB
        console.log(`Shopify order webhook: ${payload.topic}`);
        break;
      case 'inventory_levels/update':
        // Update local inventory
        console.log(`Shopify inventory webhook: ${payload.topic}`);
        break;
      default:
        console.log(`Unhandled Shopify webhook: ${payload.topic}`);
    }
  }

  // Helper methods
  private extractId(gid: string): string {
    const match = gid.match(/\/(\d+)$/);
    return match ? match[1] : gid;
  }

  private mapProduct(node: {
    id: string;
    title: string;
    description: string;
    descriptionHtml: string;
    handle: string;
    vendor: string;
    productType: string;
    tags: string[];
    status: string;
    createdAt: string;
    updatedAt: string;
    seo?: { title: string; description: string };
    options: Array<{ id: string; name: string; position: number; values: string[] }>;
    images: { edges: Array<{ node: { id: string; url: string; altText: string; width: number; height: number } }> };
    variants: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          sku: string;
          barcode: string;
          price: string;
          compareAtPrice: string;
          weight: number;
          weightUnit: string;
          inventoryQuantity: number;
          inventoryPolicy: string;
          requiresShipping: boolean;
          taxable: boolean;
          selectedOptions: Array<{ name: string; value: string }>;
          createdAt: string;
          updatedAt: string;
        };
      }>;
    };
  }): PlatformProduct {
    return {
      id: this.extractId(node.id),
      platformId: node.id,
      platform: 'shopify',
      title: node.title,
      description: node.description,
      descriptionHtml: node.descriptionHtml,
      handle: node.handle,
      vendor: node.vendor,
      productType: node.productType,
      tags: node.tags,
      status: node.status.toLowerCase() as 'active' | 'archived' | 'draft',
      seoTitle: node.seo?.title,
      seoDescription: node.seo?.description,
      options: node.options.map(opt => ({
        id: this.extractId(opt.id),
        name: opt.name,
        position: opt.position,
        values: opt.values,
      })),
      images: node.images.edges.map((img, idx) => ({
        id: this.extractId(img.node.id),
        platformId: img.node.id,
        src: img.node.url,
        altText: img.node.altText,
        width: img.node.width,
        height: img.node.height,
        position: idx,
      })),
      variants: node.variants.edges.map(v => this.mapVariant(v.node)),
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
    };
  }

  private mapVariant(node: {
    id: string;
    title: string;
    sku: string;
    barcode: string;
    price: string;
    compareAtPrice: string;
    weight: number;
    weightUnit: string;
    inventoryQuantity: number;
    inventoryPolicy: string;
    requiresShipping: boolean;
    taxable: boolean;
    selectedOptions: Array<{ name: string; value: string }>;
    createdAt: string;
    updatedAt: string;
  }): ProductVariant {
    return {
      id: this.extractId(node.id),
      platformId: node.id,
      title: node.title,
      sku: node.sku,
      barcode: node.barcode,
      price: parseFloat(node.price),
      compareAtPrice: node.compareAtPrice ? parseFloat(node.compareAtPrice) : undefined,
      currency: 'USD', // Would come from shop settings
      weight: node.weight,
      weightUnit: node.weightUnit?.toLowerCase() as 'kg' | 'lb' | 'oz' | 'g',
      inventoryQuantity: node.inventoryQuantity,
      inventoryPolicy: node.inventoryPolicy?.toLowerCase() as 'deny' | 'continue',
      requiresShipping: node.requiresShipping,
      taxable: node.taxable,
      options: node.selectedOptions.reduce((acc, opt) => {
        acc[opt.name] = opt.value;
        return acc;
      }, {} as Record<string, string>),
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
    };
  }

  private mapOrder(node: {
    id: string;
    name: string;
    email: string;
    phone: string;
    displayFinancialStatus: string;
    displayFulfillmentStatus: string;
    currencyCode: string;
    subtotalPriceSet: { shopMoney: { amount: string } };
    totalTaxSet: { shopMoney: { amount: string } };
    totalDiscountsSet: { shopMoney: { amount: string } };
    totalPriceSet: { shopMoney: { amount: string } };
    note: string;
    tags: string[];
    cancelledAt: string;
    closedAt: string;
    createdAt: string;
    updatedAt: string;
    lineItems: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          variantTitle: string;
          sku: string;
          quantity: number;
          originalUnitPriceSet: { shopMoney: { amount: string } };
          totalDiscountSet: { shopMoney: { amount: string } };
          product: { id: string };
          variant: { id: string };
        };
      }>;
    };
    shippingAddress?: {
      address1: string;
      address2: string;
      city: string;
      province: string;
      provinceCode: string;
      country: string;
      countryCode: string;
      zip: string;
      phone: string;
    };
    billingAddress?: {
      address1: string;
      address2: string;
      city: string;
      province: string;
      provinceCode: string;
      country: string;
      countryCode: string;
      zip: string;
      phone: string;
    };
    shippingLines: Array<{ title: string; originalPriceSet: { shopMoney: { amount: string } }; code: string }>;
    discountCodes: string[];
  }): PlatformOrder {
    const financialStatusMap: Record<string, PlatformOrder['financialStatus']> = {
      'PENDING': 'pending',
      'AUTHORIZED': 'authorized',
      'PARTIALLY_PAID': 'partially_paid',
      'PAID': 'paid',
      'PARTIALLY_REFUNDED': 'partially_refunded',
      'REFUNDED': 'refunded',
      'VOIDED': 'voided',
    };

    const fulfillmentStatusMap: Record<string, PlatformOrder['fulfillmentStatus']> = {
      'UNFULFILLED': 'unfulfilled',
      'PARTIAL': 'partial',
      'FULFILLED': 'fulfilled',
      'RESTOCKED': 'restocked',
    };

    return {
      id: this.extractId(node.id),
      platformId: node.id,
      platform: 'shopify',
      orderNumber: node.name.replace('#', ''),
      name: node.name,
      email: node.email,
      phone: node.phone,
      financialStatus: financialStatusMap[node.displayFinancialStatus] || 'pending',
      fulfillmentStatus: fulfillmentStatusMap[node.displayFulfillmentStatus] || 'unfulfilled',
      currency: node.currencyCode,
      subtotalPrice: parseFloat(node.subtotalPriceSet.shopMoney.amount),
      totalTax: parseFloat(node.totalTaxSet.shopMoney.amount),
      totalDiscounts: parseFloat(node.totalDiscountsSet.shopMoney.amount),
      totalPrice: parseFloat(node.totalPriceSet.shopMoney.amount),
      lineItems: node.lineItems.edges.map(li => ({
        id: this.extractId(li.node.id),
        platformId: li.node.id,
        productId: this.extractId(li.node.product?.id || ''),
        variantId: this.extractId(li.node.variant?.id || ''),
        title: li.node.title,
        variantTitle: li.node.variantTitle,
        sku: li.node.sku,
        quantity: li.node.quantity,
        price: parseFloat(li.node.originalUnitPriceSet.shopMoney.amount),
        totalDiscount: parseFloat(li.node.totalDiscountSet.shopMoney.amount),
        taxLines: [],
        fulfillmentStatus: null,
      })),
      shippingAddress: node.shippingAddress,
      billingAddress: node.billingAddress,
      shippingLines: node.shippingLines.map(sl => ({
        id: '',
        title: sl.title,
        price: parseFloat(sl.originalPriceSet.shopMoney.amount),
        code: sl.code,
      })),
      discountCodes: node.discountCodes.map(code => ({
        code,
        amount: 0,
        type: 'fixed_amount' as const,
      })),
      note: node.note,
      tags: node.tags,
      cancelledAt: node.cancelledAt ? new Date(node.cancelledAt) : undefined,
      closedAt: node.closedAt ? new Date(node.closedAt) : undefined,
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
    };
  }

  private mapCustomer(node: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    verifiedEmail: boolean;
    taxExempt: boolean;
    tags: string[];
    note: string;
    ordersCount: string;
    totalSpentV2: { amount: string; currencyCode: string };
    createdAt: string;
    updatedAt: string;
    defaultAddress?: {
      address1: string;
      address2: string;
      city: string;
      province: string;
      provinceCode: string;
      country: string;
      countryCode: string;
      zip: string;
      phone: string;
    };
    addresses: Array<{
      address1: string;
      address2: string;
      city: string;
      province: string;
      provinceCode: string;
      country: string;
      countryCode: string;
      zip: string;
      phone: string;
    }>;
  }): PlatformCustomer {
    return {
      id: this.extractId(node.id),
      platformId: node.id,
      platform: 'shopify',
      email: node.email,
      firstName: node.firstName,
      lastName: node.lastName,
      phone: node.phone,
      verifiedEmail: node.verifiedEmail,
      taxExempt: node.taxExempt,
      tags: node.tags,
      note: node.note,
      ordersCount: parseInt(node.ordersCount) || 0,
      totalSpent: parseFloat(node.totalSpentV2.amount),
      currency: node.totalSpentV2.currencyCode,
      defaultAddress: node.defaultAddress,
      addresses: node.addresses || [],
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
    };
  }
}
