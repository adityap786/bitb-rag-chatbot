/**
 * Tenant Context Validation Middleware
 * 
 * SECURITY: Fail-closed middleware that validates tenant context
 * on every request. Rejects requests without valid tenant_id.
 * 
 * Date: 2025-11-10
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateTenantId } from "@/lib/rag/supabase-retriever";

interface TenantContextBody {
  tenant_id?: string;
  trial_token?: string;
  [key: string]: unknown;
}

/**
 * Validate tenant context from request body
 * Returns null if valid, NextResponse error if invalid
 */
export async function validateTenantContext(
  request: NextRequest
): Promise<NextResponse | null> {
  try {
    const body = (await request.json()) as TenantContextBody;
    const { tenant_id, trial_token } = body;

    // SECURITY: Fail closed if tenant_id missing
    if (!tenant_id) {
      return NextResponse.json(
        {
          error: "SECURITY: tenant_id is required",
          code: "MISSING_TENANT_CONTEXT",
        },
        { status: 403 }
      );
    }

    // Validate tenant_id format
    try {
      validateTenantId(tenant_id);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "SECURITY: Invalid tenant_id",
          code: "INVALID_TENANT_ID",
        },
        { status: 403 }
      );
    }

    // If trial_token provided, validate it matches tenant
    if (trial_token) {
      const isValid = await validateTrialToken(trial_token, tenant_id);
      if (!isValid) {
        return NextResponse.json(
          {
            error: "SECURITY: Invalid or expired trial token",
            code: "INVALID_TRIAL_TOKEN",
          },
          { status: 403 }
        );
      }
    }

    // Validation passed
    return null;
  } catch (error) {
    // If JSON parsing fails or other error, fail closed
    return NextResponse.json(
      {
        error: "SECURITY: Invalid request format",
        code: "INVALID_REQUEST",
      },
      { status: 400 }
    );
  }
}

/**
 * Validate trial token and ensure it matches tenant_id
 * Also checks expiration and status
 */
async function validateTrialToken(
  trialToken: string,
  tenantId: string
): Promise<boolean> {
  // Validate trial_token format
  const trialTokenRegex = /^tr_[a-f0-9]{32}$/;
  if (!trialTokenRegex.test(trialToken)) {
    return false;
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials missing");
    }

    const client = createClient(supabaseUrl, supabaseKey);

    // Set RLS context
    await client.rpc("set_tenant_context", { p_tenant_id: tenantId });

    // Query trials table with RLS enforcement
    const { data, error } = await client
      .from("trials")
      .select("tenant_id, expires_at, status, queries_used, queries_limit")
      .eq("trial_token", trialToken)
      .eq("tenant_id", tenantId) // Explicit filter for defense in depth
      .single();

    if (error || !data) {
      return false;
    }

    // Check if trial is expired
    if (data.status !== "active") {
      return false;
    }

    if (new Date(data.expires_at) < new Date()) {
      return false;
    }

    // Check if query limit exceeded
    if (data.queries_used >= data.queries_limit) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Trial token validation error:", error);
    return false; // Fail closed on error
  }
}

/**
 * Increment query usage counter for trial
 * Call this after successful query
 */
export async function incrementQueryUsage(
  tenantId: string,
  trialToken: string
): Promise<void> {
  try {
    validateTenantId(tenantId);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials missing");
    }

    const client = createClient(supabaseUrl, supabaseKey);

    // Set RLS context
    await client.rpc("set_tenant_context", { p_tenant_id: tenantId });

    // First get current count, then increment
    const { data: trial } = await client
      .from("trials")
      .select("queries_used")
      .eq("trial_token", trialToken)
      .eq("tenant_id", tenantId)
      .single();

    if (trial) {
      const { error } = await client
        .from("trials")
        .update({ queries_used: trial.queries_used + 1 })
        .eq("trial_token", trialToken)
        .eq("tenant_id", tenantId);

      if (error) {
        console.error("Failed to increment query usage:", error);
      }
    }
  } catch (error) {
    console.error("incrementQueryUsage error:", error);
    // Don't fail the request if usage tracking fails
  }
}

/**
 * Check if tenant has exceeded query limit
 */
export async function checkQueryLimit(
  tenantId: string,
  trialToken: string
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    validateTenantId(tenantId);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { allowed: false, remaining: 0 };
    }

    const client = createClient(supabaseUrl, supabaseKey);

    // Set RLS context
    await client.rpc("set_tenant_context", { p_tenant_id: tenantId });

    const { data, error } = await client
      .from("trials")
      .select("queries_used, queries_limit")
      .eq("trial_token", trialToken)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) {
      return { allowed: false, remaining: 0 };
    }

    const remaining = data.queries_limit - data.queries_used;
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
    };
  } catch (error) {
    console.error("checkQueryLimit error:", error);
    return { allowed: false, remaining: 0 };
  }
}

/**
 * Extract tenant context from request
 * Use this helper in API routes
 */
export async function extractTenantContext(
  request: NextRequest
): Promise<{ tenant_id: string; trial_token?: string } | null> {
  try {
    const body = (await request.json()) as TenantContextBody;
    const { tenant_id, trial_token } = body;

    if (!tenant_id) {
      return null;
    }

    validateTenantId(tenant_id);

    return {
      tenant_id,
      trial_token: trial_token || undefined,
    };
  } catch (error) {
    return null;
  }
}
