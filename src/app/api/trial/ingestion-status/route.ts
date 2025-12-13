import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';
import { AuthenticationError } from '@/lib/trial/errors';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

const supabase = createLazyServiceClient();

export async function GET(req: NextRequest) {
  try {
    const ipRateLimitResponse = await rateLimit(req, RATE_LIMITS.trialStatus);
    if (ipRateLimitResponse) return ipRateLimitResponse;

    // Verify authentication
    const token = verifyBearerToken(req);
    const { tenantId } = token;

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // Query ingestion job, ensuring it belongs to the authenticated tenant
    const { data, error } = await supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('job_id', jobId)
      .eq('tenant_id', tenantId) // Security check
      .single();

    if (error) {
      // If not found or error (could be RLS or just not found), return 404
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error('Ingestion status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
