/**
 * Performance Metrics for RAG Pipeline
 * 
 * Lightweight telemetry to measure:
 * - Embedding generation latency
 * - Vector search latency (Redis RPC)
 * - Text fallback latency
 * - Merge & scoring latency
 * - Full ingestion pipeline latency
 */

export interface PerformanceMetrics {
    embeddingGeneration: number[];
    vectorRpc: number[];
    textFallback: number[];
    mergeScoring: number[];
    fullIngestion: number[];
    chunkingTime: number[];
}

/**
 * In-memory performance log
 * Key: metric name, Value: array of latencies in ms
 */
export const performanceLog: Record<string, number[]> = {};

/**
 * Performance metrics utility
 */
export const metrics = {
    /**
     * Record execution time of an async function
     * @param name - Metric name
     * @param fn - Async function to measure
     * @returns Result of the function
     */
    record: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
        const start = Date.now();
        try {
            return await fn();
        } finally {
            const elapsed = Date.now() - start;
            if (!performanceLog[name]) {
                performanceLog[name] = [];
            }
            performanceLog[name].push(elapsed);
        }
    },

    /**
     * Record execution time of a sync function
     * @param name - Metric name
     * @param fn - Sync function to measure
     * @returns Result of the function
     */
    recordSync: <T>(name: string, fn: () => T): T => {
        const start = Date.now();
        try {
            return fn();
        } finally {
            const elapsed = Date.now() - start;
            if (!performanceLog[name]) {
                performanceLog[name] = [];
            }
            performanceLog[name].push(elapsed);
        }
    },

    /**
     * Get average latency for all recorded metrics
     * @returns Object with metric names and their average latencies
     */
    dump: (): Record<string, number> => {
        const avg: Record<string, number> = {};
        for (const [key, values] of Object.entries(performanceLog)) {
            if (values.length > 0) {
                avg[key] = values.reduce((a, b) => a + b, 0) / values.length;
            }
        }
        return avg;
    },

    /**
     * Get detailed stats for all metrics
     * @returns Object with min, max, avg, p50, p95, p99 for each metric
     */
    getStats: (): Record<string, { min: number; max: number; avg: number; p50: number; p95: number; p99: number; count: number }> => {
        const stats: Record<string, any> = {};
        for (const [key, values] of Object.entries(performanceLog)) {
            if (values.length === 0) continue;

            const sorted = [...values].sort((a, b) => a - b);
            const sum = sorted.reduce((a, b) => a + b, 0);

            stats[key] = {
                min: sorted[0],
                max: sorted[sorted.length - 1],
                avg: sum / sorted.length,
                p50: sorted[Math.floor(sorted.length * 0.5)],
                p95: sorted[Math.floor(sorted.length * 0.95)],
                p99: sorted[Math.floor(sorted.length * 0.99)],
                count: sorted.length,
            };
        }
        return stats;
    },

    /**
     * Reset all metrics
     */
    reset: (): void => {
        for (const key of Object.keys(performanceLog)) {
            delete performanceLog[key];
        }
    },

    /**
     * Log metrics to console (formatted)
     */
    logStats: (): void => {
        const stats = metrics.getStats();
        console.log('\n=== RAG Performance Metrics ===');
        for (const [name, data] of Object.entries(stats)) {
            console.log(`\n${name}:`);
            console.log(`  Avg: ${data.avg.toFixed(2)}ms`);
            console.log(`  Min: ${data.min.toFixed(2)}ms, Max: ${data.max.toFixed(2)}ms`);
            console.log(`  P50: ${data.p50.toFixed(2)}ms, P95: ${data.p95.toFixed(2)}ms, P99: ${data.p99.toFixed(2)}ms`);
            console.log(`  Count: ${data.count}`);
        }
        console.log('\n==============================\n');
    },
};
