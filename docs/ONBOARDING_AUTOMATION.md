# Onboarding Automation & Tenant Resource Setup

## Overview
Automated onboarding creates a new tenant, configures branding/features, and sets up all required DB and resource entries. This is triggered via API or CLI and is fully auditable.

## Steps
1. Create tenant row in `tenants` table
2. Initialize default config, branding, and features
3. Set up plugin config, rate limiting, and audit logs
4. Return tenant object for further use

## Key Decisions
- All onboarding is API-driven for automation and CI/CD integration
- All configs are stored in open source DB (Supabase/Postgres)
- No paid services are used; all infra is open source or free

---

This ensures fast, reliable, and scalable onboarding for all tenants.
