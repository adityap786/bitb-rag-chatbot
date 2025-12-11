import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';

const supabase = createLazyServiceClient();
export const runtime = 'nodejs';

export async function GET(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const token = verifyBearerToken(req);
    const { tenantId } = await context.params;

    if (token.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: cfg, error } = await supabase
      .from('widget_configs')
      .select('primary_color, secondary_color, chat_tone, welcome_message, avatar_url, prompt_template, assigned_tools')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !cfg) {
      return NextResponse.json({ error: 'Branding not found' }, { status: 404 });
    }

    return NextResponse.json({
      primaryColor: cfg.primary_color,
      secondaryColor: cfg.secondary_color,
      chatTone: cfg.chat_tone,
      welcomeMessage: cfg.welcome_message,
      logo: cfg.avatar_url || null,
      framework: null,
      hosting: null,
      assignedTools: cfg.assigned_tools || [],
      promptTemplate: cfg.prompt_template || null,
    });
  } catch (error) {
    console.error('Branding fetch error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
