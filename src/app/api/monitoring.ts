// API endpoint to expose Prometheus metrics
import { NextRequest, NextResponse } from 'next/server';
import { getMetrics } from '@/lib/monitoring';

export async function GET(req: NextRequest) {
  const metrics = getMetrics();
  return new NextResponse(metrics, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
    },
  });
}
