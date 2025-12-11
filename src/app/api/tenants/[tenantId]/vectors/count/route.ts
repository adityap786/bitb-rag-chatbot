import { NextRequest, NextResponse } from 'next/server';
import { createLazyServiceClient, setTenantContext } from '@/lib/supabase-client';
import { verifyBearerToken } from '@/lib/trial/auth';

const supabase = createLazyServiceClient();
export const runtime = 'nodejs';

export async function GET(req: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const token = verifyBearerToken(req);
    const { tenantId } = await context.params;

    if (token.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Unauthorized tenant' }, { status: 403 });
    }

    await setTenantContext(supabase, tenantId);

    const { count = 0, error } = await supabase
      .from('embeddings')
      .select('embedding_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (error) {
      return NextResponse.json({ error: 'Failed to count vectors' }, { status: 500 });
    }

    return NextResponse.json({ tenantId, count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
