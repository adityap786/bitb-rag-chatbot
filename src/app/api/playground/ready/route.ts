import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenant');

  if (!tenantId) {
    return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
  }

  try {
    // We might want to verify a token here too, but for a playground check 
    // it might be public or use a different auth mechanism. 
    // For now, we'll keep it simple but read-only.

    const { data: tenant, error } = await supabase
      .from('trial_tenants')
      .select('rag_status')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ ready: false, reason: 'Tenant not found' });
    }

    if (tenant.rag_status !== 'active') {
      // Double check if there's a completed job, maybe status wasn't updated
      const { data: job } = await supabase
        .from('ingestion_jobs')
        .select('status')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .limit(1)
        .single();
      
      if (job) {
        return NextResponse.json({ ready: true });
      }

      return NextResponse.json({ 
        ready: false, 
        reason: 'Pipeline not ready',
        status: tenant.rag_status 
      });
    }

    return NextResponse.json({ ready: true });

  } catch (error) {
    console.error('Playground readiness check failed:', error);
    return NextResponse.json({ ready: false, error: 'Internal error' }, { status: 500 });
  }
}
