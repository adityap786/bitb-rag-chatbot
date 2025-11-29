/**
 * @module Tenant
 * @description Multi-tenant management module
 * 
 * Provides comprehensive tenant lifecycle management including:
 * - Tenant CRUD operations
 * - Quota management
 * - Status transitions
 * - Usage tracking
 * - Access validation
 */

export { TenantManager, type TenantStatus, type TenantPlan, type TenantQuota, type TenantFeatures, type TenantConfig } from './tenant-manager';
