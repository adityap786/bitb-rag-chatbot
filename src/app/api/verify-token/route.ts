import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { isJTIRevoked } from '@/lib/security/jti-revocation';

const SERVER_SECRET = process.env.SERVER_SECRET;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = body?.token;
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    let payload: any;
    if (!SERVER_SECRET) {
      return NextResponse.json({ error: 'Server misconfiguration: SERVER_SECRET is not set' }, { status: 500 });
    }
    try {
      payload = jwt.verify(token, SERVER_SECRET);
    } catch (err: any) {
      return NextResponse.json({ error: 'JWT verification failed', details: err?.message }, { status: 401 });
    }
    if (payload?.jti) {
      const revoked = await isJTIRevoked(payload.jti);
      if (revoked) {
        return NextResponse.json({ error: 'Token revoked', jti: payload.jti }, { status: 401 });
      }
    }
    return NextResponse.json({ valid: true, payload });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Verify error' }, { status: 500 });
  }
}
