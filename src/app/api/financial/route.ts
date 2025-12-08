import { NextResponse } from 'next/server';
import { getFinancialDisclaimer, checkTransaction } from '@/lib/financial/compliance';

export async function POST(request: Request) {
  const body = await request.json();
  const { tenantId, action, payload } = body;

  // Financial disclaimer
  if (action === 'financial_disclaimer') {
    return NextResponse.json({ disclaimer: getFinancialDisclaimer() });
  }

  // Transaction check
  if (action === 'check_transaction') {
    const amount = payload?.amount || 0;
    return NextResponse.json(checkTransaction(amount));
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
