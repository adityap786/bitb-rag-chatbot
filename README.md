# BiTB - RAG SaaS Platform

**BiTB** (Bits and Bytes Talk Bot) is a complete RAG (Retrieval-Augmented Generation) SaaS platform that enables service businesses to create AI chatbots trained on their own data in minutes.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15.3.5-black)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.9+-blue)](https://python.org)

## 🚀 Features

- **3-Day Free Trial**: Instant setup, no credit card required
- **Data Ingestion**: Upload files (PDF, DOCX, TXT) or crawl website URLs
- **Plug-and-Play Widget**: Copy-paste embed code, works on any site
- **Voice Greeting**: Female voice greets visitors on first hover (per session)
- **RAG-Powered**: Answers based on actual business data, not AI hallucinations
- **Free-Tier First**: Uses local embeddings (sentence-transformers) and free LLM endpoints
- **Auto-Purge**: Trial data deleted after expiry for minimal cost

## 📋 Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## 🛠️ Tech Stack

### Frontend (Next.js)
- **Next.js 15.3.5** with App Router
- **React 19** with TypeScript
- **Tailwind CSS v4** for styling
- **Framer Motion** for animations
- **Radix UI** for accessible components

### Embeddable Widget
- Pure JavaScript (ES6+ IIFE)
- No framework dependencies
- Web Speech API for voice greeting

### Backend (Node.js)
- Next.js API Routes (serverless)
- TypeScript
- JSON storage (local dev) or database (production)

### Python Ingestion Worker
- **sentence-transformers** for local embeddings (free)
- **FAISS** for vector storage (free, local)
- **BeautifulSoup4** for HTML parsing
- **pypdf** & **python-docx** for document extraction
- **tiktoken** for token counting

### Optional LLM Endpoints (Free-Tier)
- OpenRouter free models
- Hugging Face Inference API
- Local Ollama (self-hosted)

## 📁 Project Structure

```
bitb-project/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # BiTB Homepage
│   │   ├── layout.tsx                  # Root layout
│   │   ├── api/
│   │   │   ├── start-trial/route.ts    # POST /api/start-trial
│   │   │   ├── ask/route.ts            # POST /api/ask (RAG)
│   │   │   ├── check-trial/route.ts    # GET /api/check-trial
│   │   │   └── voicesupport/route.ts   # GET /api/voicesupport
│   │   └── globals.css
│   ├── components/
│   │   └── ui/                         # shadcn/ui components
│   └── types/
│       └── bitb.ts                     # TypeScript interfaces
├── public/
│   ├── bitb-widget.js                  # Embeddable widget script
│   └── greeting-fallback.mp3           # Cached voice fallback (TTS)
├── python/
│   ├── ingest-worker.py                # Main ingestion worker
│   ├── requirements.txt                # Python dependencies
│   └── utils/                          # Helper modules (optional)
├── data/
│   └── faiss_indexes/                  # FAISS vector stores per trial
├── docs/
│   ├── EMBED_EXAMPLE.md                # Embed snippet examples
│   └── DESIGN_CONFIG.json              # Design configuration schema
├── tests/
│   ├── widget.test.ts                  # Widget unit tests
│   └── voice-greeting.test.ts          # Voice greeting tests
├── REQUIREMENTS.md                      # Comprehensive project documentation
├── README.md                            # This file
├── CHANGELOG.md                         # Version history
├── package.json
└── tsconfig.json
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** (with npm, yarn, pnpm, or bun)
- **Python 3.9+** (for ingestion worker)
- **Git**

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd bitb-project
```

### 2. Install Frontend Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

### 3. Install Python Dependencies

```bash
cd python
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 4. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```env
# Widget URL (for embed code generation)
NEXT_PUBLIC_WIDGET_URL=http://localhost:3000

# Python Worker Configuration (optional)
EMBEDDING_MODE=local  # "local" or "huggingface"
VECTOR_STORE=faiss    # "faiss", "pinecone", or "weaviate"
MAX_FILE_SIZE_MB=10
MAX_TOKENS=100000
CRAWL_MAX_DEPTH=3

## Optional: Free-tier LLM configuration
LLM_PROVIDER=groq  # "groq", "openrouter", "huggingface", "ollama"
GROQ_API_KEY=       # Optional (free tier / paid tiers) - required for Groq
GROQ_BASE_URL=https://api.groq.com/openai/v1
HF_API_KEY=         # Optional for HF fallback
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the BiTB homepage.

### 6. Test the Widget Locally

The embeddable widget is available at:
```
http://localhost:3000/bitb-widget.js
```

To test on a different site, add:
```html
<script src="http://localhost:3000/bitb-widget.js" 
        data-trial-token="tr_test123456789abcdef0123456789abc" 
        data-theme="auto"></script>
```

## 📦 Deployment

### Frontend Deployment (Vercel/Netlify)

1. **Push to Git** (GitHub, GitLab, Bitbucket)

2. **Deploy to Vercel** (recommended):
```bash
npm i -g vercel
vercel
```

Or use the Vercel dashboard:
- Import your Git repository
- Framework: Next.js
- Build command: `npm run build`
- Output directory: `.next`

3. **Set Environment Variables** in Vercel dashboard

### Python Worker Deployment

**Option 1: Modal (Recommended)**
```bash
pip install modal
modal deploy python/ingest-worker.py
```

**Option 2: Railway/Render**
- Deploy as a background worker
- Set up job queue (BullMQ, Celery)

**Option 3: AWS Lambda**
- Package as Lambda function
- Use SQS for job queue

### Cron Job for Auto-Purge

Set up a daily cron job to purge expired trials:

```bash
# crontab -e
0 2 * * * cd /path/to/bitb && python python/ingest-worker.py --purge
```

Or use Vercel Cron:
```json
{
  "crons": [{
    "path": "/api/purge-trials",
    "schedule": "0 2 * * *"
  }]
}
```

## ⚙️ Configuration

### Widget Customization

The widget accepts these data attributes:

```html
<script src="https://bitb.ltd/bitb-widget.js" 
        data-trial-token="tr_xxx"           <!-- Required -->
        data-theme="auto"                   <!-- "light", "dark", "auto" -->
        data-position="bottom-right"        <!-- Position of widget button -->
        data-api-url="https://bitb.ltd">   <!-- Custom API URL -->
</script>
```

### Free-Tier Options

**Embeddings:**
- Primary: `sentence-transformers/all-MiniLM-L6-v2` (local, free)
- Fallback: Hugging Face Inference API (1000 requests/month)

**Vector Store:**
- Primary: FAISS (local, free)
- Fallback: Pinecone free tier (1 index, 100k vectors)

**LLM:**
- OpenRouter: `google/gemini-flash-1.5-8b:free`
- HuggingFace: `mistralai/Mixtral-8x7B-Instruct-v0.1`
- Ollama: `llama3.2:1b` (local, self-hosted)

### Switching Configurations

Edit environment variables to switch between free-tier options:

```env
# Use HuggingFace instead of local embeddings
EMBEDDING_MODE=huggingface
HF_API_KEY=your_hf_api_key

# Use Pinecone instead of FAISS
VECTOR_STORE=pinecone
PINECONE_API_KEY=your_pinecone_key
PINECONE_ENVIRONMENT=your_env

# Use Ollama for LLM
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
```

## 📚 API Documentation

### POST /api/start-trial

Create a new trial and start ingestion.

**Request:**
```json
{
  "site_origin": "https://example.com",
  "admin_email": "owner@example.com",
  "display_name": "Example Site",
  "data_source": {
    "type": "url",
    "url": "https://example.com",
    "crawl_depth": 2
  },
  "theme": {
    "primary": "#DD1111",
    "accent": "#111111",
    "chat_name": "Support Bot",
    "theme": "auto"
  }
}
```

**Response:**
```json
{
  "success": true,
  "trial_token": "tr_abc123...",
  "expires_at": "2025-11-07T12:00:00Z",
  "embed_code": "<script src=\"...\"></script>",
  "ingestion_job_id": "job_789xyz"
}
```

### POST /api/ask

Send a RAG query.

**Request:**
```json
{
  "trial_token": "tr_abc123...",
  "query": "What are your business hours?",
  "session_id": "sess_12345"
}
```

**Response:**
```json
{
  "answer": "Our business hours are...",
  "sources": [
    { "text": "...", "url": "...", "score": 0.89 }
  ],
  "confidence": 0.92,
  "usage": {
    "queries_used": 45,
    "queries_remaining": 55
  }
}
```

### GET /api/check-trial?trial_token=xxx

Validate trial token.

**Response:**
```json
{
  "valid": true,
  "expires_at": "2025-11-07T12:00:00Z",
  "days_remaining": 2,
  "usage": {
    "queries_used": 15,
    "queries_remaining": 85
  }
}
```

## 🧪 Testing

### Run Unit Tests

```bash
npm run test
```

### Run Voice Greeting Test

```bash
npm test tests/voice-greeting.test.ts
```

### Test Python Worker

```bash
cd python
python ingest-worker.py --trial-token tr_test123 --data-source-file test-data.json
```

### Manual Testing Checklist

- [ ] Homepage loads correctly
- [ ] Trial setup modal works through all 4 steps
- [ ] Embed code is generated correctly
- [ ] Demo widget button appears and is clickable
- [ ] Voice greeting plays on first hover (check browser console)
- [ ] Chat messages send and receive mock responses
- [ ] Widget styling matches theme configuration
- [ ] Mobile responsive layout works
- [ ] Dark mode toggle works
- [ ] Trial expiry message displays correctly

## 📄 Documentation

- **[REQUIREMENTS.md](./REQUIREMENTS.md)**: Comprehensive project documentation
  - Complete feature specifications
  - Component architecture
  - API contracts
  - Data models and types
  - Deployment guide
- **[CHANGELOG.md](./CHANGELOG.md)**: Version history and updates
- **[docs/EMBED_EXAMPLE.md](./docs/EMBED_EXAMPLE.md)**: Widget embed examples
- **[docs/DESIGN_CONFIG.json](./docs/DESIGN_CONFIG.json)**: Design configuration schema

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org)
- UI components from [Radix UI](https://www.radix-ui.com)
- Icons from [Lucide](https://lucide.dev)
- Embeddings by [sentence-transformers](https://www.sbert.net/)
- Vector search by [FAISS](https://github.com/facebookresearch/faiss)

## 📞 Support

For questions, issues, or feature requests:
1. Check the [REQUIREMENTS.md](./REQUIREMENTS.md) documentation
2. Open an issue on GitHub
3. Contact support@bitb.ltd

---

**Built with ❤️ for service businesses**