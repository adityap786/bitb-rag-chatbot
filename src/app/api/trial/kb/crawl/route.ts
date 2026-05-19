import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import {
  AuthenticationError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/trial/errors';
import { verifyBearerToken } from '@/lib/trial/auth';
import TrialLogger from '@/lib/trial/logger';
import { createLazyServiceClient } from '@/lib/supabase-client';
import { sanitizeText, validateCrawlParams, validateStartUrl } from '@/lib/trial/validation';
import { startTenantPipeline } from '@/lib/trial/start-pipeline';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

export const runtime = 'nodejs';

const supabase = createLazyServiceClient();

const MAX_URLS = 10;
const FETCH_TIMEOUT_MS = 15000;
const MAX_PAGE_CHARS = 100_000;

function stripHtmlToText(html: string): string {
  if (!html) return '';
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');

  return withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'BiTBTrialCrawler/1.0 (+https://bitb.ltd)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch ${url} (HTTP ${res.status})`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/html')) {
      // Still try to read text content; sanitize handles noise.
    }

    const html = await res.text();
    const text = stripHtmlToText(html);
    return text.length > MAX_PAGE_CHARS ? text.slice(0, MAX_PAGE_CHARS) : text;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: any, context: { params: Promise<{}> }) {
  const startTime = Date.now();
  const requestId = randomUUID();

  try {
    // Cheap IP/user rate limiting before auth/DB/network fetch work
    const ipRateLimitResponse = await rateLimit(req, RATE_LIMITS.trial);
    if (ipRateLimitResponse) return ipRateLimitResponse;

    let token;
    try {
      token = verifyBearerToken(req);
    } catch (err: any) {
      TrialLogger.logAuth('failure', undefined, { requestId, error: err.message });
      TrialLogger.logRequest('POST', '/api/trial/kb/crawl', err.statusCode || 401, Date.now() - startTime, {
        requestId,
      });
      return NextResponse.json({ error: err.message }, { status: err.statusCode || 401 });
    }

    const { tenantId } = token;
    const body = await req.json();

    const urls = Array.isArray(body?.urls) ? body.urls : [];
    const depth = typeof body?.depth === 'number' ? body.depth : undefined;

    if (urls.length === 0) {
      throw new ValidationError('At least one URL is required');
    }

    if (urls.length > MAX_URLS) {
      throw new ValidationError(`Maximum ${MAX_URLS} URLs allowed`);
    }

    validateCrawlParams(undefined, depth);
    for (const url of urls) {
      validateStartUrl(url);
    }

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('status')
      .eq('tenant_id', tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new NotFoundError('Tenant');
    }

    if (tenant.status !== 'active') {
      throw new ValidationError('Trial is not active');
    }

    // Use enhanced crawler engine
    const { crawlWebsite } = await import('@/lib/crawl/crawler-engine');

    const crawlDepth = depth ?? 2; // Default to depth 2 for good coverage
    const maxPages = Math.min(urls.length * 10, 50); // Allow 10 pages per URL, max 50

    const results: Array<{ url: string; kbId?: string; status: 'completed' | 'duplicate' | 'failed'; error?: string }> = [];

    // Crawl each provided URL
    for (const startUrl of urls) {
      try {
        const crawlSummary = await crawlWebsite(startUrl, {
          maxDepth: crawlDepth,
          maxPages: Math.ceil(maxPages / urls.length),
          delayMs: 500,
          timeout: 15000,
          useSitemap: true,
          respectRobots: true,
        });

        TrialLogger.info('Crawl completed', {
          requestId,
          tenantId,
          startUrl,
          pagesSucceeded: crawlSummary.pagesSucceeded,
          totalProducts: crawlSummary.totalProducts,
          totalFaqs: crawlSummary.totalFaqs,
          durationMs: crawlSummary.durationMs,
        });

        // Insert each successfully crawled page into KB
        for (const crawlResult of crawlSummary.results) {
          if (crawlResult.status !== 'success' || !crawlResult.formattedText) {
            results.push({
              url: crawlResult.url,
              status: 'failed',
              error: crawlResult.error || 'No content extracted',
            });
            continue;
          }

          const rawText = sanitizeText(crawlResult.formattedText);
          const contentHash = createHash('sha256').update(`${tenantId}|${crawlResult.url}|${rawText}`).digest('hex');

          // Check for duplicates
          const { data: existing, error: checkError } = await supabase
            .from('knowledge_base')
            .select('kb_id')
            .eq('tenant_id', tenantId)
            .eq('content_hash', contentHash)
            .single();

          if (checkError && checkError.code !== 'PGRST116') {
            throw new InternalError('Failed to check knowledge base', new Error(checkError.message));
          }

          if (existing?.kb_id) {
            results.push({ url: crawlResult.url, kbId: existing.kb_id, status: 'duplicate' });
            continue;
          }

          // Insert into KB with structured metadata
          const { data: kb, error: insertError } = await supabase
            .from('knowledge_base')
            .insert({
              tenant_id: tenantId,
              source_type: 'crawl',
              content_hash: contentHash,
              raw_text: rawText,
              metadata: {
                url: crawlResult.url,
                depth: crawlDepth,
                extractedAt: new Date().toISOString(),
                productsCount: crawlResult.extractedPage?.products.length || 0,
                faqsCount: crawlResult.extractedPage?.faqs.length || 0,
                hasContact: !!(crawlResult.extractedPage?.contact.email || crawlResult.extractedPage?.contact.phone),
                title: crawlResult.extractedPage?.title,
              },
            })
            .select('kb_id')
            .single();

          if (insertError || !kb) {
            throw new InternalError('Failed to insert crawled content', new Error(insertError?.message || 'Unknown'));
          }

          TrialLogger.logModification('knowledge_base', 'create', kb.kb_id, tenantId, {
            requestId,
            sourceType: 'crawl',
            url: crawlResult.url,
            depth: crawlDepth,
            productsCount: crawlResult.extractedPage?.products.length || 0,
            faqsCount: crawlResult.extractedPage?.faqs.length || 0,
          });

          results.push({ url: crawlResult.url, kbId: kb.kb_id, status: 'completed' });
        }
      } catch (err) {
        TrialLogger.warn('Crawl URL failed', {
          requestId,
          tenantId,
          url: startUrl,
          error: (err as Error).message,
        });
        results.push({
          url: startUrl,
          status: 'failed',
          error: process.env.NODE_ENV !== 'production' ? (err as Error).message : 'Failed to crawl URL',
        });
      }
    }

    // Start pipeline after crawl to reduce perceived latency.
    let pipelineJobId: string | null = null;
    let pipelineStatus: string | null = null;
    try {
      const pipeline = await startTenantPipeline(tenantId, {
        source: 'crawl',
        skipIfProcessing: true,
        metadata: { urlsCount: urls.length, depth: depth ?? null },
      });
      pipelineJobId = pipeline.jobId;
      pipelineStatus = pipeline.status;
    } catch (err) {
      TrialLogger.warn('Failed to auto-start pipeline after crawl', {
        requestId,
        tenantId,
        error: (err as Error).message,
      });
    }

    TrialLogger.logRequest('POST', '/api/trial/kb/crawl', 200, Date.now() - startTime, {
      requestId,
      tenantId,
      urlsCount: urls.length,
    });

    return NextResponse.json({
      urls: results,
      pipelineJobId,
      pipelineStatus,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AuthenticationError) {
      TrialLogger.logRequest('POST', '/api/trial/kb/crawl', error.statusCode, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof ValidationError) {
      TrialLogger.logRequest('POST', '/api/trial/kb/crawl', error.statusCode, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof NotFoundError) {
      TrialLogger.logRequest('POST', '/api/trial/kb/crawl', 404, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof InternalError) {
      TrialLogger.error(error.message, error, { requestId });
      TrialLogger.logRequest('POST', '/api/trial/kb/crawl', 500, duration, { requestId });
      return NextResponse.json({ error: 'Failed to crawl website' }, { status: 500 });
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    TrialLogger.error('Unexpected error in crawl KB', error as Error, { requestId, errorMsg });
    TrialLogger.logRequest('POST', '/api/trial/kb/crawl', 500, duration, { requestId, error: errorMsg });
    return NextResponse.json({ error: 'Failed to crawl website. Please try again.' }, { status: 500 });
  }
}
