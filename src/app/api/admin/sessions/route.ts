import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

// GET: List chat sessions (with filtering)
export async function GET(req: any, context: { params: Promise<{}> }) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId');
  const status = url.searchParams.get('status');
  const limit = Number(url.searchParams.get('limit') || 50);
  const query = supabase.from('chat_sessions').select('*').order('last_activity', { ascending: false }).limit(limit);
  if (tenantId) query.eq('tenant_id', tenantId);
  if (status) query.eq('status', status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}

// DELETE: Remove a chat session
export async function DELETE(req: any, context: { params: Promise<{}> }) {
  const body = await req.json();
  if (!body.sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  const { error } = await supabase.from('chat_sessions').delete().eq('session_id', body.sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
