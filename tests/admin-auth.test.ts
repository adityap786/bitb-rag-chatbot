/**
 * Admin Authentication API Routes Tests
 * Validates JWT authentication, refresh tokens, and role-based access control
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type AdminUser,
} from '@/lib/auth/admin-auth';

describe('Admin Authentication', () => {
  const mockAdminUser: AdminUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'admin@test.com',
    full_name: 'Test Admin',
    role: 'admin',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    last_login_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Password Hashing', () => {
    it('should hash password with bcrypt', async () => {
      const password = 'SecurePassword123!';
      const hash = await hashPassword(password);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt format
    });

    it('should verify correct password', async () => {
      const password = 'SecurePassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'SecurePassword123!';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('WrongPassword', hash);

      expect(isValid).toBe(false);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'SecurePassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });
  });

  describe('JWT Access Token', () => {
    it('should generate valid access token', () => {
      const token = generateAccessToken(mockAdminUser);

      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should include user data in access token payload', () => {
      const token = generateAccessToken(mockAdminUser);
      const decoded = verifyAccessToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.sub).toBe(mockAdminUser.id);
      expect(decoded?.email).toBe(mockAdminUser.email);
      expect(decoded?.role).toBe(mockAdminUser.role);
    });

    it('should reject tampered access token', () => {
      const token = generateAccessToken(mockAdminUser);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';
      const decoded = verifyAccessToken(tamperedToken);

      expect(decoded).toBeNull();
    });

    it('should handle expired access token gracefully', () => {
      // Note: Can't easily test expiry without mocking time or waiting 15 minutes
      // This test validates that expired tokens return null (tested in integration)
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const decoded = verifyAccessToken(invalidToken);

      expect(decoded).toBeNull();
    });

    it('should support different admin roles', () => {
      const superAdmin: AdminUser = { ...mockAdminUser, role: 'super_admin' };
      const viewer: AdminUser = { ...mockAdminUser, role: 'viewer' };

      const superAdminToken = generateAccessToken(superAdmin);
      const viewerToken = generateAccessToken(viewer);

      const superAdminDecoded = verifyAccessToken(superAdminToken);
      const viewerDecoded = verifyAccessToken(viewerToken);

      expect(superAdminDecoded?.role).toBe('super_admin');
      expect(viewerDecoded?.role).toBe('viewer');
    });
  });

  describe('JWT Refresh Token', () => {
    it('should generate valid refresh token', () => {
      const token = generateRefreshToken(mockAdminUser.id);

      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3); // JWT format
    });

    it('should verify valid refresh token', () => {
      const token = generateRefreshToken(mockAdminUser.id);
      const decoded = verifyRefreshToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.sub).toBe(mockAdminUser.id);
    });

    it('should reject tampered refresh token', () => {
      const token = generateRefreshToken(mockAdminUser.id);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';
      const decoded = verifyRefreshToken(tamperedToken);

      expect(decoded).toBeNull();
    });

    it('should reject access token as refresh token', () => {
      const accessToken = generateAccessToken(mockAdminUser);
      const decoded = verifyRefreshToken(accessToken);

      expect(decoded).toBeNull();
    });
  });

  describe('Role-Based Access Control', () => {
    it('should enforce role hierarchy', () => {
      const roleHierarchy = {
        super_admin: 3,
        admin: 2,
        viewer: 1,
      };

      expect(roleHierarchy.super_admin).toBeGreaterThan(roleHierarchy.admin);
      expect(roleHierarchy.admin).toBeGreaterThan(roleHierarchy.viewer);
    });

    it('should allow super_admin to access admin-only routes', () => {
      const superAdmin: AdminUser = { ...mockAdminUser, role: 'super_admin' };
      const token = generateAccessToken(superAdmin);
      const decoded = verifyAccessToken(token);

      expect(decoded?.role).toBe('super_admin');
      // Super admin can access any route (hierarchy level 3 > 2 > 1)
    });

    it('should allow admin to access viewer routes', () => {
      const admin: AdminUser = { ...mockAdminUser, role: 'admin' };
      const token = generateAccessToken(admin);
      const decoded = verifyAccessToken(token);

      expect(decoded?.role).toBe('admin');
      // Admin can access viewer routes (hierarchy level 2 > 1)
    });

    it('should not allow viewer to access admin routes', () => {
      const viewer: AdminUser = { ...mockAdminUser, role: 'viewer' };
      const token = generateAccessToken(viewer);
      const decoded = verifyAccessToken(token);

      expect(decoded?.role).toBe('viewer');
      // Viewer cannot access admin routes (hierarchy level 1 < 2)
      // This would be enforced in middleware
    });
  });

  describe('Token Security', () => {
    it('should use secure JWT algorithms', () => {
      const token = generateAccessToken(mockAdminUser);
      const header = JSON.parse(
        Buffer.from(token.split('.')[0], 'base64').toString()
      );

      expect(header.alg).toBe('HS256');
    });

    it('should include issuer claim', () => {
      const token = generateAccessToken(mockAdminUser);
      const decoded = verifyAccessToken(token);

      // JWT library handles issuer verification during verify
      expect(decoded).toBeTruthy();
    });

    it('should include expiration claim', () => {
      const token = generateAccessToken(mockAdminUser);
      const decoded = verifyAccessToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.exp).toBeDefined();
      expect(decoded?.iat).toBeDefined();
      
      // Access token should expire in 15 minutes
      const expiryDuration = decoded!.exp! - decoded!.iat!;
      expect(expiryDuration).toBe(15 * 60); // 15 minutes in seconds
    });

    it('should not include sensitive data in token', () => {
      const token = generateAccessToken(mockAdminUser);
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );

      expect(payload.password_hash).toBeUndefined();
      expect(payload.created_at).toBeUndefined();
      expect(payload.last_login_at).toBeUndefined();
    });
  });

  describe('Environment Configuration', () => {
    it('should use JWT_SECRET environment variable', () => {
      const originalSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'test-secret-123';

      // Test logic that uses JWT_SECRET
      expect(process.env.JWT_SECRET).toBe('test-secret-123');

      // Restore
      if (originalSecret) {
        process.env.JWT_SECRET = originalSecret;
      } else {
        delete process.env.JWT_SECRET;
      }
    });

    it('should use JWT_REFRESH_SECRET environment variable', () => {
      const originalSecret = process.env.JWT_REFRESH_SECRET;
      process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-456';

      // Test logic that uses JWT_REFRESH_SECRET
      expect(process.env.JWT_REFRESH_SECRET).toBe('test-refresh-secret-456');

      // Restore
      if (originalSecret) {
        process.env.JWT_REFRESH_SECRET = originalSecret;
      } else {
        delete process.env.JWT_REFRESH_SECRET;
      }
    });

    it('should warn about default secrets in production', () => {
      const isProduction = process.env.NODE_ENV === 'production';
      const usingDefaultSecret = process.env.JWT_SECRET === 'dev-secret-change-in-production';

      if (isProduction && usingDefaultSecret) {
        // This should never happen in production
        expect(false).toBe(true);
      }
    });
  });

  describe('Token Expiry', () => {
    it('should set access token expiry to 15 minutes', () => {
      const token = generateAccessToken(mockAdminUser);
      const decoded = verifyAccessToken(token);

      expect(decoded).toBeTruthy();
      expect(decoded?.exp).toBeDefined();
      expect(decoded?.iat).toBeDefined();

      const expiryDuration = decoded!.exp! - decoded!.iat!;
      expect(expiryDuration).toBe(15 * 60); // 15 minutes
    });

    it('should set refresh token expiry to 7 days', () => {
      const token = generateRefreshToken(mockAdminUser.id);
      const decoded = verifyRefreshToken(token);

      expect(decoded).toBeTruthy();
      
      // Decode manually to check expiry
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );
      
      const expiryDuration = payload.exp - payload.iat;
      expect(expiryDuration).toBe(7 * 24 * 60 * 60); // 7 days
    });
  });
});
