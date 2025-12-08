-- Migration: Create rollout_state and rollout_audit tables for feature rollout management

CREATE TABLE IF NOT EXISTS rollout_state (
  tenant_id text NOT NULL,
  feature text NOT NULL,
  percentage int NOT NULL DEFAULT 0,
  updated_by text,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (tenant_id, feature)
);

CREATE TABLE IF NOT EXISTS rollout_audit (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  feature text NOT NULL,
  old_percentage int,
  new_percentage int,
  actor text,
  reason text,
  created_at timestamptz DEFAULT now()
);
