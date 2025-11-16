/**
 * BiTB Check Trial API Route - Enhanced with Preview Mode
 * GET /api/check-trial?trial_token=xxx&origin=xxx
 * 
 * Validates trial token and returns:
 * - Validity status
 * - Expiry date
 * - Days remaining
 * - Usage statistics
 * - Preview mode support
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trial_token = searchParams.get('trial_token');
    const origin = searchParams.get('origin');

    if (!trial_token) {
      return NextResponse.json(
        { error: 'Missing trial_token parameter' },
        { status: 400 }
      );
    }

    // Check if preview mode
    if (trial_token === 'preview') {
      return NextResponse.json({
        valid: true,
        preview: true,
        expires_at: null,
        days_remaining: 999,
        usage: {
          queries_used: 0,
          queries_limit: 999,
          queries_remaining: 999
        }
      });
    }

    // Validate token format for production tokens
    if (!trial_token.match(/^tr_[a-f0-9]{32}$/)) {
      return NextResponse.json(
        { valid: false, error: 'Invalid token format' },
        { status: 400 }
      );
    }

    // TODO: Look up trial in database with origin validation
    // const trial = await db.trial.findUnique({
    //   where: { trialToken: trial_token }
    // });
    // 
    // if (!trial) {
    //   return NextResponse.json({ valid: false, error: 'Trial not found' });
    // }
    //
    // // Validate origin for security
    // if (origin && trial.siteOrigin !== origin) {
    //   return NextResponse.json({ 
    //     valid: false, 
    //     error: 'Origin mismatch - token is locked to different domain' 
    //   }, { status: 403 });
    // }
    //
    // const now = new Date();
    // const expires_at = new Date(trial.expiresAt);
    // const is_valid = now < expires_at && trial.status === 'active';
    // const days_remaining = Math.ceil((expires_at - now) / (1000 * 60 * 60 * 24));

    // Mock response for production mode
    const mockResponse = {
      valid: true,
      preview: false,
      expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      days_remaining: 2,
      usage: {
        queries_used: 15,
        queries_limit: 100,
        queries_remaining: 85
      }
    };

    return NextResponse.json(mockResponse);

  } catch (error) {
    console.error('Check Trial Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Example Production Implementation:
 * 
 * import { db } from '@/lib/db';
 * 
 * const trial = await db.trial.findUnique({
 *   where: { trialToken: trial_token },
 *   include: { usage: true }
 * });
 * 
 * if (!trial) {
 *   return NextResponse.json({ 
 *     valid: false, 
 *     error: 'Trial not found' 
 *   }, { status: 404 });
 * }
 * 
 * const now = new Date();
 * const expires_at = new Date(trial.expiresAt);
 * const is_valid = now < expires_at && trial.status === 'active';
 * 
 * const days_remaining = Math.max(0, 
 *   Math.ceil((expires_at.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
 * );
 * 
 * return NextResponse.json({
 *   valid: is_valid,
 *   expires_at: expires_at.toISOString(),
 *   days_remaining,
 *   usage: {
 *     queries_used: trial.usageCount || 0,
 *     queries_limit: trial.queriesLimit || 100,
 *     queries_remaining: (trial.queriesLimit || 100) - (trial.usageCount || 0)
 *   }
 * });
 */