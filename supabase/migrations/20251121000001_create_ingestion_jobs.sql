-- Migration: Create ingestion_jobs table for tracking data ingestion progress
-- Created: 2025-11-21
-- Purpose: Track ingestion job status, progress, and metadata for trial tenants

-- Ingestion Jobs Table
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES trial_tenants(tenant_id) ON DELETE CASCADE,
  
  -- Job metadata
  data_source VARCHAR(20) NOT NULL CHECK (data_source IN ('manual', 'upload', 'crawl')),
  source_url TEXT, -- for crawl jobs
  file_names TEXT[], -- for upload jobs
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  
  -- Results metadata
  pages_processed INT DEFAULT 0,
  chunks_created INT DEFAULT 0,
  embeddings_count INT DEFAULT 0,
  index_path TEXT, -- FAISS index file path or storage location
  
  -- Error handling
  error_message TEXT,
  error_details JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient queries
CREATE INDEX idx_ingestion_jobs_tenant ON ingestion_jobs(tenant_id);
CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs(status);
CREATE INDEX idx_ingestion_jobs_created ON ingestion_jobs(created_at DESC);
CREATE INDEX idx_ingestion_jobs_tenant_status ON ingestion_jobs(tenant_id, status);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ingestion_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
CREATE TRIGGER trigger_update_ingestion_jobs_updated_at
  BEFORE UPDATE ON ingestion_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_ingestion_jobs_updated_at();

-- Row Level Security (RLS) Policies
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role has full access to ingestion_jobs"
  ON ingestion_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Tenants can view their own ingestion jobs
CREATE POLICY "Tenants can view their own ingestion jobs"
  ON ingestion_jobs
  FOR SELECT
  TO authenticated
  USING (tenant_id = auth.uid());

-- Policy: Anon users can view their trial's ingestion jobs (via trial_token in JWT)
CREATE POLICY "Anon can view trial ingestion jobs"
  ON ingestion_jobs
  FOR SELECT
  TO anon
  USING (
    tenant_id IN (
      SELECT tenant_id FROM trial_tenants 
      WHERE setup_token = current_setting('request.jwt.claims', true)::json->>'trial_token'
    )
  );

-- Comments for documentation
COMMENT ON TABLE ingestion_jobs IS 'Tracks data ingestion job status and metadata for trial tenants';
COMMENT ON COLUMN ingestion_jobs.job_id IS 'Unique identifier for the ingestion job';
COMMENT ON COLUMN ingestion_jobs.tenant_id IS 'Reference to trial tenant';
COMMENT ON COLUMN ingestion_jobs.data_source IS 'Source type: manual, upload, or crawl';
COMMENT ON COLUMN ingestion_jobs.status IS 'Current job status: queued, processing, completed, failed, cancelled';
COMMENT ON COLUMN ingestion_jobs.progress IS 'Job progress percentage (0-100)';
COMMENT ON COLUMN ingestion_jobs.pages_processed IS 'Number of pages/documents processed';
COMMENT ON COLUMN ingestion_jobs.chunks_created IS 'Number of text chunks created';
COMMENT ON COLUMN ingestion_jobs.embeddings_count IS 'Number of embeddings generated';
COMMENT ON COLUMN ingestion_jobs.index_path IS 'Path to FAISS index or storage location';
COMMENT ON COLUMN ingestion_jobs.metadata IS 'Additional job metadata as JSON';
