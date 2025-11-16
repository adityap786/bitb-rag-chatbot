/**
 * BiTB RAG Query API Route - Tenant-Isolated Retrieval
 * POST /api/ask
 *
 * SECURITY:
 * - Validates tenant_id and trial_token
 * - All vector queries filtered by tenant_id
 * - RLS enforces tenant isolation
 * - Increments query usage counter
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseRetriever } from "@/lib/rag/supabase-retriever";
import { PIIMasker, detectPII } from "@/lib/security/pii-masking";
// Simple in-memory rate limiter (for demo; use Redis/Supabase for production)
const tenantRateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10;

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Validate tenant context (fail-closed)
    const validationError = await validateTenantContext(request);
    if (validationError) {
      return validationError;
    }

    const body = await request.json();
    const { tenant_id, trial_token, query } = body as {
      tenant_id: string;
      trial_token?: string;
      query?: string;
    };

    // Per-tenant rate limiting
    const now = Date.now();
    let rateInfo = tenantRateLimits.get(tenant_id);
    if (!rateInfo || now - rateInfo.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateInfo = { count: 0, windowStart: now };
    }
    rateInfo.count++;
    tenantRateLimits.set(tenant_id, rateInfo);
    if (rateInfo.count > RATE_LIMIT_MAX) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please wait before sending more requests.",
          code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      );
    }

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    // GUARDRAIL: detect and log PII before processing
    const piiDetections = detectPII(query);
    if (piiDetections.length > 0) {
      await AuditLogger.logPIIDetection(tenant_id, piiDetections.map(d => d.type), query);
    }

    // Check query limit for trial users
    if (trial_token) {
      const { allowed, remaining } = await checkQueryLimit(tenant_id, trial_token);
      if (!allowed) {
        return NextResponse.json(
          {
            error: "Query limit exceeded. Please upgrade your plan.",
            code: "QUERY_LIMIT_EXCEEDED",
            queries_remaining: 0,
          },
          { status: 429 }
        );
      }
    }

    // Get tenant-isolated retriever (use PII-masked query for retrieval)
    const retriever = await getSupabaseRetriever(tenant_id, { k: 3 });

    // Retrieve relevant documents
    const maskedQuery = PIIMasker.forLLM(query).masked_text;
    const documents = await retriever.invoke(maskedQuery);

    // Format response
    const sources = documents.map((doc: { pageContent: string; metadata: Record<string, unknown> }) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
    }));

    // Optionally call LLM for more natural answers when available
    // Respect per-tenant LLM preferences if set in `trials` table
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await supabase.rpc('set_tenant_context', { p_tenant_id: tenant_id });
    const { data: trial } = await supabase
      .from('trials')
      .select('llm_provider, llm_model')
      .eq('tenant_id', tenant_id)
      .single();

    const llm = await createLlm({ provider: trial?.llm_provider, model: trial?.llm_model });
    let answer = documents.length > 0 ? documents[0].pageContent : "I couldn't find relevant information in the knowledge base.";
    try {
      if (llm && documents.length > 0) {
        const context = documents
          .slice(0, 4)
          .map((doc: any, idx: number) => {
            const title = doc.metadata?.title ?? `Document ${idx + 1}`;
            const url = doc.metadata?.url ?? "";
            const content = (doc.pageContent ?? "").slice(0, 800);
            return `\n[${idx + 1}] ${title}\nURL: ${url}\n${content}`;
          })
          .join("\n\n");

        const prompt = ChatPromptTemplate.fromMessages([
          [
            "system",
            "You are a helpful assistant that answers using only the provided context. Keep answers concise, cite sources with [n].",
          ],
          ["human", "Question: {question}\n\nContext:\n{context}\n\nRespond in markdown with helpful structure."],
        ]);

        const promptValue = await prompt.invoke({ question: maskedQuery, context });
        const llmResult = await llm.invoke(promptValue);
        if (llmResult && llmResult.trim().length > 0) {
          answer = llmResult;
        }
      }
    } catch (err) {
      console.warn('[API/ask] LLM generation failed, using extractive answer', err);
      // Continue with the extractive answer
    }

    // Increment query usage
    if (trial_token) {
      await incrementQueryUsage(tenant_id, trial_token);
    }

    const responsePayload = {
      answer,
      sources,
      confidence: documents.length > 0 ? 0.8 : 0.1,
      preview: false,
    };

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("RAG Query Error:", error);
    return NextResponse.json(
      {
        answer: "I ran into an issue retrieving that information. Please try again in a moment.",
        sources: [],
        confidence: 0.1,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}