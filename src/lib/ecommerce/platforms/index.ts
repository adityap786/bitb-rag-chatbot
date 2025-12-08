/**
 * E-commerce Platforms Module
 * 
 * Unified exports for all e-commerce platform integrations.
 */

export * from './types';
export * from './base-connector';
export * from './shopify';
export * from './woocommerce';
export * from './framer';
export * from './wix';

// Re-export factory for convenience
export { PlatformConnectorFactory as EcommercePlatforms } from './base-connector';
