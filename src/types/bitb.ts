// BiTB RAG SaaS Platform TypeScript Interfaces

// Trial
export interface Trial {
  trial_token: string;
  site_origin: string;
  admin_email: string;
  display_name: string;
  created_at: Date;
  expires_at: Date;
  status: 'active' | 'expired' | 'upgraded';
  usage: {
    queries_count: number;
    queries_limit: number;
  };
  theme: WidgetTheme;
}

// Widget Theme
export interface WidgetTheme {
  primary: string;
  accent: string;
  chat_name: string;
  avatar_url?: string;
  theme: 'light' | 'dark' | 'auto';
}

// Data Source
export interface DataSource {
  type: 'url' | 'files';
  url?: string;
  crawl_depth?: number;
  files?: string[];
}

// Ingestion Job
export interface IngestionJob {
  job_id: string;
  trial_token: string;
  data_source: DataSource;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  pages_processed: number;
  total_pages: number;
  chunks_created: number;
  error?: string;
  started_at: Date;
  completed_at?: Date;
}

// RAG Query
export interface RAGQuery {
  trial_token: string;
  query: string;
  session_id: string;
}

// RAG Response
export interface RAGResponse {
  answer: string;
  sources: RAGSource[];
  confidence: number;
  usage: {
    queries_used: number;
    queries_remaining: number;
  };
}

export interface RAGSource {
  text: string;
  url: string;
  score: number;
}

// Chat Message
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: RAGSource[];
}

// Trial Setup Form Data
export interface TrialSetupData {
  dataSource: 'url' | 'files';
  websiteUrl?: string;
  crawlDepth?: number;
  files?: File[];
  primaryColor: string;
  accentColor: string;
  chatName: string;
  avatarUrl?: string;
  theme: 'light' | 'dark' | 'auto';
  siteName: string;
  adminEmail: string;
  siteOrigin: string;
  agreeToTerms: boolean;
}
