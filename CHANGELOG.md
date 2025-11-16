let# Changelog

All notable changes to the BiTB RAG SaaS Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-11-04

### Added
- API route `POST /api/ingest` for starting ingestion jobs
- API route `GET /api/ingest/status/[id]` for checking ingestion job status
- Comprehensive widget unit tests in `tests/widget.test.ts`
- Widget configuration validation and error handling tests
- Trial token format validation tests
- Message handling and API integration tests

### Fixed
- Completed missing API routes for ingestion pipeline
- Added proper error handling for ingestion endpoints
- Improved test coverage for widget functionality

### Documentation
- Updated CHANGELOG with new API routes
- All deliverables from REQUIREMENTS.md now complete

---

## [1.0.0] - 2025-11-04

### Added - Initial Release

#### Frontend
- Complete BiTB homepage with hero section, feature grid, and service plan card
- Interactive trial setup modal with 4-step wizard (Data → Design → Details → Code)
- Floating demo widget with voice greeting and mock RAG responses
- Responsive design with mobile support
- Dark mode support with auto-detection
- Integration with Toaster for notifications

#### Embeddable Widget (public/bitb-widget.js)
- Vanilla JavaScript IIFE pattern for easy embedding
- Trial token validation on init and periodic checks (every 5 minutes)
- Voice greeting system using Web Speech API with MP3 fallback
- Hover-triggered greeting (plays once per session)
- Mute/unmute toggle persisted in localStorage
- Session-based greeting flag in sessionStorage
- RAG query flow with trial gating
- Upgrade CTA when trial expires
- Fully styled responsive chat interface
- Position configuration (4 corners)
- Theme support (light/dark/auto)
- Accessibility features (ARIA labels, keyboard navigation)

#### Backend API Routes
- `POST /api/start-trial` - Create new trial with token generation
- `POST /api/ask` - RAG query endpoint (mock implementation with production guidelines)
- `GET /api/check-trial` - Validate trial status and usage
- `GET /api/voicesupport` - Voice greeting configuration
- `POST /api/ingest` - Start ingestion job with file upload
- `GET /api/ingest/status/[id]` - Check ingestion job status

#### Python Ingestion Worker (python/ingest-worker.py)
- Website crawler with robots.txt respect
- Multi-format text extraction (HTML, PDF, DOCX, TXT)
- Token-based chunking (600 tokens, 100 overlap)
- Local embeddings using sentence-transformers (all-MiniLM-L6-v2)
- FAISS vector store with per-trial namespacing
- Auto-purge functionality for expired trials
- Comprehensive error handling and logging
- CLI interface with multiple commands
- Support for both URL crawling and file uploads
- File size and token limits enforcement

#### Documentation
- Comprehensive REQUIREMENTS.md with full project specifications
- README.md with quick start guide and deployment instructions
- EMBED_EXAMPLE.md with platform-specific integration examples
- DESIGN_CONFIG.json JSON schema for configuration
- Voice greeting test suite with unit and integration tests
- Inline code comments and JSDoc documentation

#### Configuration
- Environment variable support for all configurable options
- Free-tier and local-first stack recommendations
- Multiple LLM provider options (OpenRouter, HuggingFace, Ollama)
- Vector store fallbacks (FAISS, Pinecone, Weaviate)
- Embedding generation fallbacks (local, HuggingFace)

### Technical Details

#### Dependencies
- Frontend: Next.js 15.3.5, React 19, TypeScript, Tailwind CSS v4
- UI: Radix UI components, Framer Motion, Lucide icons, Sonner toasts
- Python: sentence-transformers 3.3.1, faiss-cpu 1.9.0, BeautifulSoup4, pypdf, python-docx, tiktoken
- Free-tier services: OpenRouter free models, HuggingFace Inference API

#### Features
- 3-day free trial with no credit card
- 100 queries per trial
- Voice greeting with female voice preference
- RAG-powered responses based on customer data
- Website crawling (depth 1-3)
- File uploads (PDF, DOCX, TXT, HTML, max 10MB)
- Auto-purge after trial expiry
- Trial validation and usage tracking
- Embed code generation
- Multiple theme and position options

#### Architecture
- Next.js 15 App Router with server components
- Serverless API routes (Vercel Functions compatible)
- Python worker for ingestion (Modal/Railway/Lambda compatible)
- Local FAISS vector store
- No database required for MVP (can add later)
- Free-tier LLM integration

### Notes
- All code includes production implementation guidelines
- Mock data used for demo purposes
- Comprehensive TODO comments for database integration
- Ready for deployment to Vercel/Netlify
- Python worker ready for Modal/Railway deployment
- Full test suite for voice greeting functionality
- Accessibility compliant (ARIA labels, keyboard navigation)
- Mobile responsive design
- Iframe compatible (no browser built-ins)

### Known Limitations (v1.0.0)
- API routes use mock data (database integration needed)
- No actual LLM integration (implementation guidelines provided)
- No actual ingestion job queue (can use BullMQ/Celery)
- No email notifications for trial expiry
- No admin dashboard for trial management
- Voice fallback MP3 needs to be generated (TTS service required)

### Future Enhancements
See REQUIREMENTS.md for comprehensive roadmap.

---

## Version Guidelines

### Version Format: MAJOR.MINOR.PATCH

- **MAJOR**: Incompatible API changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

### Changelog Categories
- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security fixes

---

## Links

- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [Project Repository](https://github.com/YOUR_USERNAME/YOUR_REPO_NAME)

---

**Last Updated**: 2025-11-04