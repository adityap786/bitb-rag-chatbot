# Plugin System & Composable API Architecture

## Overview
This system enables dynamic, per-tenant extensibility for the RAG pipeline and chatbot platform. Plugins can be registered, enabled/disabled per tenant, and invoked as LLM tools, pipeline steps, or webhooks. All plugin management is RBAC-controlled and auditable.

## Key Decisions
- **Registry Pattern:** Central registry for plugin definitions, with per-tenant enable/disable mapping for scalability and fast lookup.
- **TypeScript Contracts:** All plugins must implement a strict interface for safety and composability.
- **API Endpoints:** REST endpoints for plugin listing, management, and per-tenant queries. All endpoints are stateless and RBAC-protected.
- **Performance:** In-memory registry for fast access; persistent config in DB (future step) for durability.
- **Scalability:** Registry is stateless and can be rehydrated from DB/config on service start. All plugin operations are O(1) for lookup and enable/disable.
- **Security:** Only superusers/tenant admins can manage plugins. All actions are logged.
- **Extensibility:** Plugins can be LLM tools, pipeline steps, webhooks, or custom types. Each plugin can define config schema and lifecycle hooks.

## API Endpoints
- `GET /api/plugins` — List all registered plugins (superuser)
- `POST /api/plugins/manage` — Enable/disable plugin for a tenant (admin/superuser)
- `GET /api/plugins/tenant?tenantId=...` — List plugins enabled for a tenant

## Next Steps

## DB-Backed Plugin Config & Loading
- Plugin/tenant config is stored in the `plugin_tenant_config` table (see migration 004_plugin_tenant_config.sql).
- Plugins are loaded and enabled for each tenant at runtime using `loadPluginsForTenant(tenantId)`.
- Plugin configs are fetched from the DB and passed to the plugin's `onLoad`/`handle` methods.

## Plugin Invocation
- Use `invokePluginsOfType(tenantId, type, input, context)` to call all enabled plugins of a type for a tenant.
- Plugins can be used as LLM tools, pipeline steps, branding injectors, etc.

## Next Steps
- Add RBAC middleware to API endpoints
- Integrate plugin invocation in pipeline/LLM toolchain
- Document plugin authoring and registration process

---

This architecture is designed for world-class extensibility, speed, and security in a multi-tenant SaaS environment.
