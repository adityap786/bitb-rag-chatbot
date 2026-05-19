# RBAC & Superuser Controls

## Overview
Role-based access control (RBAC) is enforced for all admin and plugin management endpoints. Superusers can manage tenants, plugins, and configs. RBAC is implemented via middleware and DB roles.

## Features
- Superuser/admin roles in users table
- Middleware for endpoint protection
- All actions are logged for audit

## Key Decisions
- RBAC is enforced at both API and DB levels
- All infra is open source or free

---

This ensures secure, auditable, and scalable admin operations.
