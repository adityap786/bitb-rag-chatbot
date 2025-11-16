# BiTB - Fastify Migration Requirements

## Project Overview

BiTB (Bits and Bytes Ltd.) is a RAG-based chatbot widget platform for service businesses including legal firms, restaurants, hospitals, and government websites. This document outlines the requirements for the Fastify backend migration and "Try Widget — 3 Days Free Trial" implementation.

## Core Requirements

### 1. Backend Architecture
- **Framework**: Fastify v4+ (migrated from Express)
- **Performance**: High-throughput, low-latency for multi-tenant SaaS
- **Concurrency**: Ready for e-commerce scale concurrent chat workloads
- **Infrastructure**: Free-tier/local-first with clear migration path to production

### 2. Trial System
- **Duration**: 3 days (72 hours) from creation
- **No Credit Card**: Required during trial period
- **Quotas**: 
  - Max 50 pages crawl or 5 files upload
  - Max 100 query responses per trial
  - Max 10MB per file
  - Crawl depth: 2 levels
- **Auto-Purge**: Trial data automatically deleted after expiry

### 3. Security
- **Origin Locking**: Trial tokens validated against site_origin
- **Rate Limiting**: 10 requests/minute for /api/ask endpoint
- **Token Format**: JWT (production) with UUID fallback (mock)
- **Input Validation**: JSON Schema validation on all routes

### 4. Ingestion Pipeline
- **Sources**: Website URL crawl OR file upload (PDF, DOCX, TXT, HTML)
- **Processing**: 
  - Respect robots.txt
  - Extract main content (BeautifulSoup)
  - Chunk text (~600 tokens, 100 overlap)
  - Generate embeddings (sentence-transformers local or HF API)
- **Storage**: FAISS index per trial_token with metadata

### 5. RAG Retrieval
- **Strategy**: Retrieval-first (minimize LLM calls)
- **Top-K**: 6 results default
- **Response**: Include answer, sources (with URLs), confidence score
- **Context**: Last 5 messages for conversation continuity

## API Endpoints

### POST /api/start-trial
Creates new trial with token, embed code, and initiates ingestion.

**Request Schema**:
```json
{
  "site_origin": "https://example.com",
  "admin_email": "admin@example.com",
  "display_name": "Support Assistant",
  "data_source": { "type": "url", "url": "https://example.com" },
  "theme": { "primary": "#4f46e5", "theme": "auto" }
}
```

**Response**:
```json
{
  "success": true,
  "trial_token": "tr_abc123...",
  "expires_at": "2025-01-18T10:00:00Z",
  "embed_code": "<script src=\"...\">",
  "ingestion_job_id": "job_xyz789",
  "message": "Trial created successfully"
}
```

### POST /api/ingest
Starts content ingestion job (website crawl or file processing).

**Request**: Multipart form data with trial_token, site_url OR files

**Response**:
```json
{
  "success": true,
  "job_id": "job_xyz789",
  "status": "queued",
  "status_url": "/api/ingest/status/job_xyz789"
}
```

### GET /api/ingest/status/:job_id
Polls ingestion job progress.

**Response**:
```json
{
  "job_id": "job_xyz789",
  "status": "processing|completed|failed",
  "created_at": "2025-01-15T10:00:00Z",
  "completed_at": "2025-01-15T10:02:00Z",
  "documents_count": 45,
  "index_path": "/indexes/tr_abc123.faiss"
}
```

### POST /api/ask
RAG query endpoint with rate limiting.

**Request**:
```json
{
  "trial_token": "tr_abc123",
  "origin": "https://example.com",
  "query": "What are your services?",
  "session_id": "sess_xyz",
  "context": [{ "role": "user", "content": "..." }]
}
```

**Response**:
```json
{
  "answer": "We provide...",
  "sources": [
    {
      "url": "https://example.com/services",
      "title": "Our Services",
      "snippet": "..."
    }
  ],
  "confidence": 0.85,
  "session_id": "sess_xyz"
}
```

### GET /api/check-trial
Validates trial token and checks expiry/usage.

**Query Params**: `trial_token`, `origin`

**Response**:
```json
{
  "valid": true,
  "is_preview": false,
  "expires_at": "2025-01-18T10:00:00Z",
  "usage": { "count": 25, "limit": 100 }
}
```

### GET /api/voicesupport
Returns voice greeting capabilities.

**Response**:
```json
{
  "web_speech_supported": true,
  "fallback_audio_url": "https://bitb.ltd/audio/greeting.mp3"
}
```

## Frontend Components

### TryWidgetSection.jsx
React component for trial signup flow with 4 steps:
1. Data Source Selection (URL or files)
2. Theme Customization (colors, chat name)
3. Admin Details (email, consent)
4. Embed Code Display (with polling for ingestion completion)

### bitb-widget.js
Embeddable IIFE widget with:
- Black background (#000), white text (#fff)
- Floating bubble + chat overlay
- Smooth slide animations on every bot response
- Auto-scroll to latest message
- Session persistence (sessionStorage)
- Voice greeting (Web Speech API + MP3 fallback)
- Mute toggle (localStorage)
- Preview mode with 10+ pre-seeded responses
- Mobile-responsive design
- Full accessibility (ARIA-live, keyboard nav)

## Python Ingestion Worker

### ingest-worker.py
CLI tool for content processing:

```bash
# Crawl website
python ingest-worker.py --job job_xyz --trial tr_abc --source https://example.com

# Process files
python ingest-worker.py --job job_xyz --trial tr_abc --files doc1.pdf doc2.docx

# Purge expired indexes
python ingest-worker.py --purge
```

**Features**:
- Robots.txt compliance
- Multi-format support (HTML, PDF, DOCX, TXT)
- Chunking with overlap
- Local embeddings (sentence-transformers) or HF API
- FAISS index creation
- TTL-based purge

## Environment Variables

### Backend (Fastify)
```bash
# Server
PORT=3001
HOST=0.0.0.0
JWT_SECRET=your-secret-key

# External Services (Optional)
HF_API_KEY=hf_xxxxx              # HuggingFace embeddings
OPENROUTER_KEY=sk-xxxxx          # LLM fallback
PINECONE_KEY=xxxxx               # Production vector store

# Configuration
USE_LOCAL_VECTORS=true           # Use FAISS locally
WIDGET_URL=http://localhost:3000 # Widget script URL
FALLBACK_AUDIO_URL=              # MP3 for voice greeting
```

### Python Worker
```bash
# Embeddings
USE_LOCAL_EMBEDDINGS=true
HF_API_KEY=hf_xxxxx

# Storage
INDEXES_DIR=./indexes
```

## Production Migration Path

### Phase 1: Database Migration
- Replace in-memory `Map` stores with PostgreSQL/Supabase
- Schema: trials, ingestion_jobs, usage_metrics tables
- Implement database connection pooling

### Phase 2: Vector Store Migration
- Replace FAISS with Pinecone or Weaviate
- Implement VectorStoreAdapter with production client
- Namespace indexes by trial_token

### Phase 3: Queue System
- Replace in-memory job queue with Redis + BullMQ
- Implement worker process for ingestion
- Add job retry logic and dead letter queue

### Phase 4: Horizontal Scaling
- Use stateless JWT tokens (no session state)
- Deploy multiple Fastify instances behind load balancer
- Implement Redis for shared caching
- Use PM2 cluster mode

### Phase 5: Monitoring & Observability
- Add Prometheus metrics (@fastify/metrics)
- Implement structured JSON logging
- Set up alerts for queue length, error rates
- Track LLM token usage and costs

## Technology Stack

### Backend
- **Framework**: Fastify v4+
- **Plugins**: cors, jwt, multipart, rate-limit, static
- **Validation**: JSON Schema (Ajv)
- **Runtime**: Node.js 18+

### Frontend
- **Widget**: Vanilla JavaScript (IIFE)
- **Trial UI**: React + Tailwind CSS
- **Icons**: Lucide React

### Python Worker
- **Web**: requests, beautifulsoup4
- **PDFs**: pdfplumber
- **DOCX**: python-docx
- **Embeddings**: sentence-transformers
- **Vector Store**: faiss-cpu
- **Environment**: Python 3.8+

### Optional Services
- **LLM**: OpenRouter, HuggingFace
- **Vector DB**: Pinecone, Weaviate
- **Queue**: Redis, BullMQ
- **Database**: PostgreSQL, Supabase

## Testing Requirements

### Manual QA Checklist
1. Start trial → receives embed code
2. Upload PDF/URL → ingestion completes
3. Paste embed snippet → widget appears
4. Ask questions → retrieval-based answers with sources
5. Check expiry → widget shows upgrade CTA after 3 days
6. Test quotas → rate limiting works
7. Voice greeting → plays on first hover
8. Mute toggle → persists across sessions
9. Session persistence → conversation survives page refresh
10. Mobile responsive → works on small screens
11. Keyboard accessibility → ESC closes, Enter sends
12. Preview mode → 10+ responses from bitsandbytes.ltd

### Automated Tests
- Unit tests for adapters (VectorStoreAdapter, EmbeddingsAdapter)
- Integration tests for API routes
- E2E tests for widget embedding
- Load tests for concurrent /api/ask requests

## Performance Targets

- **Trial Creation**: < 500ms response time
- **Ingestion**: < 5 minutes for 50 pages or 5 files
- **Query Response**: < 2 seconds for retrieval-first answers
- **Concurrent Users**: Support 100+ simultaneous chat sessions
- **Widget Load Time**: < 1 second initial load
- **Animation Frame Rate**: 60 FPS for smooth transitions

## Cost Optimization

### Free Tier Stack (Development)
- Local sentence-transformers embeddings
- FAISS vector storage
- No LLM calls (retrieval-only answers)
- Mock in-memory data stores
- **Estimated Cost**: $0/month

### Production Stack (Paid)
- HuggingFace Inference API: ~$10/month
- Pinecone Starter: $70/month (100k vectors)
- PostgreSQL (Supabase Free): $0-25/month
- Redis (Upstash): $0-10/month
- Optional LLM (OpenRouter): Pay-per-token
- **Estimated Cost**: $80-120/month base + usage

## Changelog

### 2025-01-15T12:00:00Z - Initial Fastify Migration Spec
- Created comprehensive requirements document
- Defined 6 API endpoints with JSON schemas
- Specified trial system with 3-day expiry and auto-purge
- Documented ingestion pipeline (crawl + file upload)
- Outlined RAG retrieval strategy (retrieval-first)
- Added production migration roadmap (5 phases)
- Defined technology stack and cost optimization
- Created deliverables: TryWidgetSection.jsx, server-fastify.js, ingest-worker.py, theme_config.json
- Specified manual QA checklist and automated test requirements
- Set performance targets (< 2s query response, 60 FPS animations)

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-01-15T12:00:00Z  
**Status**: Implementation Ready
