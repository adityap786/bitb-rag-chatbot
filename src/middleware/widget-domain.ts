/**
 * Widget Domain Validation Middleware
 * 
 * Validates that widget requests come from allowed domains.
 * Prevents embedding abuse and cross-site attacks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

export interface WidgetDomainConfig {
    widgetId: string;
    tenantId: string;
    allowedDomains: string[];
    allowLocalhost: boolean;
}

export interface DomainValidationResult {
    valid: boolean;
    error?: string;
    matchedDomain?: string;
}

// Cache for domain configs (TTL: 5 minutes)
const domainConfigCache = new Map<string, { config: WidgetDomainConfig; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Extracts origin from request
 */
export function extractRequestOrigin(req: NextRequest): string | null {
    // Check Origin header first (preflight/CORS)
    const origin = req.headers.get('origin');
    if (origin) return origin;

    // Fall back to Referer
    const referer = req.headers.get('referer');
    if (referer) {
        try {
            const url = new URL(referer);
            return `${url.protocol}//${url.host}`;
        } catch {
            return null;
        }
    }

    return null;
}

/**
 * Fetches allowed domains for a widget/tenant
 */
export async function getWidgetDomainConfig(widgetId: string): Promise<WidgetDomainConfig | null> {
    // Check cache
    const cached = domainConfigCache.get(widgetId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.config;
    }

    try {
        const { data, error } = await supabase
            .from('widget_configs')
            .select('widget_id, tenant_id, allowed_domains, allow_localhost')
            .eq('widget_id', widgetId)
            .single();

        if (error || !data) {
            return null;
        }

        const config: WidgetDomainConfig = {
            widgetId: data.widget_id,
            tenantId: data.tenant_id,
            allowedDomains: data.allowed_domains || [],
            allowLocalhost: data.allow_localhost ?? true,
        };

        // Cache it
        domainConfigCache.set(widgetId, {
            config,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return config;
    } catch {
        return null;
    }
}

/**
 * Validates if origin is allowed for a widget
 */
export function validateOrigin(origin: string, config: WidgetDomainConfig): DomainValidationResult {
    if (!origin) {
        return { valid: false, error: 'Missing origin' };
    }

    try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();

        // Allow localhost in development
        if (config.allowLocalhost) {
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) {
                return { valid: true, matchedDomain: 'localhost' };
            }
        }

        // Check against allowed domains
        for (const allowed of config.allowedDomains) {
            const normalizedAllowed = allowed.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

            // Exact match
            if (hostname === normalizedAllowed) {
                return { valid: true, matchedDomain: allowed };
            }

            // Wildcard subdomain match (*.example.com)
            if (normalizedAllowed.startsWith('*.')) {
                const baseDomain = normalizedAllowed.slice(2);
                if (hostname.endsWith(baseDomain) && hostname !== baseDomain) {
                    return { valid: true, matchedDomain: allowed };
                }
            }
        }

        return { valid: false, error: `Origin ${origin} not in allowed domains` };
    } catch {
        return { valid: false, error: 'Invalid origin format' };
    }
}

/**
 * Middleware to validate widget domain
 */
export async function validateWidgetDomain(
    req: NextRequest,
    widgetId: string
): Promise<NextResponse | null> {
    const origin = extractRequestOrigin(req);

    // Allow in development without strict checking
    if (process.env.NODE_ENV === 'development' && !origin) {
        return null; // Allow
    }

    const config = await getWidgetDomainConfig(widgetId);

    // If no config exists, allow (fallback for new widgets)
    if (!config) {
        return null;
    }

    // If no domains configured, allow all (widget hasn't been restricted yet)
    if (config.allowedDomains.length === 0 && config.allowLocalhost) {
        return null;
    }

    if (!origin) {
        return NextResponse.json(
            { error: 'Widget access denied: Missing origin header' },
            { status: 403 }
        );
    }

    const validation = validateOrigin(origin, config);

    if (!validation.valid) {
        return NextResponse.json(
            { error: 'Widget access denied: Domain not authorized' },
            {
                status: 403,
                headers: {
                    'X-Widget-Error': 'DOMAIN_NOT_ALLOWED',
                },
            }
        );
    }

    return null; // Valid, allow request
}

/**
 * Adds a domain to widget allowed list
 */
export async function addAllowedDomain(widgetId: string, domain: string): Promise<boolean> {
    try {
        const config = await getWidgetDomainConfig(widgetId);
        if (!config) return false;

        const domains = new Set(config.allowedDomains);
        domains.add(domain.toLowerCase());

        const { error } = await supabase
            .from('widget_configs')
            .update({ allowed_domains: Array.from(domains) })
            .eq('widget_id', widgetId);

        if (error) return false;

        // Invalidate cache
        domainConfigCache.delete(widgetId);

        return true;
    } catch {
        return false;
    }
}

/**
 * Clears domain config cache
 */
export function clearDomainCache(widgetId?: string): void {
    if (widgetId) {
        domainConfigCache.delete(widgetId);
    } else {
        domainConfigCache.clear();
    }
}
