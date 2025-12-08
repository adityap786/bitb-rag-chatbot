/**
 * Base E-commerce Platform Connector
 * 
 * Abstract base class for all platform integrations.
 * Provides common functionality for product sync, inventory management, and order handling.
 */

import {
  PlatformCredentials,
  PlatformProduct,
  PlatformOrder,
  PlatformCustomer,
  PlatformCollection,
  InventoryLevel,
  InventoryLocation,
  SyncResult,
  PaginatedResult,
  PaginationParams,
  RateLimitInfo,
  WebhookPayload,
} from './types';

export abstract class BasePlatformConnector {
  protected credentials: PlatformCredentials;
  protected rateLimitInfo: RateLimitInfo | null = null;
  protected lastApiCall: Date | null = null;

  constructor(credentials: PlatformCredentials) {
    this.credentials = credentials;
  }

  // Abstract methods that each platform must implement
  abstract get platformName(): string;

  abstract validateCredentials(): Promise<boolean>;

  abstract getProducts(params?: PaginationParams): Promise<PaginatedResult<PlatformProduct>>;
  
  abstract getProductById(id: string): Promise<PlatformProduct | null>;
  
  abstract searchProducts(query: string, limit?: number): Promise<PlatformProduct[]>;
  
  abstract getOrders(params?: PaginationParams & { status?: string }): Promise<PaginatedResult<PlatformOrder>>;
  
  abstract getOrderById(id: string): Promise<PlatformOrder | null>;
  
  abstract getCustomers(params?: PaginationParams): Promise<PaginatedResult<PlatformCustomer>>;
  
  abstract getCustomerById(id: string): Promise<PlatformCustomer | null>;
  
  abstract getCollections(params?: PaginationParams): Promise<PaginatedResult<PlatformCollection>>;
  
  abstract getInventoryLevels(variantIds: string[]): Promise<InventoryLevel[]>;
  
  abstract getLocations(): Promise<InventoryLocation[]>;
  
  abstract updateInventory(variantId: string, locationId: string, quantity: number): Promise<boolean>;
  
  abstract handleWebhook(payload: WebhookPayload): Promise<void>;

  // Shared utility methods
  protected async rateLimitWait(): Promise<void> {
    if (!this.rateLimitInfo) return;

    if (this.rateLimitInfo.remaining <= 0) {
      const waitTime = this.rateLimitInfo.resetAt.getTime() - Date.now();
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  protected updateRateLimitFromHeaders(headers: Record<string, string>): void {
    // Override in subclasses based on platform-specific headers
  }

  /**
   * Sync all products from the platform
   */
  async syncAllProducts(onProgress?: (synced: number, total: number) => void): Promise<SyncResult> {
    const errors: SyncResult['errors'] = [];
    let syncedCount = 0;
    let hasNextPage = true;
    let cursor: string | undefined;

    while (hasNextPage) {
      try {
        await this.rateLimitWait();
        const result = await this.getProducts({ first: 50, after: cursor });
        
        for (const product of result.items) {
          try {
            // Store product (would integrate with local DB)
            syncedCount++;
            onProgress?.(syncedCount, result.totalCount || syncedCount);
          } catch (error) {
            errors.push({
              itemId: product.id,
              itemType: 'product',
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date(),
            });
          }
        }

        hasNextPage = result.pageInfo.hasNextPage;
        cursor = result.pageInfo.endCursor;
      } catch (error) {
        errors.push({
          itemId: 'batch',
          itemType: 'product_batch',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
        break;
      }
    }

    return {
      success: errors.length === 0,
      syncedCount,
      failedCount: errors.length,
      errors,
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Sync inventory levels for all variants
   */
  async syncInventory(variantIds: string[]): Promise<SyncResult> {
    const errors: SyncResult['errors'] = [];
    let syncedCount = 0;

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < variantIds.length; i += batchSize) {
      const batch = variantIds.slice(i, i + batchSize);
      
      try {
        await this.rateLimitWait();
        const levels = await this.getInventoryLevels(batch);
        syncedCount += levels.length;
      } catch (error) {
        errors.push({
          itemId: `batch_${i}`,
          itemType: 'inventory_batch',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        });
      }
    }

    return {
      success: errors.length === 0,
      syncedCount,
      failedCount: errors.length,
      errors,
      lastSyncedAt: new Date(),
    };
  }
}

/**
 * Platform Connector Factory
 */
export class PlatformConnectorFactory {
  private static connectors: Map<string, BasePlatformConnector> = new Map();

  static async create(credentials: PlatformCredentials): Promise<BasePlatformConnector> {
    const key = `${credentials.platform}:${credentials.storeUrl}`;
    
    if (this.connectors.has(key)) {
      return this.connectors.get(key)!;
    }

    let connector: BasePlatformConnector;

    switch (credentials.platform) {
      case 'shopify':
        const { ShopifyConnector } = await import('./shopify.js');
        connector = new ShopifyConnector(credentials);
        break;
      case 'woocommerce':
        const { WooCommerceConnector } = await import('./woocommerce.js');
        connector = new WooCommerceConnector(credentials);
        break;
      case 'framer':
        const { FramerConnector } = await import('./framer.js');
        connector = new FramerConnector(credentials);
        break;
      case 'wix':
        const { WixConnector } = await import('./wix.js');
        connector = new WixConnector(credentials);
        break;
      default:
        throw new Error(`Unsupported platform: ${credentials.platform}`);
    }

    // Validate credentials before storing
    const isValid = await connector.validateCredentials();
    if (!isValid) {
      throw new Error(`Invalid credentials for ${credentials.platform}`);
    }

    this.connectors.set(key, connector);
    return connector;
  }

  static remove(platform: string, storeUrl: string): void {
    const key = `${platform}:${storeUrl}`;
    this.connectors.delete(key);
  }

  static getAll(): BasePlatformConnector[] {
    return Array.from(this.connectors.values());
  }
}
