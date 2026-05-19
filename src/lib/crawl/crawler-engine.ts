/**
 * Crawler Engine - BFS recursive crawler with rate limiting
 * Production-grade implementation with safety limits and structured extraction
 */

import {
    fetchSitemap,
    prioritizeUrls,
    fetchRobotsTxt,
    isAllowedByRobots
} from './sitemap-parser';
import {
    extractPageContent,
    formatExtractedPageAsText,
    ExtractedPage
} from './content-extractor';

export interface CrawlOptions {
    maxDepth: number;        // How deep to crawl (1 = start page only)
    maxPages: number;        // Maximum pages to crawl
    delayMs: number;         // Delay between requests
    timeout: number;         // Timeout per request
    useSitemap: boolean;     // Try sitemap.xml first
    respectRobots: boolean;  // Respect robots.txt
}

export interface CrawlResult {
    url: string;
    status: 'success' | 'failed' | 'skipped';
    extractedPage?: ExtractedPage;
    formattedText?: string;
    error?: string;
}

export interface CrawlSummary {
    startUrl: string;
    pagesAttempted: number;
    pagesSucceeded: number;
    pagesFailed: number;
    results: CrawlResult[];
    totalProducts: number;
    totalFaqs: number;
    durationMs: number;
}

const DEFAULT_OPTIONS: CrawlOptions = {
    maxDepth: 2,
    maxPages: 50,
    delayMs: 500,
    timeout: 15000,
    useSitemap: true,
    respectRobots: true,
};

/**
 * Main crawl function - orchestrates the entire crawl process
 */
export async function crawlWebsite(
    startUrl: string,
    options: Partial<CrawlOptions> = {}
): Promise<CrawlSummary> {
    const startTime = Date.now();
    const opts: CrawlOptions = { ...DEFAULT_OPTIONS, ...options };

    const results: CrawlResult[] = [];
    const visited = new Set<string>();
    let disallowedPaths: string[] = [];

    // Normalize base URL
    let baseUrl: string;
    try {
        const parsed = new URL(startUrl);
        baseUrl = `${parsed.protocol}//${parsed.host}`;
    } catch {
        return {
            startUrl,
            pagesAttempted: 0,
            pagesSucceeded: 0,
            pagesFailed: 1,
            results: [{ url: startUrl, status: 'failed', error: 'Invalid URL' }],
            totalProducts: 0,
            totalFaqs: 0,
            durationMs: Date.now() - startTime,
        };
    }

    // Fetch robots.txt
    if (opts.respectRobots) {
        disallowedPaths = await fetchRobotsTxt(baseUrl);
    }

    // Build URL queue
    const queue: { url: string; depth: number }[] = [];

    // Try sitemap first
    if (opts.useSitemap) {
        const sitemap = await fetchSitemap(baseUrl);
        if (sitemap.urls.length > 0) {
            const prioritized = prioritizeUrls(sitemap.urls, opts.maxPages);
            for (const item of prioritized) {
                queue.push({ url: item.loc, depth: 1 });
            }
        }
    }

    // If no sitemap or empty, start with the provided URL
    if (queue.length === 0) {
        queue.push({ url: startUrl, depth: 0 });
    }

    // BFS crawl loop
    while (queue.length > 0 && results.length < opts.maxPages) {
        const { url, depth } = queue.shift()!;

        // Normalize and dedupe
        const normalizedUrl = normalizeUrl(url);
        if (visited.has(normalizedUrl)) continue;
        visited.add(normalizedUrl);

        // Check robots.txt
        if (opts.respectRobots && !isAllowedByRobots(normalizedUrl, disallowedPaths)) {
            results.push({ url: normalizedUrl, status: 'skipped', error: 'Blocked by robots.txt' });
            continue;
        }

        // Check same domain
        if (!isSameDomain(normalizedUrl, baseUrl)) {
            continue;
        }

        // Rate limiting delay
        if (results.length > 0) {
            await delay(opts.delayMs);
        }

        // Fetch and extract
        try {
            const html = await fetchPage(normalizedUrl, opts.timeout);
            const extracted = extractPageContent(html, normalizedUrl);
            const formattedText = formatExtractedPageAsText(extracted);

            results.push({
                url: normalizedUrl,
                status: 'success',
                extractedPage: extracted,
                formattedText,
            });

            // Discover links for deeper crawl
            if (depth < opts.maxDepth) {
                const newLinks = discoverLinks(html, normalizedUrl, baseUrl);
                for (const link of newLinks) {
                    if (!visited.has(normalizeUrl(link)) && queue.length < opts.maxPages * 2) {
                        queue.push({ url: link, depth: depth + 1 });
                    }
                }
            }
        } catch (err: any) {
            results.push({
                url: normalizedUrl,
                status: 'failed',
                error: err.message || 'Failed to fetch',
            });
        }
    }

    // Calculate summary stats
    const succeeded = results.filter(r => r.status === 'success');
    const totalProducts = succeeded.reduce((sum, r) =>
        sum + (r.extractedPage?.products.length || 0), 0);
    const totalFaqs = succeeded.reduce((sum, r) =>
        sum + (r.extractedPage?.faqs.length || 0), 0);

    return {
        startUrl,
        pagesAttempted: results.length,
        pagesSucceeded: succeeded.length,
        pagesFailed: results.filter(r => r.status === 'failed').length,
        results,
        totalProducts,
        totalFaqs,
        durationMs: Date.now() - startTime,
    };
}

/**
 * Fetches a single page
 */
async function fetchPage(url: string, timeout: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'BiTBTrialCrawler/1.0 (+https://bitb.ltd)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Discovers internal links from HTML
 */
function discoverLinks(html: string, currentUrl: string, baseUrl: string): string[] {
    const links: string[] = [];
    const seen = new Set<string>();

    // Match all href attributes
    const hrefRegex = /href=["']([^"'#]+)["']/gi;
    let match;

    while ((match = hrefRegex.exec(html)) !== null) {
        let href = match[1];

        // Skip common non-page resources
        if (isSkippableResource(href)) continue;

        // Resolve relative URLs
        try {
            const resolved = new URL(href, currentUrl).href;
            const normalized = normalizeUrl(resolved);

            // Only same domain
            if (isSameDomain(normalized, baseUrl) && !seen.has(normalized)) {
                seen.add(normalized);
                links.push(normalized);
            }
        } catch {
            // Skip invalid URLs
        }
    }

    // Prioritize important pages
    return prioritizeLinkList(links);
}

/**
 * Prioritizes discovered links by importance
 */
function prioritizeLinkList(links: string[]): string[] {
    const highPriority: string[] = [];
    const medPriority: string[] = [];
    const lowPriority: string[] = [];

    for (const link of links) {
        const path = new URL(link).pathname.toLowerCase();

        if (/\/(product|item|shop|store|pricing|plans|faq|support|help)/i.test(path)) {
            highPriority.push(link);
        } else if (/\/(about|contact|services|solutions|features)/i.test(path)) {
            medPriority.push(link);
        } else {
            lowPriority.push(link);
        }
    }

    return [...highPriority, ...medPriority, ...lowPriority].slice(0, 50);
}

/**
 * Checks if URL should be skipped
 */
function isSkippableResource(href: string): boolean {
    const skip = [
        /\.(jpg|jpeg|png|gif|svg|webp|ico)$/i,
        /\.(css|js|woff|woff2|ttf|eot)$/i,
        /\.(pdf|doc|docx|xls|xlsx|zip|rar)$/i,
        /^javascript:/i,
        /^mailto:/i,
        /^tel:/i,
        /^#/,
        /\/(wp-admin|wp-includes|admin|login|logout|cart|checkout)/i,
    ];

    return skip.some(pattern => pattern.test(href));
}

/**
 * Normalizes URL for deduplication
 */
function normalizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        // Remove trailing slash, lowercase, remove common tracking params
        let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
        return normalized.toLowerCase();
    } catch {
        return url.toLowerCase();
    }
}

/**
 * Checks if URL is same domain
 */
function isSameDomain(url: string, baseUrl: string): boolean {
    try {
        const urlHost = new URL(url).host.toLowerCase();
        const baseHost = new URL(baseUrl).host.toLowerCase();
        return urlHost === baseHost || urlHost.endsWith('.' + baseHost);
    } catch {
        return false;
    }
}

/**
 * Delay helper for rate limiting
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
