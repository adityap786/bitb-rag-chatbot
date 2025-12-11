# Build System Strategy: Turbopack vs Webpack

## Summary

**Use Webpack for production deployments. Use Turbopack only in development.**

## Current Setup

| Context | Bundler | Method |
|---------|---------|--------|
| Development | Turbopack | `npm run dev --turbopack` |
| Production | Webpack | `npm run build` (default) |
| CI/CD Build | Webpack | `npm run build` in `.github/workflows/ci.yml` |
| Docker Build | Webpack | `npm run build` in Dockerfile |

## Why This Strategy?

### Turbopack (Development Only)

**Pros:**
- ⚡ Fast refresh cycle (optimal for local DX)
- 🚀 Modern Rust-based bundler
- 📦 Lower memory footprint

**Cons:**
- ⚠️ Experimental in Next.js 16 (stabilized in 17+)
- 🔧 Custom loader support still evolving
- 📋 Edge cases not fully documented
- 🚫 Not recommended for production yet

### Webpack (Production)

**Pros:**
- ✅ Battle-tested in production environments
- 📚 Extensive community support and documentation
- 🔧 Custom loader ecosystem mature
- 🛡️ Proven reliability for deployment
- 🎯 Predictable behavior across platforms

**Cons:**
- 🐢 Slower builds than Turbopack
- 💾 Higher memory usage
- ⚙️ More configuration complexity

## Risk Mitigation

### Custom Loaders
- Current status: **Removed for Next.js 16 compatibility**
- If custom loaders needed in future:
  1. Test thoroughly with both bundlers
  2. Verify compatibility before production use
  3. Document any bundler-specific workarounds

### Dev/Prod Consistency
Current mismatch (Turbopack in dev, Webpack in prod) is **acceptable** because:
- Extensive test coverage catches most bundler differences
- CI/CD uses production bundler (Webpack)
- Docker build mimics production environment
- E2E tests run against production build output

## Commands

### Development
```bash
# Fast development with Turbopack (default from package.json)
npm run dev

# Explicit command with Turbopack
npm run dev --turbopack
```

### Production Build
```bash
# Standard build (uses Webpack by default)
npm run build

# Explicit Webpack build (environment variable)
TURBOPACK_DISABLED=1 npm run build
```

### Docker Deployment
```bash
# Multi-stage build uses `npm run build` (Webpack)
docker build -t bitb-chatbot .
```

### Local Production Simulation
```bash
# Build with Webpack (production environment)
npm run build

# Run production build locally
npm run start
```

## Deployment Checklist

Before deploying to production:

- [ ] Verify `npm run build` completes successfully
- [ ] Test with `npm run start` locally
- [ ] Run all tests: `npm run test`
- [ ] Build Docker image: `docker build .`
- [ ] Check CI/CD pipeline passes (uses `npm run build`)
- [ ] Verify no TypeScript errors: `npm run typecheck`
- [ ] Verify no ESLint errors: `npm run lint`

## Future Actions

### Next.js 17+ Migration
When upgrading to Next.js 17+:
1. Turbopack will be more stable
2. Consider standardizing on Turbopack everywhere
3. Re-evaluate custom loader compatibility
4. Update this strategy document

### Monitoring
Track build metrics:
- `npm run build` duration (target: < 60 seconds for incremental, < 120 for full)
- Docker build time (target: < 5 minutes)
- CI/CD pipeline success rate (target: > 99%)

## References

- [Next.js 16 Build Configuration](https://nextjs.org/docs/app/building-your-application/deploying)
- [Turbopack Stability](https://turbo.build/pack)
- [Next.js Webpack Configuration](https://nextjs.org/docs/pages/api-reference/next-config-js/webpack)
- [Custom Loaders Deprecation](https://nextjs.org/docs/app/building-your-application/optimizing/static-exports)
