import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';

/**
 * Admin endpoint to fetch citation click metrics.
 * Optional query param: tenantId
 * Secured by `x-admin-key` header matching `ADMIN_API_KEY` when set.
 */
export async function GET(req: any, context: { params: Promise<{}> }) {
  try {
    const adminHeader = req.headers.get('x-admin-key') || '';
    const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
    if (ADMIN_API_KEY && adminHeader !== ADMIN_API_KEY) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId');

    const supabase = createLazyServiceClient();

    let q: any = supabase
      .from('citations')
      .select('id, tenant_id, source_title, source_url, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (tenantId) q = q.eq('tenant_id', tenantId);

    const { data, error } = await q;
    if (error) {
      console.warn('[admin/citation-metrics] supabase error', error);
      return NextResponse.json({ success: false, error }, { status: 500 });
    }

    const results = (data || []).map((r: any) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      source_title: r.source_title,
      source_url: r.source_url,
      clicks: r.metadata?.clicks || 0,
      last_clicked_at: r.metadata?.last_clicked_at || null,
      created_at: r.created_at,
    }));

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    console.error('[admin/citation-metrics] unexpected error', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
