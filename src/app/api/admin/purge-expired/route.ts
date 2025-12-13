/**
 * API Route: Purge Expired Trials
 * 
 * This endpoint should be called periodically (via cron or scheduler)
 * to clean up expired trial data including:
 * - FAISS indices
 * - Knowledge base entries
 * - Embeddings
 * - Chat sessions
 * - Trial tenant records
 * 
 * Protected by admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/auth/admin-middleware';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ingestWorkerPath = process.env.INGEST_WORKER_PATH || 'python/ingest-worker.py';

function getPythonExecutable(): string {
  if (process.env.PYTHON_EXECUTABLE) return process.env.PYTHON_EXECUTABLE;
  // Avoid the literal 'python' string in the bundle to reduce Turbopack file-pattern scanning.
  if (process.platform === 'win32') return ['p', 'y', 't', 'h', 'o', 'n'].join('');
  // Also avoid a literal 'python3' so Turbopack doesn't fold it into a file pattern warning.
  return ['p', 'y', 't', 'h', 'o', 'n', '3'].join('');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /api/admin/purge-expired
 * 
 * Triggers cleanup of expired trial data
 * 
 * Query params:
 * - dry_run: boolean (default: false) - preview what would be deleted without actually deleting
 * - grace_period_hours: number (default: 0) - additional hours past expiry before deletion
 * 
 * Authentication: Requires admin role
 */
export async function POST(req: any, context: { params: Promise<{}> }) {
  try {
    // Check admin authentication
    await requireAdmin(req);

    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get('dry_run') === 'true';
    const gracePeriodHours = parseInt(searchParams.get('grace_period_hours') || '0', 10);

    console.log('[Purge] Starting expired trials cleanup', { dryRun, gracePeriodHours });

    // Find expired trials (with grace period)
    const expiryThreshold = new Date();
    expiryThreshold.setHours(expiryThreshold.getHours() - gracePeriodHours);

    const { data: expiredTrials, error: fetchError } = await supabase
      .from('tenants')
      .select('tenant_id, email, expires_at, status')
      .eq('status', 'active')
      .lt('expires_at', expiryThreshold.toISOString());

    if (fetchError) {
      console.error('[Purge] Error fetching expired trials:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch expired trials', details: fetchError.message },
        { status: 500 }
      );
    }

    if (!expiredTrials || expiredTrials.length === 0) {
      console.log('[Purge] No expired trials found');
      return NextResponse.json({
        success: true,
        message: 'No expired trials to purge',
        purged_count: 0,
        dry_run: dryRun
      });
    }

    console.log(`[Purge] Found ${expiredTrials.length} expired trials`);

    const results = {
      total: expiredTrials.length,
      purged: [] as any[],
      failed: [] as any[],
      dry_run: dryRun
    };

    // Process each expired trial
    for (const trial of expiredTrials) {
      try {
        console.log(`[Purge] Processing trial: ${trial.tenant_id} (${trial.email})`);

        if (!dryRun) {
          // Call Python worker purge function
          const purgeResult = await purgeTrial(trial.tenant_id);

          if (purgeResult.success) {
            // Update trial status to expired
            const { error: updateError } = await supabase
              .from('tenants')
              .update({ 
                status: 'expired'
              })
              .eq('tenant_id', trial.tenant_id);

            if (updateError) {
              throw new Error(`Failed to update trial status: ${updateError.message}`);
            }

            results.purged.push({
              tenant_id: trial.tenant_id,
              email: trial.email,
              expired_at: trial.expires_at,
              ...purgeResult
            });
          } else {
            throw new Error(purgeResult.error || 'Unknown purge error');
          }
        } else {
          // Dry run: just collect info
          results.purged.push({
            tenant_id: trial.tenant_id,
            email: trial.email,
            expired_at: trial.expires_at,
            would_delete: {
              faiss_index: true,
              knowledge_base: true,
              embeddings: true,
              chat_sessions: true
            }
          });
        }
      } catch (err: any) {
        console.error(`[Purge] Error purging trial ${trial.tenant_id}:`, err);
        results.failed.push({
          tenant_id: trial.tenant_id,
          email: trial.email,
          error: err.message
        });
      }
    }

    console.log('[Purge] Cleanup complete', {
      purged: results.purged.length,
      failed: results.failed.length
    });

    return NextResponse.json({
      success: true,
      message: `Purge ${dryRun ? 'preview' : 'completed'}`,
      ...results
    });

  } catch (error: any) {
    console.error('[Purge] Error:', error);
    
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Admin authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Purge operation failed', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Call Python worker to purge trial data
 */
async function purgeTrial(tenantId: string): Promise<{ success: boolean; error?: string; deleted?: any }> {
  const pythonExecutable = getPythonExecutable();
  const { spawn } = await import('node:child_process');

  return new Promise((resolve) => {
    const args = [
      ingestWorkerPath,
      '--purge-trial',
      tenantId
    ];

    console.log('[Purge] Executing:', pythonExecutable, args.join(' '));

    const worker = spawn(pythonExecutable, args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    worker.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    worker.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      worker.kill();
      resolve({ success: false, error: 'Purge operation timed out after 60s' });
    }, 60000);

    worker.on('close', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        // Try to parse JSON output
        try {
          const result = JSON.parse(stdout.trim());
          resolve({ success: true, deleted: result });
        } catch {
          resolve({ success: true, deleted: { raw_output: stdout } });
        }
      } else {
        console.error('[Purge] Worker failed:', stderr);
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
      }
    });

    worker.on('error', (err) => {
      clearTimeout(timeout);
      console.error('[Purge] Worker spawn error:', err);
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * GET /api/admin/purge-expired
 * 
 * Preview expired trials without purging
 */
export async function GET(req: any, context: { params: Promise<{}> }) {
  try {
    await requireAdmin(req);

    const { searchParams } = new URL(req.url);
    const gracePeriodHours = parseInt(searchParams.get('grace_period_hours') || '0', 10);

    const expiryThreshold = new Date();
    expiryThreshold.setHours(expiryThreshold.getHours() - gracePeriodHours);

    const { data: expiredTrials, error } = await supabase
      .from('tenants')
      .select('tenant_id, email, expires_at, created_at, status')
      .eq('status', 'active')
      .lt('expires_at', expiryThreshold.toISOString())
      .order('expires_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch expired trials', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      count: expiredTrials?.length || 0,
      grace_period_hours: gracePeriodHours,
      expiry_threshold: expiryThreshold.toISOString(),
      trials: expiredTrials || []
    });

  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Admin authentication required' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to preview expired trials', details: error.message },
      { status: 500 }
    );
  }
}
