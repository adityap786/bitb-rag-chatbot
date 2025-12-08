import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';

export async function POST(req: any, context: { params: Promise<{}> }) {
  try {
    const body = await req.json();
    const { tenantId, conversationId, messageId, sourceUrl, title } = body || {};
    if (!sourceUrl) {
      return NextResponse.json({ success: false, error: 'missing sourceUrl' }, { status: 400 });
    }

    const supabase = createLazyServiceClient();

    // Try to find an existing citation record for the same tenant/message/source
    let q: any = supabase.from('citations').select('id, metadata').eq('source_url', sourceUrl);
    if (tenantId) q = q.eq('tenant_id', tenantId);
    if (messageId) q = q.eq('message_id', messageId);

    const { data, error: selectError } = await q.limit(1);
    if (selectError) {
      console.warn('[citation-click] select error', selectError);
    }

    const existing = Array.isArray(data) && data.length > 0 ? data[0] : null;

    if (existing) {
      const meta = existing.metadata || {};
      const clicks = (typeof meta.clicks === 'number' ? meta.clicks : 0) + 1;
      const newMeta = { ...meta, clicks, last_clicked_at: new Date().toISOString() };
      const { error: updateErr } = await supabase.from('citations').update({ metadata: newMeta }).eq('id', existing.id);
      if (updateErr) console.warn('[citation-click] update error', updateErr);
      return NextResponse.json({ success: true });
    }

    // Insert a lightweight citation record if none exists (so we can track clicks)
    const insertPayload: any = {
      tenant_id: tenantId || null,
      conversation_id: conversationId || null,
      message_id: messageId || null,
      source_title: title || null,
      source_url: sourceUrl,
      excerpt: null,
      confidence_score: null,
      metadata: { clicks: 1, created_by: 'widget', last_clicked_at: new Date().toISOString() },
    };

    const { error: insertErr } = await supabase.from('citations').insert([insertPayload]);
    if (insertErr) {
      console.warn('[citation-click] insert error', insertErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[citation-click] unexpected error', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
