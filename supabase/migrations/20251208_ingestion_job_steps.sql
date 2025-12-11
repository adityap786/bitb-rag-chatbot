-- Migration: Track ingestion job step timings for SSE-driven loaders
-- Created: 2025-12-08

CREATE TABLE IF NOT EXISTS ingestion_job_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES ingestion_jobs(job_id) ON DELETE CASCADE,
  step_key VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  eta_ms INT,
  message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, step_key)
);

CREATE INDEX idx_ingestion_job_steps_job ON ingestion_job_steps(job_id);
CREATE INDEX idx_ingestion_job_steps_step ON ingestion_job_steps(step_key);
CREATE INDEX idx_ingestion_job_steps_status ON ingestion_job_steps(status);

CREATE OR REPLACE FUNCTION update_ingestion_job_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ingestion_job_steps_updated_at
  BEFORE UPDATE ON ingestion_job_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_ingestion_job_steps_updated_at();

COMMENT ON TABLE ingestion_job_steps IS 'Captures timing for each ingestion step so the widget loader can stay in sync with the pipeline.';
COMMENT ON COLUMN ingestion_job_steps.step_key IS 'Key identifying the ingestion step (e.g., setup, ingestion, chunking, etc.)';
COMMENT ON COLUMN ingestion_job_steps.status IS 'Lifecycle status for the step: pending, running, completed, or failed';
COMMENT ON COLUMN ingestion_job_steps.eta_ms IS 'Estimated duration supplied by the backend (ms)';
COMMENT ON COLUMN ingestion_job_steps.started_at IS 'Timestamp when the step started';
COMMENT ON COLUMN ingestion_job_steps.completed_at IS 'Timestamp when the step finished';
