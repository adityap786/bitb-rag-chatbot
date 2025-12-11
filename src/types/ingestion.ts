
export interface IngestionJob {
  job_id: string;
  tenant_id: string;
  data_source: 'manual' | 'upload' | 'crawl';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  pages_processed: number;
  chunks_created: number;
  embeddings_count: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export type IngestionStepKey = 'setup' | 'ingestion' | 'chunking' | 'embedding' | 'storing' | 'done';

export const INGESTION_STEP_ORDER: IngestionStepKey[] = [
  'setup',
  'ingestion',
  'chunking',
  'embedding',
  'storing',
  'done',
];

export const INGESTION_STEP_LABELS: Record<IngestionStepKey, string> = {
  setup: 'Initializing your workspace',
  ingestion: 'Collecting your business inputs',
  chunking: 'Generating clean, structured chunks',
  embedding: 'Creating high-quality embeddings',
  storing: 'Storing vectors in your database',
  done: 'Finalizing your RAG pipeline',
};

export type IngestionSseEventType =
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'pipeline.completed'
  | 'pipeline.cancelled';

export interface IngestionSseEvent {
  type: IngestionSseEventType;
  step: IngestionStepKey;
  ts: string;
  etaMs?: number;
  message?: string;
  runId?: string;
  tenantId?: string;
  processed?: number;
  total?: number;
}
