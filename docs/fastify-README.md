# BiTB - Fastify Backend Setup & Usage

## Quick Start

### Prerequisites
- Node.js 18+ 
- Python 3.8+
- npm or yarn

### Installation

#### 1. Install Node.js Dependencies

```bash
npm install fastify@^4.0.0 \
  @fastify/cors \
  @fastify/jwt \
  @fastify/multipart \
  @fastify/rate-limit \
  @fastify/static
```

#### 2. Install Python Dependencies

```bash
cd python
pip install beautifulsoup4 requests pdfplumber python-docx sentence-transformers faiss-cpu
```

### Running the Fastify Server

```bash
# Development mode
node server-fastify.js

# With environment variables
JWT_SECRET=my-secret-key PORT=3001 node server-fastify.js
```

Server will start on `http://localhost:3001`

### Running the Next.js Frontend

```bash
# In the main project directory
npm run dev
```

Frontend will start on `http://localhost:3000`

## API Testing with curl

### 1. Start Trial

```bash
curl -X POST http://localhost:3001/api/start-trial \
  -H "Content-Type: application/json" \
  -d '{
    "site_origin": "https://example.com",
    "admin_email": "admin@example.com",
    "display_name": "Support Assistant",
    "theme": {
      "primary": "#4f46e5",
      "theme": "auto"
    }
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "trial_token": "tr_abc123xyz...",
  "expires_at": "2025-01-18T10:00:00.000Z",
  "embed_code": "<script src=\"http://localhost:3000/bitb-widget.js\" data-trial-token=\"tr_abc123xyz...\" data-theme=\"auto\"></script>",
  "message": "Trial created successfully. Starting ingestion..."
}
```

### 2. Start Ingestion (Website URL)

```bash
# Save the trial_token from step 1
TRIAL_TOKEN="tr_abc123xyz..."

# Start website crawl
curl -X POST http://localhost:3001/api/ingest \
  -F "trial_token=$TRIAL_TOKEN" \
  -F "site_url=https://bitsandbytes.ltd"
```

**Expected Response**:
```json
{
  "success": true,
  "job_id": "job_xyz789",
  "status": "queued",
  "status_url": "/api/ingest/status/job_xyz789",
  "message": "Ingestion started. Check status for progress."
}
```

### 3. Start Ingestion (File Upload)

```bash
# Upload files
curl -X POST http://localhost:3001/api/ingest \
  -F "trial_token=$TRIAL_TOKEN" \
  -F "files=@document1.pdf" \
  -F "files=@document2.docx" \
  -F "files=@document3.txt"
```

### 4. Check Ingestion Status

```bash
# Poll job status (use job_id from step 2/3)
JOB_ID="job_xyz789"

curl -X GET "http://localhost:3001/api/ingest/status/$JOB_ID"
```

**Expected Responses**:

While processing:
```json
{
  "job_id": "job_xyz789",
  "status": "processing",
  "created_at": "2025-01-15T10:00:00.000Z",
  "completed_at": null,
  "error": null
}
```

When completed:
```json
{
  "job_id": "job_xyz789",
  "status": "completed",
  "created_at": "2025-01-15T10:00:00.000Z",
  "completed_at": "2025-01-15T10:02:15.000Z",
  "error": null,
  "index_path": "/indexes/tr_abc123xyz.faiss",
  "documents_count": 45
}
```

### 5. Ask Question (RAG Query)

```bash
# Query the chatbot
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "trial_token": "'$TRIAL_TOKEN'",
    "origin": "https://example.com",
    "query": "What services do you offer?",
    "session_id": "sess_user123"
  }'
```

**Expected Response**:
```json
{
  "answer": "We provide RAG-based chatbot widgets for service businesses...",
  "sources": [
    {
      "url": "https://bitsandbytes.ltd/services",
      "title": "Our Services",
      "snippet": "We provide RAG-based chatbot widgets..."
    }
  ],
  "confidence": 0.87,
  "session_id": "sess_user123"
}
```

### 6. Check Trial Status

```bash
curl -X GET "http://localhost:3001/api/check-trial?trial_token=$TRIAL_TOKEN&origin=https://example.com"
```

**Expected Response**:
```json
{
  "valid": true,
  "is_preview": false,
  "expires_at": "2025-01-18T10:00:00.000Z",
  "usage": {
    "count": 5,
    "limit": 100
  }
}
```

### 7. Check Voice Support

```bash
curl -X GET http://localhost:3001/api/voicesupport
```

**Expected Response**:
```json
{
  "web_speech_supported": true,
  "fallback_audio_url": null
}
```

## Python Ingestion Worker Usage

### Crawl Website

```bash
cd python

python ingest-worker.py \
  --job job_abc123 \
  --trial tr_xyz789 \
  --source https://bitsandbytes.ltd
```

### Process Files

```bash
python ingest-worker.py \
  --job job_def456 \
  --trial tr_xyz789 \
  --files ../uploads/doc1.pdf ../uploads/doc2.docx
```

### Purge Expired Indexes

```bash
python ingest-worker.py --purge
```

### With Environment Variables

```bash
# Use HuggingFace API instead of local embeddings
export HF_API_KEY=hf_xxxxxxxxxxxxx
export USE_LOCAL_EMBEDDINGS=false

python ingest-worker.py \
  --job job_ghi789 \
  --trial tr_xyz789 \
  --source https://example.com
```

## Environment Configuration

### Backend Environment Variables

Create `.env` file in project root:

```bash
# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# JWT Configuration
JWT_SECRET=change-this-in-production-use-long-random-string

# Widget Configuration
WIDGET_URL=http://localhost:3000
FALLBACK_AUDIO_URL=

# External Services (Optional)
HF_API_KEY=                    # HuggingFace API key for embeddings
OPENROUTER_KEY=                # OpenRouter API key for LLM
PINECONE_KEY=                  # Pinecone API key for vector store
PINECONE_ENVIRONMENT=          # Pinecone environment (e.g., us-west1-gcp)

# Feature Flags
USE_LOCAL_VECTORS=true         # Use FAISS locally vs Pinecone
```

### Python Worker Environment Variables

Create `python/.env`:

```bash
# Embeddings Configuration
USE_LOCAL_EMBEDDINGS=true
HF_API_KEY=

# Storage Configuration
INDEXES_DIR=./indexes
```

## Switching Between Local and Cloud Services

### Local Embeddings → HuggingFace API

**Local (Free)**:
```bash
# Python
USE_LOCAL_EMBEDDINGS=true
# No HF_API_KEY needed
```

**HuggingFace API**:
```bash
# Python
USE_LOCAL_EMBEDDINGS=false
HF_API_KEY=hf_xxxxxxxxxxxxx
```

### FAISS → Pinecone

**FAISS (Local, Free)**:
```javascript
// server-fastify.js - VectorStoreAdapter
class VectorStoreAdapter {
  constructor() {
    this.useLocal = process.env.USE_LOCAL_VECTORS !== 'false';
  }
}
```

**Pinecone (Cloud)**:
```javascript
// Replace VectorStoreAdapter with:
const { PineconeClient } = require('@pinecone-database/pinecone');

class VectorStoreAdapter {
  constructor() {
    this.pinecone = new PineconeClient();
    await this.pinecone.init({
      apiKey: process.env.PINECONE_KEY,
      environment: process.env.PINECONE_ENVIRONMENT
    });
    this.index = this.pinecone.Index('bitb-trials');
  }

  async search(trialToken, query, topK = 6) {
    const queryEmbedding = await embeddings.embed(query);
    const results = await this.index.query({
      vector: queryEmbedding,
      topK,
      filter: { trial_token: trialToken },
      includeMetadata: true
    });
    return results.matches;
  }
}
```

### No LLM → OpenRouter

**Retrieval-Only (Free)**:
```javascript
// server-fastify.js - POST /api/ask
const topResult = results[0];
const answer = topResult.text;  // Direct retrieval
```

**With LLM (Paid)**:
```javascript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'anthropic/claude-3-haiku',
    messages: [
      { role: 'system', content: 'Answer based on context...' },
      { role: 'user', content: `Context: ${results.map(r => r.text).join('\n\n')}\n\nQuestion: ${query}` }
    ]
  })
});
const data = await response.json();
const answer = data.choices[0].message.content;
```

## Widget Embedding

After creating a trial, embed the widget on your website:

### Basic Embedding

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
</head>
<body>
  <h1>Welcome to My Website</h1>
  
  <!-- BiTB Widget -->
  <script 
    src="http://localhost:3000/bitb-widget.js" 
    data-trial-token="tr_abc123xyz..." 
    data-theme="auto">
  </script>
</body>
</html>
```

### Preview Mode (No Trial Token)

```html
<!-- For testing/preview with bitsandbytes.ltd knowledge -->
<script 
  src="http://localhost:3000/bitb-widget.js" 
  data-trial-token="preview" 
  data-theme="dark">
</script>
```

### React Integration

```jsx
import { useEffect } from 'react';

function MyPage() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'http://localhost:3000/bitb-widget.js';
    script.setAttribute('data-trial-token', 'tr_abc123xyz...');
    script.setAttribute('data-theme', 'auto');
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return <div>My Page Content</div>;
}
```

## Development Workflow

### 1. Start Both Servers

**Terminal 1** (Next.js frontend):
```bash
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2** (Fastify backend):
```bash
node server-fastify.js
# Runs on http://localhost:3001
```

### 2. Test Trial Flow

1. Open http://localhost:3000
2. Click "Try Widget — 3 Days Free"
3. Fill in trial form and submit
4. Copy embed code
5. Create test HTML file with embed code
6. Open test file in browser
7. Widget should appear and respond to queries

### 3. Test Preview Mode

1. Click "Preview BiTB Knowledge" button
2. Widget activates with preview badge
3. Ask questions about BiTB (e.g., "what is bitb", "pricing", "trial")
4. Should receive 10+ different responses with sources

## Production Deployment

### 1. Deploy Fastify Backend

**Option A: VPS (DigitalOcean, Linode)**
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server-fastify.js --name bitb-api -i max

# Save configuration
pm2 save
pm2 startup
```

**Option B: Serverless (AWS Lambda, Vercel)**
```javascript
// Export Fastify as serverless function
export default async (req, res) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};
```

### 2. Deploy Python Worker

**Option A: Background Service**
```bash
# Create systemd service
sudo nano /etc/systemd/system/bitb-worker.service
```

**Option B: Modal.com**
```python
import modal
stub = modal.Stub("bitb-ingestion")

@stub.function(schedule=modal.Period(minutes=5))
def process_queue():
    # Process pending ingestion jobs
    pass
```

### 3. Environment Variables

Set production environment variables:
```bash
JWT_SECRET=$(openssl rand -base64 32)
WIDGET_URL=https://bitb.ltd
USE_LOCAL_VECTORS=false
PINECONE_KEY=your-key
HF_API_KEY=your-key
```

### 4. Database Migration

Replace in-memory stores with PostgreSQL:
```sql
CREATE TABLE trials (
  trial_token VARCHAR(64) PRIMARY KEY,
  site_origin VARCHAR(255) NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  theme JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  usage_count INTEGER DEFAULT 0,
  queries_limit INTEGER DEFAULT 100
);

CREATE INDEX idx_expires_at ON trials(expires_at);
CREATE INDEX idx_status ON trials(status);
```

## Troubleshooting

### Fastify Server Won't Start

```bash
# Check if port is already in use
lsof -i :3001

# Kill existing process
kill -9 <PID>

# Or use different port
PORT=3002 node server-fastify.js
```

### Python Worker Errors

```bash
# Missing dependencies
pip install -r python/requirements.txt

# FAISS installation issues (macOS)
conda install -c pytorch faiss-cpu

# Sentence-transformers model download
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"
```

### Widget Not Loading

1. Check CORS settings in server-fastify.js
2. Verify WIDGET_URL environment variable
3. Check browser console for errors
4. Test with `curl` to verify API is responding

### Ingestion Fails

1. Check robots.txt allows crawling
2. Verify file size limits (max 10MB)
3. Check Python worker logs
4. Test with simpler URLs/files first

## Performance Optimization

### Fastify Configuration

```javascript
const fastify = require('fastify')({
  logger: process.env.NODE_ENV === 'production',
  trustProxy: true,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
  disableRequestLogging: true,
  bodyLimit: 10 * 1024 * 1024  // 10MB
});
```

### Enable Compression

```bash
npm install @fastify/compress
```

```javascript
fastify.register(require('@fastify/compress'), {
  threshold: 1024
});
```

### Add Caching

```bash
npm install @fastify/caching
```

```javascript
fastify.register(require('@fastify/caching'), {
  privacy: 'public',
  expiresIn: 3600  // 1 hour
});
```

## Monitoring

### Add Health Check Endpoint

```javascript
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
});
```

### Add Metrics

```bash
npm install @fastify/metrics
```

```javascript
fastify.register(require('@fastify/metrics'), {
  endpoint: '/metrics'
});
```

## Support & Resources

- **Documentation**: See `docs/fastify-requirements.md`
- **QA Checklist**: See `docs/qa-checklist.md`
- **Fastify Docs**: https://www.fastify.io/docs/latest/
- **Sentence Transformers**: https://www.sbert.net/
- **FAISS**: https://github.com/facebookresearch/faiss

## License

MIT License - Bits and Bytes Ltd.
