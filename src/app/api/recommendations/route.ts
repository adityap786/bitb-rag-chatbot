
import { NextResponse } from 'next/server';
import { getRecommendations } from '@/lib/recommendations/engine';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { recentQueries, cartItems } = body;
    const recommendations = getRecommendations({ recentQueries, cartItems });
    return NextResponse.json({ recommendations });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
