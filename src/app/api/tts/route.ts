import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export const runtime = "nodejs";

// Simple in-memory LRU-like cache and per-IP rate limiter.
// For production use consider Redis or another external store that survives restarts.
const CACHE_MAX_ITEMS = Number(process.env.TTS_CACHE_MAX_ITEMS) || 200;
const CACHE_TTL_MS = Number(process.env.TTS_CACHE_TTL_MS) || 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_WINDOW_MS = Number(process.env.TTS_RATE_LIMIT_WINDOW_MS) || 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = Number(process.env.TTS_RATE_LIMIT_MAX) || 6; // requests per window per IP

type CacheEntry = {
  audioContent: string;
  meta: { voiceName?: string; languageCode?: string; createdAt: number };
  createdAt: number;
};

const ttsCache = new Map<string, CacheEntry>();
const rateLimits = new Map<string, { count: number; windowStart: number }>();

function makeCacheKey(text: string, voice: any, audioConfig: any) {
  const payload = JSON.stringify({ text, voice, audioConfig });
  return createHash("sha256").update(payload).digest("hex");
}

function getClientIp(request: NextRequest) {
  // Prefer x-forwarded-for (when behind a proxy). Fall back to x-real-ip. If absent, use 'unknown'.
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  const xr = request.headers.get("x-real-ip");
  if (xr) return xr;
  return "unknown";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = body?.text;
    const voice = body?.voice ?? { languageCode: "en-US", name: "en-US-Wavenet-F", ssmlGender: "FEMALE" };
    const audioConfig = body?.audioConfig ?? { audioEncoding: "MP3", speakingRate: 0.95, pitch: 1.05 };

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' in request body" }, { status: 400 });
    }

    const key = makeCacheKey(text, voice, audioConfig);
    const now = Date.now();

    // Cache lookup
    const cached = ttsCache.get(key);
    if (cached) {
      if (now - cached.createdAt < CACHE_TTL_MS) {
        // Touch entry to make it recently used (simple LRU): delete + re-set
        ttsCache.delete(key);
        ttsCache.set(key, cached);
        return NextResponse.json(
          { audioContent: cached.audioContent, meta: cached.meta },
          { status: 200, headers: { "X-Cache-Hit": "1" } },
        );
      } else {
        // expired
        ttsCache.delete(key);
      }
    }

    // Rate limiting applies only to cache-miss generation calls
    const ip = getClientIp(request);
    const rl = rateLimits.get(ip);
    if (!rl || now - rl.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimits.set(ip, { count: 1, windowStart: now });
    } else {
      if (rl.count >= RATE_LIMIT_MAX) {
        const retryAfterSec = Math.ceil((rl.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfterSec),
              "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(Math.floor((rl.windowStart + RATE_LIMIT_WINDOW_MS) / 1000)),
            },
          },
        );
      }
      rl.count += 1;
      rateLimits.set(ip, rl);
    }

    const apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.TTS_API_KEY;
    if (!apiKey) {
      console.error("Google TTS API key not configured on server (process.env.GOOGLE_TTS_API_KEY)");
      return NextResponse.json({ error: "Google TTS API key not configured on server" }, { status: 500 });
    }

    // Call Google TTS
    const googleRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { text }, voice, audioConfig }),
    });

    const data = await googleRes.json();

    if (!googleRes.ok || !data || !data.audioContent) {
      console.error("Google TTS error:", googleRes.status, data);
      return NextResponse.json({ error: "Google TTS error", details: data }, { status: 502 });
    }

    // Store in cache
    const entry: CacheEntry = {
      audioContent: data.audioContent,
      meta: { voiceName: voice?.name, languageCode: voice?.languageCode, createdAt: now },
      createdAt: now,
    };
    ttsCache.set(key, entry);
    // simple eviction: remove oldest when beyond capacity
    if (ttsCache.size > CACHE_MAX_ITEMS) {
      const firstKey = ttsCache.keys().next().value;
      if (firstKey) ttsCache.delete(firstKey);
    }

    const limitInfo = rateLimits.get(ip) || { count: 1, windowStart: now };

    return NextResponse.json(
      { audioContent: data.audioContent, meta: entry.meta },
      {
        status: 200,
        headers: {
          "X-Cache-Hit": "0",
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
          "X-RateLimit-Remaining": String(Math.max(0, RATE_LIMIT_MAX - (limitInfo.count || 1))),
          "X-RateLimit-Reset": String(Math.floor((limitInfo.windowStart + RATE_LIMIT_WINDOW_MS) / 1000)),
        },
      },
    );
  } catch (err) {
    console.error("TTS proxy failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
