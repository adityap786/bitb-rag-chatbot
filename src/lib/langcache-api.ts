
import fetch from 'node-fetch';
import pRetry from 'p-retry';
import NodeCache from 'node-cache';

const LANGCACHE_API_KEY = process.env.LANGCACHE_API_KEY;
const LANGCACHE_URL = 'https://gcp-us-east4.langcache.redis.io';
const CACHE_ID = 'a5b52dca2cf847b1b68eba9680e8a3b3';

// Local fallback cache (in-memory, for critical paths)
const fallbackCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });


export async function langCacheSet(prompt: string, response: any) {
  // Always set in local fallback cache
  fallbackCache.set(prompt, response);

  // Early return if API key not configured - avoid blocking retries
  if (!LANGCACHE_API_KEY) {
    return { success: true, source: 'local-only' };
  }

  // Retry with exponential backoff (reduced retries for faster failure)
  return pRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

    try {
      const res = await fetch(`${LANGCACHE_URL}/cache/${CACHE_ID}/set`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LANGCACHE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt, response }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`LangCache set failed: ${res.status}`);
      return res.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }, {
    retries: 1, // Reduced from 3 to minimize latency impact
    minTimeout: 500,
    maxTimeout: 1000,
    onFailedAttempt: (err: any) => {
      if (typeof console !== 'undefined') {
        const msg = err && (err.message || JSON.stringify(err));
        console.warn('LangCache set retry', msg);
      }
    }
  });
}



export async function langCacheSearch(prompt: string): Promise<{ response?: any; source?: string }> {
  // Early return if API key not configured - use local cache only
  if (!LANGCACHE_API_KEY) {
    const cached = fallbackCache.get(prompt);
    return cached ? { response: cached, source: 'local-only' } : {};
  }

  // Try remote cache with retry/circuit breaker
  try {
    const remote = await pRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      try {
        const res = await fetch(`${LANGCACHE_URL}/cache/${CACHE_ID}/search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LANGCACHE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`LangCache search failed: ${res.status}`);
        return res.json();
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
      }
    }, {
      retries: 1, // Reduced from 3 to minimize latency impact
      minTimeout: 500,
      maxTimeout: 1000,
      onFailedAttempt: (err: any) => {
        if (typeof console !== 'undefined') console.warn('LangCache search retry', err && err.message ? err.message : String(err));
      }
    });
    return remote as { response?: any; source?: string };
  } catch (err) {
    // Fallback to local cache
    if (typeof console !== 'undefined') console.warn('LangCache search failed, using fallback', (err as any).message);
    const cached = fallbackCache.get(prompt);
    return cached ? { response: cached, source: 'local-fallback' } : {};
  }
}


