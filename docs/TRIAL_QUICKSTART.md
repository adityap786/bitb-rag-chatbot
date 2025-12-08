# 3-Day Trial Feature - Quick Start

## What Was Implemented

A complete trial onboarding system that allows users to:
1. Sign up for a 3-day free trial
2. Add knowledge base content (manual entry or file upload)
3. Customize chatbot branding
4. Get an embeddable widget code
5. Deploy the chatbot on their website

## Files Created

### Database & Types
- `supabase/migrations/20250116000001_trial_schema.sql` - Complete DB schema with 6 tables
- `src/types/trial.ts` - TypeScript interfaces for all trial-related types

### Backend APIs
- `src/app/api/trial/start/route.ts` - Trial account creation
- `src/app/api/trial/kb/upload/route.ts` - File upload handler
- `src/app/api/trial/kb/manual/route.ts` - Manual KB entry
- `src/app/api/trial/branding/route.ts` - Branding configuration
- `src/app/api/trial/generate-widget/route.ts` - Widget code generator
- `src/app/api/widget/session/route.ts` - Chat session initialization
- `src/app/api/widget/chat/route.ts` - Chat message handler with RAG

### Core Libraries
- `src/lib/trial/tool-assignment.ts` - Business-type-based tool assignment logic
- `src/lib/trial/rag-pipeline.ts` - Text chunking, embedding generation, semantic search

### Frontend
- `src/components/trial/TrialOnboardingWizard.tsx` - 4-step wizard UI
- `src/app/trial/page.tsx` - Trial landing page

### Tests
- `tests/trial/tool-assignment.test.ts` - Tool assignment unit tests
- `tests/trial/rag-pipeline.test.ts` - Text chunking tests

### Documentation
- `docs/TRIAL_IMPLEMENTATION.md` - Comprehensive implementation guide

## Quick Setup

### 1. Run Database Migration
```bash
# Using psql
psql -h YOUR_SUPABASE_URL -U postgres -f supabase/migrations/20250116000001_trial_schema.sql

# Or using Supabase CLI
supabase migration up
```

### 2. Add Environment Variables
Create or update `.env.local`:
```env
# Trial JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-secret-key-min-32-characters-long

# OpenAI for embeddings and chat
OPENAI_API_KEY=sk-...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Widget CDN (optional, defaults to localhost in dev)
NEXT_PUBLIC_WIDGET_CDN_URL=https://cdn.yourcompany.com/widget/v1/widget.js
NEXT_PUBLIC_APP_URL=https://yourcompany.com
```

### 3. Install Dependencies
```bash
npm install --legacy-peer-deps
```

### 4. Start Development Server
```bash
npm run dev
```

### 5. Test the Trial Flow
1. Navigate to `http://localhost:3000/trial`
2. Fill in email, business name, and business type
3. Add company information in the knowledge base step
4. Customize colors and tone in the branding step
5. Generate widget code
6. Copy the embed code and test on a sample HTML page

## Testing the Widget

Create a test HTML file:
```html
<!DOCTYPE html>
<html>
<head>
  <title>Widget Test</title>
</head>
<body>
  <h1>Test Page</h1>

  <!-- Paste the embed code you received -->
  <script
    src="http://localhost:3000/bitb-widget.js"
    data-tenant-id="YOUR_TENANT_ID"
    data-primary-color="#6366f1"
    data-secondary-color="#8b5cf6"
    data-welcome-message="Hello!%20How%20can%20I%20help?"
    async
  ></script>
</body>
</html>
```

## Key Features

### Automatic Tool Assignment
Based on business type and KB content:
- **Service**: FAQ search, contact form, booking calendar
- **E-commerce**: Product search, order tracking, cart assistant
- **SaaS**: Docs search, feature guide, integration helper
- **Other**: Basic FAQ and contact tools

### RAG Pipeline
- Sentence-aware chunking (512 tokens, 50 token overlap)
- OpenAI ada-002 embeddings
- Semantic search with pgvector
- Context-aware responses

### Security
- JWT authentication for setup flow
- Row-level security in Supabase
- Content deduplication (SHA256)
- Input validation and sanitization

## API Endpoints Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/trial/start` | POST | None | Create trial account |
| `/api/trial/kb/upload` | POST | JWT | Upload files |
| `/api/trial/kb/manual` | POST | JWT | Add manual KB |
| `/api/trial/branding` | POST | JWT | Set colors/tone |
| `/api/trial/generate-widget` | POST | JWT | Get embed code |
| `/api/widget/session` | POST | None | Init chat session |
| `/api/widget/chat` | POST | None | Send/receive messages |

## Next Steps

### Immediate
1. **Run migration** - Set up database schema
2. **Configure env vars** - Add secrets
3. **Test locally** - Complete trial flow
4. **Deploy** - Push to production

### Future Enhancements
1. **Website Crawler** - Implement async URL crawling
2. **File Parsers** - Add proper PDF/DOCX extraction
3. **Email Notifications** - Trial expiration reminders
4. **Upgrade Flow** - Stripe integration for paid plans
5. **Analytics** - Track usage and conversion metrics

## Troubleshooting

**Build errors with types?**
```bash
npm run build
```
Check for missing imports in API routes.

**Database connection issues?**
Verify `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

**Widget not loading?**
Check browser console for CORS or script errors.

**JWT errors?**
Ensure `JWT_SECRET` is at least 32 characters.

## Production Checklist

- [ ] Run database migration on production Supabase
- [ ] Set production environment variables
- [ ] Configure CDN for widget.js hosting
- [ ] Set up error monitoring (Sentry)
- [ ] Enable rate limiting on API routes
- [ ] Test trial expiration logic (mock system time)
- [ ] Configure email service for notifications
- [ ] Set up backup strategy for trial data

## Support

For issues or questions:
1. Check `docs/TRIAL_IMPLEMENTATION.md` for detailed docs
2. Review test files for usage examples
3. Check Supabase logs for database errors
4. Review API route console logs

---

**Status**: ✅ Core implementation complete  
**Next**: Deploy and test in production  
**Timeline**: Ready for testing now, production-ready after QA
