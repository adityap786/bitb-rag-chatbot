/**
 * Bot Protection & Anti-Scraping Module
 * 
 * Production-grade protection for public endpoints:
 * - Browser fingerprinting
 * - Behavioral analysis
 * - Rate limiting by fingerprint
 * - CAPTCHA escalation triggers
 * - Honeypot detection
 */

import crypto from 'crypto';
import { logger } from '@/lib/observability/logger';

// ============================================================
// Configuration
// ============================================================

export interface BotProtectionConfig {
    /** Enable fingerprint-based rate limiting */
    fingerprintRateLimit?: boolean;
    /** Max requests per minute per fingerprint */
    maxRequestsPerMinute?: number;
    /** Enable behavioral analysis */
    behavioralAnalysis?: boolean;
    /** CAPTCHA threshold (0-1, higher = more suspicious triggers CAPTCHA) */
    captchaThreshold?: number;
    /** Enable honeypot detection */
    honeypotEnabled?: boolean;
    /** Known bot User-Agent patterns to block */
    blockPatterns?: RegExp[];
    /** Known good bot patterns to allow */
    allowPatterns?: RegExp[];
}

const DEFAULT_CONFIG: BotProtectionConfig = {
    fingerprintRateLimit: true,
    maxRequestsPerMinute: 30,
    behavioralAnalysis: true,
    captchaThreshold: 0.7,
    honeypotEnabled: true,
    blockPatterns: [
        /python-requests/i,
        /curl\//i,
        /wget\//i,
        /scrapy/i,
        /httpclient/i,
        /java\//i,
        /libwww/i,
    ],
    allowPatterns: [
        /googlebot/i,
        /bingbot/i,
        /slurp/i,
        /duckduckbot/i,
        /baiduspider/i,
        /yandexbot/i,
        /facebot/i,
        /twitterbot/i,
        /linkedinbot/i,
        /whatsapp/i,
        /telegrambot/i,
    ],
};

// ============================================================
// Types
// ============================================================

export interface ClientFingerprint {
    /** Hash of fingerprint components */
    hash: string;
    /** IP address */
    ip: string;
    /** User-Agent */
    userAgent: string;
    /** Accept-Language header */
    acceptLanguage: string | null;
    /** Accept-Encoding header */
    acceptEncoding: string | null;
    /** Screen resolution (from JS) */
    screenResolution?: string;
    /** Timezone offset */
    timezoneOffset?: number;
    /** Browser plugins hash */
    pluginsHash?: string;
    /** Canvas fingerprint */
    canvasHash?: string;
    /** WebGL renderer */
    webglRenderer?: string;
    /** Request timestamp */
    timestamp: number;
}

export interface BotDetectionResult {
    /** Is request likely from a bot */
    isBot: boolean;
    /** Is the bot allowed (search engines, etc.) */
    isAllowedBot: boolean;
    /** Suspicion score (0-1) */
    suspicionScore: number;
    /** Should trigger CAPTCHA */
    requireCaptcha: boolean;
    /** Reason for detection */
    reasons: string[];
    /** Client fingerprint */
    fingerprint: ClientFingerprint;
    /** Rate limit status */
    rateLimited: boolean;
    /** Honeypot triggered */
    honeypotTriggered: boolean;
}

// ============================================================
// Fingerprinting
// ============================================================

/**
 * Generate client fingerprint from request headers
 */
export function generateFingerprint(
    headers: Headers,
    ip: string,
    jsFingerprint?: Partial<ClientFingerprint>
): ClientFingerprint {
    const userAgent = headers.get('user-agent') || '';
    const acceptLanguage = headers.get('accept-language');
    const acceptEncoding = headers.get('accept-encoding');
    const accept = headers.get('accept') || '';
    const connection = headers.get('connection') || '';

    // Create fingerprint components
    const components = [
        ip,
        userAgent,
        acceptLanguage || '',
        acceptEncoding || '',
        accept,
        connection,
        jsFingerprint?.screenResolution || '',
        jsFingerprint?.timezoneOffset?.toString() || '',
        jsFingerprint?.pluginsHash || '',
        jsFingerprint?.canvasHash || '',
        jsFingerprint?.webglRenderer || '',
    ];

    const hash = crypto
        .createHash('sha256')
        .update(components.join('|'))
        .digest('hex')
        .substring(0, 32);

    return {
        hash,
        ip,
        userAgent,
        acceptLanguage,
        acceptEncoding,
        screenResolution: jsFingerprint?.screenResolution,
        timezoneOffset: jsFingerprint?.timezoneOffset,
        pluginsHash: jsFingerprint?.pluginsHash,
        canvasHash: jsFingerprint?.canvasHash,
        webglRenderer: jsFingerprint?.webglRenderer,
        timestamp: Date.now(),
    };
}

// ============================================================
// Bot Detection Signals
// ============================================================

/**
 * Analyze User-Agent for bot indicators
 */
function analyzeUserAgent(
    userAgent: string,
    config: BotProtectionConfig
): { isBot: boolean; isAllowed: boolean; score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    if (!userAgent) {
        return { isBot: true, isAllowed: false, score: 0.9, reasons: ['Missing User-Agent'] };
    }

    // Check allowed bots first (search engines)
    for (const pattern of config.allowPatterns || []) {
        if (pattern.test(userAgent)) {
            return { isBot: true, isAllowed: true, score: 0, reasons: ['Recognized search engine bot'] };
        }
    }

    // Check blocked patterns
    for (const pattern of config.blockPatterns || []) {
        if (pattern.test(userAgent)) {
            reasons.push(`Blocked User-Agent pattern: ${pattern.source}`);
            return { isBot: true, isAllowed: false, score: 0.95, reasons };
        }
    }

    // Analyze User-Agent characteristics

    // Very short User-Agent
    if (userAgent.length < 20) {
        score += 0.3;
        reasons.push('Suspiciously short User-Agent');
    }

    // Missing common browser indicators
    if (!/(mozilla|chrome|safari|firefox|edge|opera)/i.test(userAgent)) {
        score += 0.4;
        reasons.push('Missing common browser identifier');
    }

    // Contains "bot" or "crawler" but not in allowed list
    if (/bot|crawler|spider|scraper/i.test(userAgent)) {
        score += 0.5;
        reasons.push('Contains bot-related keywords');
    }

    // Headless browser indicators
    if (/headless|phantomjs|puppeteer|playwright|selenium/i.test(userAgent)) {
        score += 0.6;
        reasons.push('Headless browser detected');
    }

    return {
        isBot: score > 0.5,
        isAllowed: false,
        score: Math.min(score, 1),
        reasons,
    };
}

/**
 * Analyze request headers for suspicious patterns
 */
function analyzeHeaders(headers: Headers): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    // Missing common headers
    if (!headers.get('accept-language')) {
        score += 0.2;
        reasons.push('Missing Accept-Language header');
    }

    if (!headers.get('accept-encoding')) {
        score += 0.1;
        reasons.push('Missing Accept-Encoding header');
    }

    if (!headers.get('accept')) {
        score += 0.15;
        reasons.push('Missing Accept header');
    }

    // Unusual header order (harder to detect server-side)

    // Check for conflicting headers
    const connection = headers.get('connection')?.toLowerCase();
    if (connection && !['keep-alive', 'close'].includes(connection)) {
        score += 0.1;
        reasons.push('Unusual Connection header value');
    }

    return { score: Math.min(score, 0.5), reasons };
}

// ============================================================
// Rate Limiting by Fingerprint
// ============================================================

// In-memory rate limit store (use Redis in production)
const fingerprintRequests = new Map<string, { count: number; windowStart: number }>();
const WINDOW_SIZE_MS = 60 * 1000; // 1 minute

/**
 * Check rate limit by fingerprint
 */
function checkFingerprintRateLimit(
    fingerprint: string,
    maxRequests: number
): { allowed: boolean; currentCount: number } {
    const now = Date.now();
    const record = fingerprintRequests.get(fingerprint);

    if (!record || now - record.windowStart > WINDOW_SIZE_MS) {
        // New window
        fingerprintRequests.set(fingerprint, { count: 1, windowStart: now });
        return { allowed: true, currentCount: 1 };
    }

    // Increment count
    record.count++;
    fingerprintRequests.set(fingerprint, record);

    return {
        allowed: record.count <= maxRequests,
        currentCount: record.count,
    };
}

// Cleanup old entries periodically
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [fp, record] of fingerprintRequests.entries()) {
            if (now - record.windowStart > WINDOW_SIZE_MS * 2) {
                fingerprintRequests.delete(fp);
            }
        }
    }, WINDOW_SIZE_MS);
}

// ============================================================
// Honeypot Detection
// ============================================================

/**
 * Check if honeypot field was filled (indicates bot)
 */
export function checkHoneypot(
    body: Record<string, unknown>,
    honeypotFields: string[] = ['website', 'url', 'homepage', 'email_confirm']
): boolean {
    for (const field of honeypotFields) {
        if (body[field] && String(body[field]).trim().length > 0) {
            logger.warn('Honeypot field filled', {
                field,
                value: String(body[field]).substring(0, 20),
            });
            return true;
        }
    }
    return false;
}

// ============================================================
// CAPTCHA Challenge Token Verification
// ============================================================

export interface CaptchaVerificationResult {
    valid: boolean;
    score?: number;
    action?: string;
    error?: string;
}

/**
 * Verify reCAPTCHA v3 token
 */
export async function verifyRecaptchaToken(
    token: string,
    expectedAction?: string
): Promise<CaptchaVerificationResult> {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    if (!secretKey) {
        logger.warn('reCAPTCHA secret key not configured');
        return { valid: true }; // Skip verification if not configured
    }

    try {
        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: secretKey,
                response: token,
            }),
        });

        const data = await response.json();

        if (!data.success) {
            return {
                valid: false,
                error: data['error-codes']?.join(', ') || 'Verification failed',
            };
        }

        // Check action matches
        if (expectedAction && data.action !== expectedAction) {
            return {
                valid: false,
                error: `Action mismatch: expected ${expectedAction}, got ${data.action}`,
            };
        }

        return {
            valid: true,
            score: data.score,
            action: data.action,
        };
    } catch (error) {
        logger.error('reCAPTCHA verification error', {
            error: error instanceof Error ? error.message : String(error),
        });
        return { valid: false, error: 'Verification request failed' };
    }
}

/**
 * Verify hCaptcha token
 */
export async function verifyHcaptchaToken(token: string): Promise<CaptchaVerificationResult> {
    const secretKey = process.env.HCAPTCHA_SECRET_KEY;

    if (!secretKey) {
        logger.warn('hCaptcha secret key not configured');
        return { valid: true };
    }

    try {
        const response = await fetch('https://hcaptcha.com/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: secretKey,
                response: token,
            }),
        });

        const data = await response.json();

        return {
            valid: data.success === true,
            error: data.success ? undefined : 'Verification failed',
        };
    } catch (error) {
        logger.error('hCaptcha verification error', {
            error: error instanceof Error ? error.message : String(error),
        });
        return { valid: false, error: 'Verification request failed' };
    }
}

// ============================================================
// Main Bot Detection Function
// ============================================================

/**
 * Comprehensive bot detection
 */
export function detectBot(
    headers: Headers,
    ip: string,
    jsFingerprint?: Partial<ClientFingerprint>,
    body?: Record<string, unknown>,
    config: BotProtectionConfig = DEFAULT_CONFIG
): BotDetectionResult {
    const reasons: string[] = [];
    let totalScore = 0;

    // Generate fingerprint
    const fingerprint = generateFingerprint(headers, ip, jsFingerprint);

    // Analyze User-Agent
    const uaAnalysis = analyzeUserAgent(fingerprint.userAgent, config);
    totalScore += uaAnalysis.score * 0.4; // 40% weight
    reasons.push(...uaAnalysis.reasons);

    if (uaAnalysis.isAllowed) {
        // Skip further analysis for known good bots
        return {
            isBot: true,
            isAllowedBot: true,
            suspicionScore: 0,
            requireCaptcha: false,
            reasons: uaAnalysis.reasons,
            fingerprint,
            rateLimited: false,
            honeypotTriggered: false,
        };
    }

    // Analyze headers
    const headerAnalysis = analyzeHeaders(headers);
    totalScore += headerAnalysis.score * 0.3; // 30% weight
    reasons.push(...headerAnalysis.reasons);

    // Check honeypot
    let honeypotTriggered = false;
    if (config.honeypotEnabled && body) {
        honeypotTriggered = checkHoneypot(body);
        if (honeypotTriggered) {
            totalScore += 0.9;
            reasons.push('Honeypot field filled');
        }
    }

    // Check rate limit by fingerprint
    let rateLimited = false;
    if (config.fingerprintRateLimit) {
        const rateCheck = checkFingerprintRateLimit(
            fingerprint.hash,
            config.maxRequestsPerMinute || 30
        );
        if (!rateCheck.allowed) {
            rateLimited = true;
            totalScore += 0.3;
            reasons.push(`Rate limit exceeded: ${rateCheck.currentCount} requests`);
        }
    }

    // Missing JavaScript fingerprint indicators
    if (config.behavioralAnalysis && !jsFingerprint) {
        totalScore += 0.15;
        reasons.push('Missing JavaScript fingerprint');
    }

    // Cap score at 1
    const finalScore = Math.min(totalScore, 1);

    // Determine if CAPTCHA is required
    const requireCaptcha = finalScore >= (config.captchaThreshold || 0.7);

    // Log suspicious activity
    if (finalScore > 0.5) {
        logger.warn('Suspicious bot activity detected', {
            fingerprintHash: fingerprint.hash,
            ip,
            score: finalScore,
            reasons,
            requireCaptcha,
        });
    }

    return {
        isBot: finalScore > 0.5 || uaAnalysis.isBot,
        isAllowedBot: false,
        suspicionScore: finalScore,
        requireCaptcha,
        reasons,
        fingerprint,
        rateLimited,
        honeypotTriggered,
    };
}

// ============================================================
// Express/Next.js Middleware Helper
// ============================================================

/**
 * Create bot protection response headers
 */
export function getBotProtectionHeaders(result: BotDetectionResult): Record<string, string> {
    return {
        'X-Bot-Score': result.suspicionScore.toFixed(2),
        'X-Fingerprint': result.fingerprint.hash.substring(0, 8),
        ...(result.requireCaptcha ? { 'X-Captcha-Required': 'true' } : {}),
        ...(result.rateLimited ? { 'Retry-After': '60' } : {}),
    };
}
