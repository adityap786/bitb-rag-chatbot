/**
 * Convenience re-export for e-commerce platform types.
 * Tests and other modules can import from `src/lib/ecommerce/types` while the
 * implementation lives in the platforms directory.
 */
export * from './platforms/types';

// Type aliases for backward compatibility with test files
export type { PlatformProduct as ProductData } from './platforms/types';
export type { PlatformOrder as OrderData } from './platforms/types';
export type { PlatformCustomer as CustomerData } from './platforms/types';
export type { InventoryLevel as InventoryData } from './platforms/types';
