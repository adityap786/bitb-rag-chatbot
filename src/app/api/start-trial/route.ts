/**
 * BiTB Start Trial API Route - Tenant-Isolated Trial Creation
 * POST /api/start-trial
 * 
 * SECURITY:
 * - Creates tenant_id and trial_token
 * - Inserts into Supabase trials table with RLS
 * - Sets 3-day expiry and query limits
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { generateJWT } from '@/lib/jwt';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: any, context: { params: Promise<{}> }) {
  try {
    const body = await request.json();
    const {
      site_origin,
      admin_email,
      display_name,
      data_source,
      theme
      , llm_provider
      , llm_model
    } = body;

    // Validate required fields
    if (!site_origin || !admin_email || !display_name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate tenant_id and trial_token
    const tenant_id = 'tn_' + randomBytes(16).toString('hex');
    const trial_token = 'tr_' + randomBytes(16).toString('hex');
    
    // Calculate expiry (3 days from now)
    const created_at = new Date().toISOString();
    const expires_at = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Set tenant context for RLS
    await supabase.rpc('set_tenant_context', { p_tenant_id: tenant_id });

    // Insert trial record
    const { data: trialRecord, error: insertError } = await supabase
      .from('trials')
      .insert({
        tenant_id,
        trial_token,
        site_origin,
        admin_email,
        display_name,
        theme: theme || {},
        llm_provider: llm_provider || process.env.BITB_LLM_PROVIDER || 'groq',
        llm_model: llm_model || process.env.BITB_LLM_MODEL || 'llama-3.3-70b-versatile',
        created_at,
        expires_at,
        status: 'active',
        queries_used: 0,
        queries_limit: 100
      })
      .select()
      .single();

    if (insertError) {
      console.error('Trial insertion error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create trial', details: insertError.message },
        { status: 500 }
      );
    }

    // Ensure tenant exists for onboarding APIs that are tenant-table-based
    // and store setup_token for legacy trial_token validation.
    try {
      const tenantInsert = await supabase
        .from('tenants')
        .insert({
          tenant_id,
          email: admin_email,
          name: display_name,
          status: 'active',
          plan: 'trial',
          plan_type: 'service',
          expires_at,
          metadata: {
            setup_token: trial_token,
            created_via: 'start-trial',
            site_origin,
          },
        });

      if (tenantInsert.error) {
        // Don't fail trial creation if tenant provisioning fails; many APIs will fail later,
        // but trial creation should remain best-effort.
        console.error('Tenant provisioning error:', tenantInsert.error);
      }
    } catch (err) {
      console.error('Tenant provisioning exception:', err);
    }

    // Start ingestion job by calling /api/ingest internally
    let job_id = 'job_' + randomBytes(8).toString('hex');
    try {
      const ingestRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id, trial_token, data_source })
      });
      const ingestData = await ingestRes.json();
      if (ingestRes.ok && ingestData.job_id) {
        job_id = ingestData.job_id;
      }
    } catch (err) {
      console.error('Failed to start ingestion job automatically:', err);
    }

    // Generate JWT access token for API auth
    const access_token = generateJWT(tenant_id, trial_token);

    // Generate embed code
    const widgetUrl = process.env.NEXT_PUBLIC_WIDGET_URL || 'https://bitb.ltd';
    const embed_code = `<script src="${widgetUrl}/bitb-widget.js" data-tenant-id="${tenant_id}" data-trial-token="${trial_token}" data-theme="${theme?.theme || 'auto'}"></script>`;

    const response = {
      success: true,
      tenant_id,
      trial_token,
      access_token,
      expires_at,
      embed_code,
      ingestion_job_id: job_id,
      message: 'Trial created successfully'
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Start Trial Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Example Production Implementation with Database:
 * 
 * import { db } from '@/lib/db';
 * import { startIngestionJob } from '@/lib/ingestion';
 * 
 * // Save trial to database
 * const trialRecord = await db.trial.create({
 *   data: {
 *     trialToken: trial_token,
 *     siteOrigin: site_origin,
 *     adminEmail: admin_email,
 *     displayName: display_name,
 *     theme: theme,
 *     createdAt: created_at,
 *     expiresAt: expires_at,
 *     status: 'active',
 *     usageCount: 0,
 *     queriesLimit: 100
 *   }
 * });
 * 
 * // Start ingestion job (Python worker)
 * const job_id = await startIngestionJob({
 *   trial_token,
 *   data_source
 * });
 * 
 * // Track job in database
 * await db.ingestionJob.create({
 *   data: {
 *     jobId: job_id,
 *     trialToken: trial_token,
 *     status: 'queued',
 *     dataSource: data_source,
 *     startedAt: new Date()
 *   }
 * });
 */
