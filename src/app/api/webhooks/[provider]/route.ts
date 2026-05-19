/**
 * Dynamic Webhook Handler
 * 
 * Handles webhooks for multiple providers with signature verification.
 * Route: /api/webhooks/[provider]
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createWebhookVerifier,
    extractIdempotencyKey,
    isEventProcessed,
    markEventProcessed,
} from '@/lib/security/webhook-security';
import { logger } from '@/lib/observability/logger';

// Map providers to their secret environment variable names
const PROVIDER_SECRETS: Record<string, string> = {
    stripe: 'STRIPE_WEBHOOK_SECRET',
    supabase: 'SUPABASE_WEBHOOK_SECRET',
    github: 'GITHUB_WEBHOOK_SECRET',
    custom: 'CUSTOM_WEBHOOK_SECRET',
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    const startTime = Date.now();
    const { provider } = await params;

    // Validate provider
    if (!PROVIDER_SECRETS[provider]) {
        logger.warn('Unknown webhook provider', { provider });
        return NextResponse.json(
            { error: 'Unknown webhook provider' },
            { status: 400 }
        );
    }

    // Get raw body for signature verification
    const rawBody = await request.text();

    if (!rawBody) {
        logger.warn('Empty webhook body', { provider });
        return NextResponse.json(
            { error: 'Empty request body' },
            { status: 400 }
        );
    }

    try {
        // Verify webhook signature
        const verifier = createWebhookVerifier(
            provider as keyof typeof PROVIDER_SECRETS,
            PROVIDER_SECRETS[provider]
        );

        const verification = await verifier(request, rawBody);

        if (!verification.valid) {
            logger.warn('Webhook signature verification failed', {
                provider,
                error: verification.error,
            });
            return NextResponse.json(
                { error: 'Signature verification failed', details: verification.error },
                { status: 401 }
            );
        }

        // Parse body
        let body: Record<string, unknown>;
        try {
            body = JSON.parse(rawBody);
        } catch {
            logger.warn('Invalid webhook JSON', { provider });
            return NextResponse.json(
                { error: 'Invalid JSON body' },
                { status: 400 }
            );
        }

        // Extract idempotency key
        const idempotencyKey = extractIdempotencyKey(request.headers, body);

        // Check for duplicate event
        if (idempotencyKey) {
            const processed = await isEventProcessed(idempotencyKey);
            if (processed) {
                logger.info('Duplicate webhook event ignored', {
                    provider,
                    idempotencyKey,
                });
                return NextResponse.json({ received: true, duplicate: true });
            }
        }

        // Route to provider-specific handler
        const result = await handleWebhookEvent(provider, body);

        // Mark event as processed
        if (idempotencyKey) {
            await markEventProcessed(idempotencyKey);
        }

        const processingTime = Date.now() - startTime;

        logger.info('Webhook processed successfully', {
            provider,
            eventType: body.type || body.event,
            idempotencyKey,
            processingTimeMs: processingTime,
        });

        return NextResponse.json({
            received: true,
            processed: result.processed,
            processingTimeMs: processingTime,
        });

    } catch (error) {
        logger.error('Webhook processing error', {
            provider,
            error: error instanceof Error ? error.message : String(error),
        });

        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500 }
        );
    }
}

/**
 * Route webhook events to appropriate handlers
 */
async function handleWebhookEvent(
    provider: string,
    body: Record<string, unknown>
): Promise<{ processed: boolean; result?: unknown }> {
    const eventType = String(body.type || body.event || 'unknown');

    switch (provider) {
        case 'stripe':
            return handleStripeEvent(eventType, body);
        case 'supabase':
            return handleSupabaseEvent(eventType, body);
        case 'github':
            return handleGithubEvent(eventType, body);
        default:
            return handleGenericEvent(eventType, body);
    }
}

/**
 * Handle Stripe webhook events
 */
async function handleStripeEvent(
    eventType: string,
    body: Record<string, unknown>
): Promise<{ processed: boolean; result?: unknown }> {
    logger.info('Processing Stripe webhook', { eventType });

    switch (eventType) {
        case 'checkout.session.completed':
            // Handle successful checkout
            return { processed: true };

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
            // Handle subscription changes
            return { processed: true };

        case 'customer.subscription.deleted':
            // Handle subscription cancellation
            return { processed: true };

        case 'invoice.payment_succeeded':
            // Handle successful payment
            return { processed: true };

        case 'invoice.payment_failed':
            // Handle failed payment
            return { processed: true };

        default:
            logger.info('Unhandled Stripe event type', { eventType });
            return { processed: false };
    }
}

/**
 * Handle Supabase webhook events
 */
async function handleSupabaseEvent(
    eventType: string,
    body: Record<string, unknown>
): Promise<{ processed: boolean; result?: unknown }> {
    logger.info('Processing Supabase webhook', { eventType });

    switch (eventType) {
        case 'user.created':
            // Handle new user signup
            return { processed: true };

        case 'user.deleted':
            // Handle user deletion
            return { processed: true };

        default:
            return { processed: false };
    }
}

/**
 * Handle GitHub webhook events
 */
async function handleGithubEvent(
    eventType: string,
    body: Record<string, unknown>
): Promise<{ processed: boolean; result?: unknown }> {
    logger.info('Processing GitHub webhook', { eventType });

    // GitHub uses X-GitHub-Event header for event type
    switch (eventType) {
        case 'push':
            // Handle push events (e.g., for documentation sync)
            return { processed: true };

        case 'release':
            // Handle release events
            return { processed: true };

        default:
            return { processed: false };
    }
}

/**
 * Handle generic/custom webhook events
 */
async function handleGenericEvent(
    eventType: string,
    body: Record<string, unknown>
): Promise<{ processed: boolean; result?: unknown }> {
    logger.info('Processing generic webhook', { eventType, body });

    // Custom webhook handling logic
    return { processed: true };
}

// Support HEAD requests for webhook verification
export async function HEAD() {
    return new NextResponse(null, { status: 200 });
}
