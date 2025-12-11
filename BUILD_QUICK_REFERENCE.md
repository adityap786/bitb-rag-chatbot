# Quick Reference: Build & Deployment

## TL;DR

**Use Webpack for production. Use Turbopack for development.**
- Status: ✅ Already configured correctly
- Risk: ✅ LOW (mitigated by testing)
- Action: Use deployment checklist before launch

---

## Build Commands

```bash
# Development
npm run dev                    # Turbopack (fast refresh)

# Production Build
npm run build                  # Default (Webpack)
npm run build:webpack          # Explicit Webpack
npm run build:check            # TypeScript + Lint + Build

# Pre-Deployment Verification
npm run typecheck             # TypeScript check
npm run lint                  # Linting check
npm run test                  # All tests
npm run test:security         # Security tests
npm run test:redteam          # Red-team safety tests

# Production Simulation
npm run start                 # Run production build locally
```

---

## Pre-Deployment Checklist

✅ Run these before deploying to production:

```bash
npm run build:check           # Full check (typecheck + lint + build)
npm run test                  # All tests pass?
npm run test:security         # Security tests pass?
npm run test:redteam          # Red-team tests pass?
npm run lint                  # No lint warnings?
npm run start                 # Production build runs locally?
```

---

## Current Setup

| Layer | Bundler | Details |
|-------|---------|---------|
| **Dev** | Turbopack | Fast refresh via `npm run dev --turbopack` |
| **Production Build** | Webpack | Default in `npm run build` |
| **CI/CD** | Webpack | GitHub Actions runs `npm run build` |
| **Docker** | Webpack | Multi-stage build uses `npm run build` |

---

## Why Webpack for Production?

1. ✅ Battle-tested in production environments
2. ✅ Proven reliability and stability
3. ⚠️ Turbopack experimental in Next.js 16 (stabilizes in 17+)
4. ⚠️ Custom loaders removed for compatibility
5. ✅ Predictable cross-platform behavior

---

## Dev/Prod Mismatch Risk Assessment

**Risk Level: LOW ✅**

**Why?**
- Extensive test coverage catches differences
- CI/CD uses production bundler (Webpack)
- Docker build mimics production
- E2E tests validate output
- Type checking independent of bundler

**Acceptable Tradeoff:**
- Fast dev experience (Turbopack)
- Production stability (Webpack)

---

## Monitoring Targets

Track these metrics:

| Metric | Target |
|--------|--------|
| Full build time | < 120 seconds |
| Incremental build | < 30 seconds |
| Docker build time | < 5 minutes |
| CI/CD success rate | > 99% |

---

## Future Upgrade Path (Next.js 17+)

When upgrading to Next.js 17+:
1. Evaluate Turbopack maturity
2. Test custom loader compatibility
3. Consider standardizing on Turbopack everywhere
4. Update this reference card

---

## Documentation Files

- **`BUILD_STRATEGY.md`** — Comprehensive build strategy guide
- **`DEPLOYMENT_BUILD_RECOMMENDATION.md`** — Executive summary & analysis
- **`BUILD_ANALYSIS_COMPLETE.md`** — Implementation summary
- **`next.config.ts`** — Build strategy comments (lines 26-41)

---

## Troubleshooting

### Build fails with Webpack
```bash
# Verify TypeScript
npm run typecheck

# Verify linting
npm run lint

# Check if custom loaders needed
# (Currently removed for Next 16 compatibility)
```

### Want to test Turbopack in production
```bash
# NOT RECOMMENDED until Next.js 17+
# But if needed:
npm run build  # Keep using default (Webpack)
```

### Build times too slow
```bash
# Monitor with:
npm run build           # Check duration
npm run build:webpack   # Compare with explicit Webpack

# Next.js 17+ may be faster with standardized Turbopack
```

---

## Production Deployment Steps

1. **Pre-deployment verification**
   ```bash
   npm run build:check
   npm run test:security
   npm run test:redteam
   ```

2. **Build production bundle**
   ```bash
   npm run build    # Uses Webpack (stable)
   ```

3. **Local test of production build**
   ```bash
   npm run start    # Run production bundle locally
   ```

4. **Deploy to production**
   ```bash
   # Docker deployment
   docker build -t bitb-chatbot .
   docker run -d bitb-chatbot

   # OR manual deployment
   # Deploy .next/standalone folder
   ```

5. **Verify production**
   - Check health endpoint: `/api/health`
   - Monitor build logs
   - Track error rates

---

## Key Files

- **Configuration:** `next.config.ts` (build strategy section)
- **Scripts:** `package.json` (build commands)
- **CI/CD:** `.github/workflows/ci.yml` (uses `npm run build`)
- **Docker:** `Dockerfile` (uses `npm run build`)
- **Documentation:** `BUILD_STRATEGY.md`, `DEPLOYMENT_BUILD_RECOMMENDATION.md`

---

## Status Summary

✅ **Build system is production-ready**
- Turbopack in dev ⚡
- Webpack in production 🛡️
- CI/CD aligned with production
- Extensive testing in place
- Low deployment risk

**Action:** Use deployment checklist before launch. No immediate changes needed.

