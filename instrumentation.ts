/**
 * Next.js Instrumentation
 * 
 * This file runs once when the Next.js server starts.
 * Use it to initialize services that need to run before handling requests.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { initializeRedisRateLimiter } from './src/lib/security/redis-rate-limiter';

/**
 * Register function - runs once on server startup
 */
export async function register() {
  // Only run on server (not in edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing server services...');

    try {
      // Initialize Redis rate limiter in production
      if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
        console.log('[Instrumentation] Initializing Redis rate limiter...');
        await initializeRedisRateLimiter();
        console.log('[Instrumentation] Redis rate limiter initialized successfully');
      } else {
        console.log('[Instrumentation] Skipping Redis initialization (not in production or REDIS_URL not set)');
      }

      // Add other initialization here (e.g., database connections, cache warmup)

      console.log('[Instrumentation] Server services initialized successfully');
    } catch (error) {
      console.error('[Instrumentation] Failed to initialize services:', error);
      // Don't throw - let the app start even if initialization fails
      // Services should handle their own fallbacks
    }
  }
}
