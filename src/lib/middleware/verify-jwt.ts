import { NextResponse } from 'next/server';
import { jwtVerify, importSPKI, createRemoteJWKSet } from 'jose';

/**
 * Verify a BitB JWT from the Authorization header.
 * Returns the verified payload on success, or a NextResponse error when
 * verification fails (fail-closed pattern).
 *
 * Expects either:
 * - `BITB_JWKS_URL` env var (preferred)
 * - or `BITB_JWT_PUBLIC_KEY` (PEM) for RS256 verification
 */
export async function verifyBitbJwt(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const issuer = process.env.BITB_JWT_ISSUER || 'https://api.bitb.example.com';
    const audience = process.env.BITB_JWT_AUDIENCE || 'bitb-widget';

    if (process.env.BITB_JWKS_URL) {
      const jwks = createRemoteJWKSet(new URL(process.env.BITB_JWKS_URL));
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      return payload;
    }

    if (process.env.BITB_JWT_PUBLIC_KEY) {
      // importSPKI supports PEM-formatted public keys
      const pub = process.env.BITB_JWT_PUBLIC_KEY;
      const key = await importSPKI(pub, 'RS256');
      const { payload } = await jwtVerify(token, key, { issuer, audience });
      return payload;
    }

    return NextResponse.json({ error: 'Server misconfiguration: no JWKS or public key' }, { status: 500 });
  } catch (err: any) {
    // Log and fail closed
    // eslint-disable-next-line no-console
    console.error('[verifyBitbJwt] verification failed', err);
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
}
