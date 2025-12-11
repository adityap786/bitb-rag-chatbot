/**
 * Embedding pipeline configuration
 * Optimized for production throughput and cost
 */

export const EMBEDDING_CONFIG = {
  // Model dimension
  DIM: 768,

  // Batching configuration - larger batches = fewer API calls
  BATCH_SIZE: parseInt(process.env.EMBEDDING_BATCH_SIZE || '128', 10),  // Increased from 64
  MAX_PARALLEL: parseInt(process.env.EMBEDDING_MAX_PARALLEL || '8', 10), // Increased from 4

  // Quantization: 'int8' (4x size reduction) or 'fp32' (full precision)
  QUANTIZATION: (process.env.EMBEDDING_QUANTIZATION || 'int8') as 'int8' | 'fp32',

  // Service endpoint
  SERVICE_URL: process.env.BGE_EMBEDDING_SERVICE_URL || 'http://localhost:8000',

  // Timeout and retry
  TIMEOUT_MS: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 500,  // Reduced from 1000ms
} as const;

/**
 * Memory calculations for vector storage
 */
export function calculateVectorMemory(numVectors: number, quantization: 'int8' | 'fp32' = EMBEDDING_CONFIG.QUANTIZATION) {
  const bytesPerDim = quantization === 'int8' ? 1 : 4;
  const bytesPerVector = EMBEDDING_CONFIG.DIM * bytesPerDim;
  const totalBytes = numVectors * bytesPerVector;
  
  return {
    bytesPerVector,
    totalBytes,
    totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
    totalGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(3),
  };
}

/**
 * Benchmark data for planning
 */
export const BENCHMARK_DATA = {
  // Per-vector costs
  int8: {
    bytesPerVector: 768,
    description: '768 bytes per vector (1 byte per dim)',
  },
  fp32: {
    bytesPerVector: 3072,
    description: '3072 bytes per vector (4 bytes per dim)',
  },
  
  // Example volumes
  volumes: {
    '5k': { vectors: 5000, int8MB: 3.7, fp32MB: 14.6 },
    '50k': { vectors: 50000, int8MB: 36.6, fp32MB: 146.5 },
    '200k': { vectors: 200000, int8MB: 146.5, fp32MB: 585.9 },
  },

  // Expected throughput improvements
  improvements: {
    binaryTransport: '10-20x faster than VALUES',
    batching: '5-10x fewer API calls',
    parallelization: 'Up to 4x with MAX_PARALLEL=4',
    quantization: '4x size reduction (int8 vs fp32)',
  },
};
