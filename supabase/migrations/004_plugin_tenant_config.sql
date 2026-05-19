-- Migration: plugin_tenant_config
CREATE TABLE IF NOT EXISTS plugin_tenant_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plugin_id text NOT NULL,
  config jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plugin_id)
);

CREATE INDEX IF NOT EXISTS idx_plugin_tenant ON plugin_tenant_config (tenant_id, plugin_id);
