# Redis & Embedding Pipeline Optimization - Quick Reference

## 🚀 Quick Start

### 1. Configure Environment
```bash
# Copy example and edit with your values
cp .env.local.example .env.local

# Required:
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
BGE_EMBEDDING_SERVICE_URL=http://localhost:8000

# Optional tuning:
EMBEDDING_BATCH_SIZE=64
EMBEDDING_MAX_PARALLEL=4
EMBEDDING_QUANTIZATION=int8
```

### 2. Test Performance
```bash
npm run test:perf
```

### 3. Reindex Existing Vectors
```bash
# Dry run (preview)
npm run reindex:vectors -- --tenant=tn_abc123 --quantize=int8 --dry-run

# Apply
npm run reindex:vectors -- --tenant=tn_abc123 --quantize=int8
```

## 📊 Expected Performance

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Throughput | ~10 vec/s | ~200-400 vec/s | **20-40x** |
| Memory/vector | 3072 bytes | 768 bytes | **4x reduction** |
| API calls (5k) | 5,000 | 78 | **98% fewer** |
| Storage (50k) | 146 MB | 37 MB | **75% less** |

## 🔧 Usage in Code

### Generate Embeddings (Optimized)
```typescript
import { generateEmbeddingsBatched } from '@/lib/embeddings/batched-generator';

const embeddings = await generateEmbeddingsBatched(texts);
// Automatically uses: batching, parallelization, quantization
```

### Store Vectors (Batched)
```typescript
import { VectorStorageAdapter } from '@/lib/embeddings/vector-storage';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();
const storage = new VectorStorageAdapter(supabase, 'int8');

await storage.storeVectorsBatched(vectors, 100);
```

## 🐛 Troubleshooting

### Redis Not Initialized
```bash
# Error: "Skipping Redis initialization (Redis not configured)"
# Fix: Set Redis env vars in .env.local:
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

### Embedding Timeout
```bash
# Reduce batch size or increase timeout:
EMBEDDING_BATCH_SIZE=32
EMBEDDING_TIMEOUT_MS=60000
```

### Quantization Accuracy
```bash
# If search quality drops, use fp32:
EMBEDDING_QUANTIZATION=fp32
```

## 📚 Full Documentation
See `docs/REDIS_EMBEDDING_OPTIMIZATION.md` for:
- Detailed architecture
- Memory calculations
- Migration strategies
- Benchmark results
- Cost analysis
