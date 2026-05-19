/**
 * Granular Permission System
 * 
 * Implements fine-grained access control with:
 * - Resource-based permissions
 * - Role hierarchy with inheritance
 * - Tenant-scoped authorization
 * - Audit logging
 */

import { logger } from '@/lib/observability/logger';

// ============================================================
// Permission Definitions
// ============================================================

export const PERMISSIONS = {
    // Document Management
    'documents:read': 'View documents and knowledge base',
    'documents:write': 'Upload and edit documents',
    'documents:delete': 'Delete documents',

    // Chat & Conversations
    'chat:read': 'View chat history',
    'chat:write': 'Send messages',
    'chat:export': 'Export chat data',

    // Chatbot Configuration
    'chatbot:read': 'View chatbot settings',
    'chatbot:write': 'Create and edit chatbots',
    'chatbot:delete': 'Delete chatbots',
    'chatbot:deploy': 'Deploy chatbot widgets',

    // Analytics & Metrics
    'analytics:read': 'View analytics dashboard',
    'analytics:export': 'Export analytics data',

    // Tenant Settings
    'settings:read': 'View tenant settings',
    'settings:write': 'Modify tenant settings',
    'settings:billing': 'Manage billing and subscription',

    // User Management (within tenant)
    'users:read': 'View team members',
    'users:invite': 'Invite new members',
    'users:manage': 'Manage member roles',
    'users:remove': 'Remove team members',

    // Admin Functions
    'admin:tenants': 'Manage all tenants (super admin)',
    'admin:users': 'Manage all users (super admin)',
    'admin:system': 'System configuration (super admin)',
    'admin:audit': 'View audit logs',
} as const;

export type Permission = keyof typeof PERMISSIONS;

// ============================================================
// Role Definitions with Permission Inheritance
// ============================================================

export type Role = 'viewer' | 'member' | 'admin' | 'owner' | 'super_admin';

const ROLE_HIERARCHY: Record<Role, number> = {
    viewer: 1,
    member: 2,
    admin: 3,
    owner: 4,
    super_admin: 5,
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
    viewer: [
        'documents:read',
        'chat:read',
        'chatbot:read',
        'analytics:read',
        'settings:read',
        'users:read',
    ],

    member: [
        // Inherits viewer permissions +
        'documents:write',
        'chat:write',
        'chat:export',
        'chatbot:write',
    ],

    admin: [
        // Inherits member permissions +
        'documents:delete',
        'chatbot:delete',
        'chatbot:deploy',
        'analytics:export',
        'settings:write',
        'users:invite',
        'users:manage',
        'admin:audit',
    ],

    owner: [
        // Inherits admin permissions +
        'users:remove',
        'settings:billing',
    ],

    super_admin: [
        // All permissions
        'admin:tenants',
        'admin:users',
        'admin:system',
    ],
};

// ============================================================
// Permission Resolution
// ============================================================

/**
 * Get all permissions for a role (including inherited)
 */
export function getRolePermissions(role: Role): Permission[] {
    const permissions = new Set<Permission>();

    // Add permissions from all lower roles (inheritance)
    const roleLevel = ROLE_HIERARCHY[role];

    for (const [r, level] of Object.entries(ROLE_HIERARCHY)) {
        if (level <= roleLevel) {
            const rolePerms = ROLE_PERMISSIONS[r as Role];
            rolePerms.forEach(p => permissions.add(p));
        }
    }

    return Array.from(permissions);
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
    const permissions = getRolePermissions(role);
    return permissions.includes(permission);
}

/**
 * Check if a role meets minimum role requirement
 */
export function meetsMinimumRole(userRole: Role, requiredRole: Role): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// ============================================================
// Authorization Context
// ============================================================

export interface AuthContext {
    userId: string;
    email?: string;
    tenantId?: string;
    role: Role;
    permissions: Permission[];
    sessionId?: string;
}

/**
 * Create auth context from user data
 */
export function createAuthContext(
    userId: string,
    role: Role,
    tenantId?: string,
    email?: string,
    sessionId?: string
): AuthContext {
    return {
        userId,
        email,
        tenantId,
        role,
        permissions: getRolePermissions(role),
        sessionId,
    };
}

// ============================================================
// Authorization Checks
// ============================================================

export interface AuthorizationResult {
    allowed: boolean;
    reason?: string;
    requiredPermission?: Permission;
    requiredRole?: Role;
}

/**
 * Check if context has permission
 */
export function authorize(
    context: AuthContext,
    permission: Permission
): AuthorizationResult {
    const allowed = context.permissions.includes(permission);

    if (!allowed) {
        logger.warn('Authorization denied', {
            userId: context.userId,
            tenantId: context.tenantId,
            role: context.role,
            requiredPermission: permission,
            action: 'authorization_denied',
        });
    }

    return {
        allowed,
        requiredPermission: permission,
        reason: allowed ? undefined : `Missing permission: ${permission}`,
    };
}

/**
 * Check if context meets minimum role
 */
export function authorizeRole(
    context: AuthContext,
    minRole: Role
): AuthorizationResult {
    const allowed = meetsMinimumRole(context.role, minRole);

    if (!allowed) {
        logger.warn('Role authorization denied', {
            userId: context.userId,
            tenantId: context.tenantId,
            userRole: context.role,
            requiredRole: minRole,
            action: 'role_authorization_denied',
        });
    }

    return {
        allowed,
        requiredRole: minRole,
        reason: allowed ? undefined : `Requires role: ${minRole}, has: ${context.role}`,
    };
}

/**
 * Check multiple permissions (all required)
 */
export function authorizeAll(
    context: AuthContext,
    permissions: Permission[]
): AuthorizationResult {
    for (const permission of permissions) {
        const result = authorize(context, permission);
        if (!result.allowed) {
            return result;
        }
    }
    return { allowed: true };
}

/**
 * Check multiple permissions (any one sufficient)
 */
export function authorizeAny(
    context: AuthContext,
    permissions: Permission[]
): AuthorizationResult {
    for (const permission of permissions) {
        if (context.permissions.includes(permission)) {
            return { allowed: true };
        }
    }

    logger.warn('Authorization denied (none matched)', {
        userId: context.userId,
        tenantId: context.tenantId,
        role: context.role,
        requiredAnyOf: permissions,
        action: 'authorization_denied',
    });

    return {
        allowed: false,
        reason: `Missing any of: ${permissions.join(', ')}`,
    };
}

// ============================================================
// Resource-Level Authorization
// ============================================================

export interface ResourceOwnership {
    ownerId: string;
    tenantId: string;
    resourceType: string;
    resourceId: string;
}

/**
 * Check resource ownership or admin access
 */
export function authorizeResource(
    context: AuthContext,
    resource: ResourceOwnership,
    action: 'read' | 'write' | 'delete'
): AuthorizationResult {
    // Super admins can do anything
    if (context.role === 'super_admin') {
        return { allowed: true };
    }

    // Must be same tenant
    if (context.tenantId !== resource.tenantId) {
        logger.warn('Cross-tenant access denied', {
            userId: context.userId,
            userTenant: context.tenantId,
            resourceTenant: resource.tenantId,
            resourceType: resource.resourceType,
            resourceId: resource.resourceId,
            action: 'cross_tenant_denied',
        });

        return {
            allowed: false,
            reason: 'Access denied: resource belongs to different tenant',
        };
    }

    // Owner can do anything to their own resources
    if (context.userId === resource.ownerId) {
        return { allowed: true };
    }

    // Check role-based permission
    const permissionMap: Record<string, Record<string, Permission>> = {
        document: { read: 'documents:read', write: 'documents:write', delete: 'documents:delete' },
        chatbot: { read: 'chatbot:read', write: 'chatbot:write', delete: 'chatbot:delete' },
        chat: { read: 'chat:read', write: 'chat:write', delete: 'chat:read' },
    };

    const resourcePerms = permissionMap[resource.resourceType];
    if (!resourcePerms) {
        return { allowed: false, reason: `Unknown resource type: ${resource.resourceType}` };
    }

    const requiredPerm = resourcePerms[action];
    if (!requiredPerm) {
        return { allowed: false, reason: `Unknown action: ${action}` };
    }

    return authorize(context, requiredPerm);
}

// ============================================================
// Audit Logging
// ============================================================

export interface PermissionAuditEvent {
    timestamp: string;
    userId: string;
    tenantId?: string;
    action: string;
    resource?: string;
    resourceId?: string;
    permission?: Permission;
    role?: Role;
    allowed: boolean;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Log permission check for audit trail
 */
export function logPermissionCheck(
    context: AuthContext,
    action: string,
    result: AuthorizationResult,
    resourceInfo?: { type: string; id: string },
    requestInfo?: { ipAddress?: string; userAgent?: string }
): void {
    const event: PermissionAuditEvent = {
        timestamp: new Date().toISOString(),
        userId: context.userId,
        tenantId: context.tenantId,
        action,
        resource: resourceInfo?.type,
        resourceId: resourceInfo?.id,
        permission: result.requiredPermission,
        role: context.role,
        allowed: result.allowed,
        reason: result.reason,
        ipAddress: requestInfo?.ipAddress,
        userAgent: requestInfo?.userAgent,
    };

    if (result.allowed) {
        logger.info('Permission granted', event);
    } else {
        logger.warn('Permission denied', event);
    }
}
