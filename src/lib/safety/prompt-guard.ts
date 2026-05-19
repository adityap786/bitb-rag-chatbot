/**
 * Prompt Injection Detection & Response Safety
 * 
 * Protects against:
 * - System prompt manipulation attempts
 * - Jailbreak patterns
 * - Data exfiltration via prompts
 * - Response leakage of internal data
 */

export interface PromptSafetyResult {
    isSafe: boolean;
    threatType: 'none' | 'injection' | 'jailbreak' | 'exfiltration' | 'overflow';
    confidence: number;
    sanitizedInput?: string;
}

// Prompt injection patterns (common attack vectors)
const INJECTION_PATTERNS = [
    // Direct instruction override
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i,
    /disregard\s+(all\s+)?(previous|prior|above)/i,
    /forget\s+(everything|all)\s+(you|about)/i,

    // Role manipulation
    /you\s+are\s+now\s+(a|an|the)/i,
    /act\s+as\s+(if\s+you\s+are\s+)?(a|an|the)/i,
    /pretend\s+(to\s+be|you\s+are)/i,
    /roleplay\s+as/i,
    /switch\s+(to|into)\s+.*(mode|persona)/i,

    // System prompt extraction
    /what\s+(is|are)\s+(your|the)\s+(system\s+)?prompt/i,
    /show\s+(me\s+)?(your|the)\s+(system\s+)?prompt/i,
    /reveal\s+(your|the)\s+(instructions?|prompt)/i,
    /repeat\s+(your|the)\s+(instructions?|prompt)/i,

    // Instruction markers (model-specific)
    /\[INST\]/i,
    /\[\/INST\]/i,
    /<\|system\|>/i,
    /<\|user\|>/i,
    /<\|assistant\|>/i,
    /<<SYS>>/i,
    /<\/s>/i,

    // Context manipulation
    /new\s+conversation/i,
    /reset\s+(the\s+)?conversation/i,
    /clear\s+(your\s+)?memory/i,

    // Developer mode attempts
    /developer\s+mode/i,
    /DAN\s+mode/i,
    /jailbreak/i,
    /bypass\s+(your\s+)?(restrictions?|filters?|rules?)/i,
];

// Jailbreak patterns (more sophisticated attacks)
const JAILBREAK_PATTERNS = [
    /do\s+anything\s+now/i,      // DAN
    /hypothetically/i,           // Hypothetical framing
    /for\s+(educational|research)\s+purposes/i,
    /in\s+a\s+fictional\s+scenario/i,
    /let'?s\s+play\s+a\s+game/i,
    /imagine\s+you\s+(are|were|have)\s+no\s+(restrictions?|rules?|limits?)/i,
];

// Data exfiltration patterns
const EXFILTRATION_PATTERNS = [
    /list\s+all\s+(your\s+)?(training\s+)?data/i,
    /what\s+(documents?|files?|data)\s+(do\s+you\s+)?(have|know|contain)/i,
    /dump\s+(all\s+)?(your\s+)?knowledge/i,
    /export\s+(all\s+)?(the\s+)?data/i,
];

/**
 * Detects potential prompt injection attacks
 */
export function detectPromptInjection(input: string): PromptSafetyResult {
    if (!input || typeof input !== 'string') {
        return { isSafe: true, threatType: 'none', confidence: 1.0 };
    }

    const normalizedInput = input.toLowerCase().trim();

    // Check input length (potential overflow)
    if (input.length > 8000) {
        return {
            isSafe: false,
            threatType: 'overflow',
            confidence: 0.95,
        };
    }

    // Check for injection patterns
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(input)) {
            return {
                isSafe: false,
                threatType: 'injection',
                confidence: 0.9,
                sanitizedInput: sanitizePromptInput(input),
            };
        }
    }

    // Check for jailbreak patterns
    for (const pattern of JAILBREAK_PATTERNS) {
        if (pattern.test(input)) {
            return {
                isSafe: false,
                threatType: 'jailbreak',
                confidence: 0.85,
                sanitizedInput: sanitizePromptInput(input),
            };
        }
    }

    // Check for exfiltration patterns
    for (const pattern of EXFILTRATION_PATTERNS) {
        if (pattern.test(input)) {
            return {
                isSafe: false,
                threatType: 'exfiltration',
                confidence: 0.8,
                sanitizedInput: sanitizePromptInput(input),
            };
        }
    }

    return { isSafe: true, threatType: 'none', confidence: 1.0 };
}

/**
 * Sanitizes input by removing potential injection markers
 */
export function sanitizePromptInput(input: string): string {
    let sanitized = input;

    // Remove instruction markers
    sanitized = sanitized.replace(/\[INST\]|\[\/INST\]/gi, '');
    sanitized = sanitized.replace(/<\|(system|user|assistant)\|>/gi, '');
    sanitized = sanitized.replace(/<<SYS>>|<\/s>/gi, '');

    // Escape special characters that might be interpreted as instructions
    sanitized = sanitized.replace(/```/g, '');

    return sanitized.trim();
}

/**
 * Sanitizes LLM response to remove internal markers
 */
export function sanitizeResponse(response: string): string {
    if (!response || typeof response !== 'string') {
        return response;
    }

    let sanitized = response;

    // Remove source reference markers (e.g., [1], [source:2])
    sanitized = sanitized.replace(/\[\d+\]/g, '');
    sanitized = sanitized.replace(/\[source:\d+\]/gi, '');

    // Remove any leaked system prompts
    sanitized = sanitized.replace(/system\s*prompt\s*:/gi, '');
    sanitized = sanitized.replace(/\[system\]/gi, '');

    // Remove instruction markers that might have leaked
    sanitized = sanitized.replace(/\[INST\]|\[\/INST\]/gi, '');
    sanitized = sanitized.replace(/<\|(system|user|assistant)\|>/gi, '');

    return sanitized.trim();
}

/**
 * Validates that a response doesn't leak sensitive data
 */
export function validateResponseSafety(response: string, tenantId: string): boolean {
    if (!response) return true;

    // Check if response contains tenant ID (shouldn't be leaked)
    if (response.includes(tenantId)) {
        return false;
    }

    // Check for potential API key patterns
    const apiKeyPattern = /sk-[a-zA-Z0-9]{32,}/;
    if (apiKeyPattern.test(response)) {
        return false;
    }

    // Check for database connection strings
    const dbPattern = /postgres(ql)?:\/\/[^\s]+/i;
    if (dbPattern.test(response)) {
        return false;
    }

    return true;
}

/**
 * Rate limits rapid-fire queries that might indicate automated attack
 */
const queryTimestamps = new Map<string, number[]>();

export function detectQueryFlood(tenantId: string, windowMs: number = 10000, maxQueries: number = 10): boolean {
    const now = Date.now();
    const timestamps = queryTimestamps.get(tenantId) || [];

    // Remove old timestamps
    const recentTimestamps = timestamps.filter(ts => now - ts < windowMs);
    recentTimestamps.push(now);
    queryTimestamps.set(tenantId, recentTimestamps);

    return recentTimestamps.length > maxQueries;
}

/**
 * Clears flood detection cache for a tenant
 */
export function clearFloodCache(tenantId: string): void {
    queryTimestamps.delete(tenantId);
}
