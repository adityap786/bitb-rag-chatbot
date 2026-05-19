# Admin Panel & Tenant Config Management

## Overview
A simple admin panel (React/Next.js) allows superusers to view tenants, edit branding, and manage features. All changes are API-driven and auditable.

## Features
- List tenants
- Edit branding (logo, color)
- (Extendable) Edit features, plugins, RBAC

## Key Decisions
- Admin panel is stateless and API-driven
- All config is stored in open source DB (Supabase/Postgres)
- All infra is open source or free

---

This enables fast, secure, and extensible admin operations for superusers.
