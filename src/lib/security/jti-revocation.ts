import { redis } from '../redis-client';

const REVOCATION_TTL = 60 * 60 * 24; // 24 hours

export async function revokeJTI(jti: string) {
  if (!jti) return;
  if (redis && typeof (redis as any).set === 'function') {
    await (redis as any).set(`revoked_jti:${jti}`, '1', 'EX', REVOCATION_TTL);
  }
}

export async function isJTIRevoked(jti: string): Promise<boolean> {
  if (!jti) return false;
  if (redis && typeof (redis as any).get === 'function') {
    const val = await (redis as any).get(`revoked_jti:${jti}`);
    return val === '1';
  }
  return false;
}
