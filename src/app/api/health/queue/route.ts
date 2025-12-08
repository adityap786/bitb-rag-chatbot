/**
 * Queue Health Check Endpoint
 * GET /api/health/queue
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkQueueHealth } from '@/lib/queues/ingestQueue';

export async function GET(request: any, context: { params: Promise<{}> }) {
  try {
    const health = await checkQueueHealth();
    
    const statusCode = health.healthy ? 200 : 503;
    
    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      {
        healthy: false,
        redis: false,
        queue: false,
        worker: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
