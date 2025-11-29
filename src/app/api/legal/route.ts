import { NextResponse } from 'next/server';
import { getLegalDisclaimer, analyzeDocument } from '@/lib/legal/compliance';

export async function POST(request: Request) {
  const body = await request.json();
  const { tenantId, action, payload } = body;

  // Legal disclaimer
  if (action === 'legal_disclaimer') {
    const jurisdiction = payload?.jurisdiction || 'US';
    return NextResponse.json({ disclaimer: getLegalDisclaimer(jurisdiction) });
  }

  // Document analysis
  if (action === 'analyze_document') {
    const text = payload?.text || '';
    return NextResponse.json({ analysis: analyzeDocument(text) });
  }

  // Jurisdiction awareness
  if (action === 'jurisdiction_check') {
    const jurisdiction = payload?.jurisdiction || 'US';
    // Stub: In real app, check supported jurisdictions
    return NextResponse.json({ supported: ['US', 'EU', 'IN'].includes(jurisdiction), jurisdiction });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
