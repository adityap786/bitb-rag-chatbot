# Branding & Metadata-Driven Customization

## Overview
Each tenant can configure branding (logo, color, etc.) via API. Branding is injected at runtime for all UI and widget flows, enabling full white-labeling and customization.

## Steps
1. Set branding via API or admin panel
2. Fetch branding for tenant at runtime
3. Inject branding into UI/widget responses

## Key Decisions
- Branding is stored as JSONB in the tenants table
- All branding is metadata-driven and can be extended
- All infra is open source or free

---

This enables world-class customization and white-labeling for all tenants.
