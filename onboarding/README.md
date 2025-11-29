# Onboarding Microservice (Platform Detect)

This is a minimal onboarding helper that detects a site's framework heuristically and lets tenants manually select a framework if detection fails.

Quick start:

```powershell
cd onboarding
npm install
npm start
# Open http://localhost:4000 in your browser
```

Endpoints:
- `GET /` — UI
- `POST /api/detect-platform` — JSON body: `{ "url": "https://example.com" }` returns `candidates`
- `GET /api/frameworks` — list of supported frameworks

Notes:
- The detection is heuristic (HTML markers). Use it as a guidance and offer manual fallback.
- For production, add rate limiting, error handling, caching, and origin validation.
