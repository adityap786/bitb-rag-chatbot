import { NextRequest, NextResponse } from 'next/server';
import { getMetrics as getPromMetrics } from '@/lib/monitoring/metrics';
import { getMetrics as getLegacyMetrics } from '@/lib/monitoring';

export async function GET(req: any, context: { params: Promise<{}> }) {
  // SECURITY: Restrict access in production (API key and IP allowlist)
  const allowedIPs = (process.env.METRICS_ALLOWLIST || '').split(',').map(ip => ip.trim()).filter(Boolean);
  const requesterIP = req.headers.get('x-forwarded-for') || req.ip || '';
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.METRICS_API_KEY;
  if (expectedKey && apiKey !== expectedKey) {
    return new NextResponse('Unauthorized: Invalid API key', { status: 401 });
  }
  if (allowedIPs.length && !allowedIPs.includes(requesterIP)) {
    return new NextResponse('Forbidden: IP not allowed', { status: 403 });
  }
  const promMetrics = await getPromMetrics();
  return new NextResponse(promMetrics, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4',
      'Cache-Control': 'no-store',
    },
  });
}
