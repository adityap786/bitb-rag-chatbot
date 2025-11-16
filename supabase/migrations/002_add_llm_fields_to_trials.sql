-- Add per-tenant LLM provider fields
ALTER TABLE trials
  ADD COLUMN IF NOT EXISTS llm_provider TEXT DEFAULT 'groq';

ALTER TABLE trials
  ADD COLUMN IF NOT EXISTS llm_model TEXT DEFAULT 'llama-3.1-70b-instruct';

-- Index for provider
CREATE INDEX IF NOT EXISTS trials_llm_provider_idx ON trials(llm_provider);
