/**
 * Inventory Sync Service
 * 
 * Manages real-time inventory synchronization across e-commerce platforms.
 * Features:
 * - Bi-directional sync
 * - Conflict resolution
 * - Webhook handling
 * - Scheduled sync jobs
 */

import { PlatformConnectorFactory } from './platforms/base-connector';
import { PlatformCredentials, InventoryLevel, SyncResult } from './platforms/types';

export interface InventorySyncConfig {
  tenantId: string;
  platforms: PlatformCredentials[];
  syncInterval: number; // minutes
  conflictResolution: 'source_of_truth' | 'lowest_wins' | 'highest_wins' | 'average';
  sourceOfTruth?: string; // platform name if using source_of_truth strategy
  webhookEnabled: boolean;
  notifyOnLowStock: boolean;
  lowStockThreshold: number;
}

export interface InventoryItem {
  sku: string;
  productId: string;
  variantId: string;
  platformId: string;
  platform: string;
  quantity: number;
  reserved: number;
  available: number;
  reorderPoint?: number;
  lastSyncedAt: Date;
}

export interface InventoryConflict {
  sku: string;
  platforms: Array<{
    platform: string;
    quantity: number;
    lastUpdated: Date;
  }>;
  resolvedQuantity: number;
  resolutionStrategy: string;
  resolvedAt: Date;
}

export interface LowStockAlert {
  sku: string;
  productName: string;
  currentQuantity: number;
  threshold: number;
  platforms: string[];
  alertedAt: Date;
}

type EventType = 
  | 'sync_started' 
  | 'sync_completed' 
  | 'sync_failed' 
  | 'conflict_resolved' 
  | 'low_stock_alert' 
  | 'inventory_updated';

type EventHandler = (data: unknown) => void;

export class InventorySyncService {
  private config: InventorySyncConfig;
  private syncInterval: NodeJS.Timeout | null = null;
  private inventory: Map<string, InventoryItem> = new Map();
  private conflicts: InventoryConflict[] = [];
  private alerts: LowStockAlert[] = [];
  private eventHandlers: Map<EventType, EventHandler[]> = new Map();

  constructor(config: InventorySyncConfig) {
    this.config = config;
  }

  /**
   * Start the sync service
   */
  async start(): Promise<void> {
    // Initial sync
    await this.syncAll();

    // Schedule periodic sync
    if (this.config.syncInterval > 0) {
      this.syncInterval = setInterval(
        () => this.syncAll(),
        this.config.syncInterval * 60 * 1000
      );
    }

    console.log(`Inventory sync service started for tenant ${this.config.tenantId}`);
  }

  /**
   * Stop the sync service
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log(`Inventory sync service stopped for tenant ${this.config.tenantId}`);
  }

  /**
   * Sync inventory from all platforms
   */
  async syncAll(): Promise<SyncResult[]> {
    this.emit('sync_started', { tenantId: this.config.tenantId, timestamp: new Date() });

    const results: SyncResult[] = [];

    try {
      // Collect inventory from all platforms
      const platformInventories = await Promise.all(
        this.config.platforms.map(async (creds) => {
          try {
            const connector = await PlatformConnectorFactory.create(creds);
            const products = await connector.getProducts({ first: 100 });
            
            const variantIds = products.items.flatMap(p => 
              p.variants.map(v => v.platformId)
            );
            
            const levels = await connector.getInventoryLevels(variantIds);
            
            return {
              platform: creds.platform,
              levels,
              products: products.items,
            };
          } catch (error) {
            console.error(`Failed to sync from ${creds.platform}:`, error);
            return {
              platform: creds.platform,
              levels: [],
              products: [],
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        })
      );

      // Group by SKU and detect conflicts
      const skuMap = new Map<string, Array<{
        platform: string;
        level: InventoryLevel;
        productId: string;
      }>>();

      for (const pi of platformInventories) {
        for (const level of pi.levels) {
          const product = pi.products.find(p => 
            p.variants.some(v => v.platformId === level.variantId)
          );
          
          if (!product) continue;
          
          const variant = product.variants.find(v => v.platformId === level.variantId);
          if (!variant?.sku) continue;

          const existing = skuMap.get(variant.sku) || [];
          existing.push({
            platform: pi.platform,
            level,
            productId: product.id,
          });
          skuMap.set(variant.sku, existing);
        }
      }

      // Resolve conflicts and update inventory
      for (const [sku, entries] of skuMap) {
        if (entries.length > 1) {
          // Conflict detected
          const resolved = this.resolveConflict(sku, entries);
          
          this.conflicts.push({
            sku,
            platforms: entries.map(e => ({
              platform: e.platform,
              quantity: e.level.available,
              lastUpdated: e.level.updatedAt,
            })),
            resolvedQuantity: resolved,
            resolutionStrategy: this.config.conflictResolution,
            resolvedAt: new Date(),
          });

          this.emit('conflict_resolved', {
            sku,
            resolvedQuantity: resolved,
            strategy: this.config.conflictResolution,
          });

          // Update all platforms with resolved quantity
          for (const entry of entries) {
            if (entry.level.available !== resolved) {
              try {
                const connector = await PlatformConnectorFactory.create(
                  this.config.platforms.find(p => p.platform === entry.platform)!
                );
                await connector.updateInventory(
                  entry.level.variantId,
                  entry.level.locationId,
                  resolved
                );
              } catch (error) {
                console.error(`Failed to update ${entry.platform} inventory for ${sku}:`, error);
              }
            }
          }
        }

        // Update local inventory record
        const primaryEntry = entries[0];
        const resolvedQty = entries.length > 1 
          ? this.resolveConflict(sku, entries)
          : primaryEntry.level.available;

        this.inventory.set(sku, {
          sku,
          productId: primaryEntry.productId,
          variantId: primaryEntry.level.variantId,
          platformId: primaryEntry.level.variantId,
          platform: primaryEntry.platform,
          quantity: resolvedQty,
          reserved: 0,
          available: resolvedQty,
          lastSyncedAt: new Date(),
        });

        // Check for low stock
        if (this.config.notifyOnLowStock && resolvedQty <= this.config.lowStockThreshold) {
          const alert: LowStockAlert = {
            sku,
            productName: sku,
            currentQuantity: resolvedQty,
            threshold: this.config.lowStockThreshold,
            platforms: entries.map(e => e.platform),
            alertedAt: new Date(),
          };
          
          this.alerts.push(alert);
          this.emit('low_stock_alert', alert);
        }
      }

      results.push({
        success: true,
        syncedCount: skuMap.size,
        failedCount: 0,
        errors: [],
        lastSyncedAt: new Date(),
      });

      this.emit('sync_completed', {
        tenantId: this.config.tenantId,
        syncedCount: skuMap.size,
        conflictsResolved: this.conflicts.length,
        lowStockAlerts: this.alerts.length,
      });

    } catch (error) {
      this.emit('sync_failed', {
        tenantId: this.config.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      results.push({
        success: false,
        syncedCount: 0,
        failedCount: 1,
        errors: [{
          itemId: 'sync',
          itemType: 'full_sync',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        }],
        lastSyncedAt: new Date(),
      });
    }

    return results;
  }

  /**
   * Update inventory for a specific SKU
   */
  async updateInventory(sku: string, quantity: number, platform?: string): Promise<boolean> {
    const item = this.inventory.get(sku);
    if (!item) return false;

    const platforms = platform 
      ? this.config.platforms.filter(p => p.platform === platform)
      : this.config.platforms;

    let success = true;

    for (const creds of platforms) {
      try {
        const connector = await PlatformConnectorFactory.create(creds);
        await connector.updateInventory(item.variantId, 'default', quantity);
      } catch (error) {
        console.error(`Failed to update ${creds.platform} inventory for ${sku}:`, error);
        success = false;
      }
    }

    if (success) {
      item.quantity = quantity;
      item.available = quantity - item.reserved;
      item.lastSyncedAt = new Date();
      
      this.emit('inventory_updated', { sku, quantity, platforms: platforms.map(p => p.platform) });
    }

    return success;
  }

  /**
   * Reserve inventory (for orders in progress)
   */
  reserveInventory(sku: string, quantity: number): boolean {
    const item = this.inventory.get(sku);
    if (!item || item.available < quantity) return false;

    item.reserved += quantity;
    item.available = item.quantity - item.reserved;
    return true;
  }

  /**
   * Release reserved inventory
   */
  releaseInventory(sku: string, quantity: number): boolean {
    const item = this.inventory.get(sku);
    if (!item || item.reserved < quantity) return false;

    item.reserved -= quantity;
    item.available = item.quantity - item.reserved;
    return true;
  }

  /**
   * Commit reserved inventory (order completed)
   */
  async commitInventory(sku: string, quantity: number): Promise<boolean> {
    const item = this.inventory.get(sku);
    if (!item || item.reserved < quantity) return false;

    item.reserved -= quantity;
    const newQuantity = item.quantity - quantity;
    
    return this.updateInventory(sku, newQuantity);
  }

  /**
   * Get current inventory status
   */
  getInventory(sku?: string): InventoryItem | InventoryItem[] | undefined {
    if (sku) {
      return this.inventory.get(sku);
    }
    return Array.from(this.inventory.values());
  }

  /**
   * Get recent conflicts
   */
  getConflicts(limit: number = 50): InventoryConflict[] {
    return this.conflicts.slice(-limit);
  }

  /**
   * Get low stock alerts
   */
  getLowStockAlerts(limit: number = 50): LowStockAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Register event handler
   */
  on(event: EventType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  /**
   * Remove event handler
   */
  off(event: EventType, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  private emit(event: EventType, data: unknown): void {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }
  }

  private resolveConflict(
    _sku: string,
    entries: Array<{ platform: string; level: InventoryLevel }>
  ): number {
    const quantities = entries.map(e => e.level.available);

    switch (this.config.conflictResolution) {
      case 'source_of_truth':
        const source = entries.find(e => e.platform === this.config.sourceOfTruth);
        return source?.level.available || Math.min(...quantities);

      case 'lowest_wins':
        return Math.min(...quantities);

      case 'highest_wins':
        return Math.max(...quantities);

      case 'average':
        return Math.round(quantities.reduce((a, b) => a + b, 0) / quantities.length);

      default:
        return Math.min(...quantities);
    }
  }
}

// Factory for creating sync services per tenant
const syncServices = new Map<string, InventorySyncService>();

export function getInventorySyncService(tenantId: string): InventorySyncService | undefined {
  return syncServices.get(tenantId);
}

export async function createInventorySyncService(config: InventorySyncConfig): Promise<InventorySyncService> {
  const existing = syncServices.get(config.tenantId);
  if (existing) {
    existing.stop();
  }

  const service = new InventorySyncService(config);
  await service.start();
  syncServices.set(config.tenantId, service);
  return service;
}

export function stopInventorySyncService(tenantId: string): void {
  const service = syncServices.get(tenantId);
  if (service) {
    service.stop();
    syncServices.delete(tenantId);
  }
}
