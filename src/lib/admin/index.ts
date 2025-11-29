/**
 * @module Admin
 * @description Admin panel and authentication module
 * 
 * Provides:
 * - Admin authentication with JWT
 * - Role-based access control (RBAC)
 * - Session management
 * - Audit logging
 */

export { 
  AdminAuth, 
  verifyAdminAuth,
  checkPermission,
  createAdminSession,
  invalidateSession,
  invalidateAllSessions,
  getAdminByEmail,
  verifyPassword,
  logAdminAction,
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
  type AdminRole, 
  type AdminUser, 
  type AdminSession, 
  type Permission,
  type AuthResult,
} from './auth';
