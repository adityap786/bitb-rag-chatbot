import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/health
 * Health check endpoint for monitoring and load balancers
 */
export async function GET() {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '0.1.0',
        services: {
            api: 'ok',
        },
    };

    return NextResponse.json(health, {
        status: 200,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}
