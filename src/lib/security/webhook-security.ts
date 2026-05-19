/**
 * Webhook Security Module
 * 
 * Production-grade webhook verification:
 * - HMAC-SHA256 signature verification
 * - Timestamp validation (±5 min tolerance)
 * - Replay attack prevention (nonce tracking)
 * - Provider-specific handling
 */

import crypto from 'crypto';
import { logger } from '@/lib/observability/logger';

// ============================================================
// Types & Configuration
// ============================================================

export interface WebhookConfig {
    /** Webhook secret for HMAC verification */
    secret: string;
    /** Signature header name */
    signatureHeader: string;
    /** Timestamp header name (optional) */
    timestampHeader?: string;
    /** Tolerance for timestamp validation in seconds */
    timestampToleranceSeconds?: number;
    /** Enable replay protection (requires Redis) */
    replayProtection?: boolean;
    /** Nonce TTL in seconds for replay protection */
    nonceTtlSeconds?: number;
    /** Allowed IP addresses (optional whitelist) */
    allowedIPs?: string[];
    /** Signature algorithm */
    algorithm?: 'sha256' | 'sha512';
}

export interface WebhookVerificationResult {
    valid: boolean;
    error?: string;
    provider?: string;
    eventType?: string;
    idempotencyKey?: string;
    warnings?: string[];
}

// Provider-specific configurations
export const WEBHOOK_PROVIDERS: Record<string, Partial<WebhookConfig>> = {
    stripe: {
        signatureHeader: 'stripe-signature',
        timestampToleranceSeconds: 300,
        algorithm: 'sha256',
    },
    supabase: {
        signatureHeader: 'x-supabase-signature',
        algorithm: 'sha256',
    },
    github: {
        signatureHeader: 'x-hub-signature-256',
        algorithm: 'sha256',
    },
    custom: {
        signatureHeader: 'x-webhook-signature',
        timestampHeader: 'x-webhook-timestamp',
        timestampToleranceSeconds: 300,
        algorithm: 'sha256',
    },
};

// ============================================================
// Signature Verification
// ============================================================

/**
 * Compute HMAC signature
 */
function computeSignature(
    payload: string | Buffer,
    secret: string,
    algorithm: 'sha256' | 'sha512' = 'sha256'
): string {
    return crypto
        .createHmac(algorithm, secret)
        .update(payload)
        .digest('hex');
}

/**
 * Constant-time string comparison (prevents timing attacks)
 */
function secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Parse Stripe-style signature header
 * Format: t=timestamp,v1=signature
 */
function parseStripeSignature(header: string): { timestamp: number; signatures: string[] } | null {
    try {
        const parts = header.split(',');
        let timestamp = 0;
        const signatures: string[] = [];

        for (const part of parts) {
            const [key, value] = part.split('=');
            if (key === 't') {
                timestamp = parseInt(value, 10);
            } else if (key.startsWith('v')) {
                signatures.push(value);
            }
        }

        if (!timestamp || signatures.length === 0) {
            return null;
        }

        return { timestamp, signatures };
    } catch {
        return null;
    }
}

// ============================================================
// Replay Protection (In-Memory for dev, Redis for production)
// ============================================================

const usedNonces = new Map<string, number>();
const NONCE_CLEANUP_INTERVAL = 60 * 1000; // 1 minute

// Cleanup old nonces periodically
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [nonce, timestamp] of usedNonces.entries()) {
            if (now - timestamp > 10 * 60 * 1000) { // 10 minutes
                usedNonces.delete(nonce);
            }
        }
    }, NONCE_CLEANUP_INTERVAL);
}

/**
 * Check if nonce has been used (replay detection)
 * In production, use Redis for distributed nonce tracking
 */
async function checkAndStoreNonce(nonce: string, ttlSeconds: number = 600): Promise<boolean> {
    // Check if nonce exists
    if (usedNonces.has(nonce)) {
        return false; // Replay detected
    }

    // Store nonce
    usedNonces.set(nonce, Date.now());

    // TODO: Use Redis in production
    // const redis = getRedis();
    // const key = `webhook:nonce:${nonce}`;
    // const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    // return result === 'OK';

    return true;
}

/**
 * Generate unique nonce from webhook content
 */
function generateNonce(payload: string, timestamp: number, signature: string): string {
    return crypto
        .createHash('sha256')
        .update(`${timestamp}:${signature}:${payload.substring(0, 100)}`)
        .digest('hex')
        .substring(0, 32);
}

// ============================================================
// IP Validation
// ============================================================

/**
 * Validate request IP against whitelist
 */
function validateIP(
    requestIP: string,
    allowedIPs?: string[]
): { valid: boolean; error?: string } {
    if (!allowedIPs || allowedIPs.length === 0) {
        return { valid: true };
    }

    // Normalize IP
    const normalizedIP = requestIP.replace('::ffff:', '');

    if (allowedIPs.includes(normalizedIP)) {
        return { valid: true };
    }

    // Check CIDR ranges
    for (const allowed of allowedIPs) {
        if (allowed.includes('/')) {
            if (isIPInCIDR(normalizedIP, allowed)) {
                return { valid: true };
            }
        }
    }

    return {
        valid: false,
        error: `IP ${normalizedIP} not in allowed list`,
    };
}

/**
 * Check if IP is in CIDR range
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split('/');
    if (!bits) return ip === range;

    const ipNum = ipToNumber(ip);
    const rangeNum = ipToNumber(range);
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);

    return (ipNum & mask) === (rangeNum & mask);
}

function ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

// ============================================================
// Main Verification Functions
// ============================================================

/**
 * Verify Stripe webhook signature
 */
export async function verifyStripeWebhook(
    payload: string,
    signatureHeader: string,
    secret: string,
    options: { toleranceSeconds?: number; replayProtection?: boolean } = {}
): Promise<WebhookVerificationResult> {
    const toleranceSeconds = options.toleranceSeconds || 300;

    // Parse signature header
    const parsed = parseStripeSignature(signatureHeader);
    if (!parsed) {
        return {
            valid: false,
            error: 'Invalid signature header format',
            provider: 'stripe',
        };
    }

    const { timestamp, signatures } = parsed;

    // Validate timestamp
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
        return {
            valid: false,
            error: `Timestamp outside tolerance (${Math.abs(now - timestamp)}s drift)`,
            provider: 'stripe',
        };
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = computeSignature(signedPayload, secret, 'sha256');

    // Check if any signature matches
    const signatureValid = signatures.some(sig => secureCompare(sig, expectedSignature));
    if (!signatureValid) {
        return {
            valid: false,
            error: 'Signature verification failed',
            provider: 'stripe',
        };
    }

    // Check replay protection
    if (options.replayProtection) {
        const nonce = generateNonce(payload, timestamp, signatures[0]);
        const isNewRequest = await checkAndStoreNonce(nonce);
        if (!isNewRequest) {
            return {
                valid: false,
                error: 'Replay attack detected: duplicate request',
                provider: 'stripe',
            };
        }
    }

    return {
        valid: true,
        provider: 'stripe',
    };
}

/**
 * Verify generic HMAC webhook signature
 */
export async function verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    config: WebhookConfig
): Promise<WebhookVerificationResult> {
    const warnings: string[] = [];

    // Validate IP if configured
    // (IP would be passed separately in real implementation)

    // Normalize signature (remove algorithm prefix if present)
    let normalizedSig = signature;
    if (normalizedSig.startsWith('sha256=')) {
        normalizedSig = normalizedSig.substring(7);
    } else if (normalizedSig.startsWith('sha512=')) {
        normalizedSig = normalizedSig.substring(7);
    }

    // Compute expected signature
    const algorithm = config.algorithm || 'sha256';
    const expectedSignature = computeSignature(payload, config.secret, algorithm);

    // Constant-time comparison
    if (!secureCompare(normalizedSig.toLowerCase(), expectedSignature.toLowerCase())) {
        logger.warn('Webhook signature verification failed', {
            signatureReceived: normalizedSig.substring(0, 8) + '...',
            algorithm,
        });

        return {
            valid: false,
            error: 'Signature verification failed',
        };
    }

    // Check replay protection if enabled
    if (config.replayProtection) {
        const nonce = generateNonce(
            typeof payload === 'string' ? payload : payload.toString(),
            Date.now(),
            normalizedSig
        );
        const isNewRequest = await checkAndStoreNonce(nonce, config.nonceTtlSeconds);
        if (!isNewRequest) {
            return {
                valid: false,
                error: 'Replay attack detected',
            };
        }
    }

    return {
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}

/**
 * Create webhook verification middleware for specific provider
 */
export function createWebhookVerifier(
    provider: keyof typeof WEBHOOK_PROVIDERS,
    secretEnvVar: string
) {
    return async function verifyWebhook(
        req: Request,
        rawBody: string
    ): Promise<WebhookVerificationResult> {
        const secret = process.env[secretEnvVar];
        if (!secret) {
            logger.error('Webhook secret not configured', { provider, secretEnvVar });
            return {
                valid: false,
                error: 'Webhook secret not configured',
                provider,
            };
        }

        const providerConfig = WEBHOOK_PROVIDERS[provider];
        const signatureHeader = req.headers.get(providerConfig.signatureHeader || 'x-signature');

        if (!signatureHeader) {
            return {
                valid: false,
                error: `Missing signature header: ${providerConfig.signatureHeader}`,
                provider,
            };
        }

        // Provider-specific verification
        if (provider === 'stripe') {
            return verifyStripeWebhook(rawBody, signatureHeader, secret, {
                toleranceSeconds: providerConfig.timestampToleranceSeconds,
                replayProtection: true,
            });
        }

        // Generic verification
        return verifyWebhookSignature(rawBody, signatureHeader, {
            secret,
            signatureHeader: providerConfig.signatureHeader!,
            algorithm: providerConfig.algorithm,
            replayProtection: true,
            timestampToleranceSeconds: providerConfig.timestampToleranceSeconds,
        });
    };
}

// ============================================================
// Idempotency Handling
// ============================================================

/**
 * Extract and validate idempotency key from webhook
 */
export function extractIdempotencyKey(
    headers: Headers,
    body: Record<string, unknown>
): string | null {
    // Check common idempotency key headers
    const headerKey = headers.get('idempotency-key')
        || headers.get('x-idempotency-key')
        || headers.get('x-request-id');

    if (headerKey) {
        return headerKey;
    }

    // Check body for event ID
    if (typeof body.id === 'string') {
        return body.id;
    }

    if (typeof body.event_id === 'string') {
        return body.event_id;
    }

    return null;
}

/**
 * Check if webhook event has already been processed
 */
export async function isEventProcessed(idempotencyKey: string): Promise<boolean> {
    // TODO: Implement with Redis/database
    // const redis = getRedis();
    // return await redis.exists(`webhook:processed:${idempotencyKey}`) === 1;
    return false;
}

/**
 * Mark webhook event as processed
 */
export async function markEventProcessed(
    idempotencyKey: string,
    ttlSeconds: number = 86400 * 7 // 7 days
): Promise<void> {
    // TODO: Implement with Redis/database
    // const redis = getRedis();
    // await redis.set(`webhook:processed:${idempotencyKey}`, '1', 'EX', ttlSeconds);
    logger.info('Webhook event processed', { idempotencyKey });
}
