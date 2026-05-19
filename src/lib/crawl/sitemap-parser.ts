/**
 * Sitemap Parser - Extracts URLs from sitemap.xml
 * Production-grade implementation for RAG chatbot knowledge base crawling
 */

const FETCH_TIMEOUT_MS = 10000;

interface SitemapUrl {
    loc: string;
    lastmod?: string;
    priority?: number;
    changefreq?: string;
}

interface SitemapResult {
    urls: SitemapUrl[];
    source: 'sitemap' | 'sitemap-index' | 'none';
    error?: string;
}

/**
 * Fetches and parses sitemap.xml from a website
 * Handles both simple sitemaps and sitemap indexes
 */
export async function fetchSitemap(baseUrl: string): Promise<SitemapResult> {
    const normalizedBase = baseUrl.replace(/\/$/, '');
    const sitemapUrl = `${normalizedBase}/sitemap.xml`;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const res = await fetch(sitemapUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'BiTBTrialCrawler/1.0 (+https://bitb.ltd)',
                'Accept': 'application/xml, text/xml, */*',
            },
        });

        clearTimeout(timer);

        if (!res.ok) {
            return { urls: [], source: 'none', error: `HTTP ${res.status}` };
        }

        const xml = await res.text();

        // Check if it's a sitemap index (contains <sitemapindex>)
        if (xml.includes('<sitemapindex')) {
            return parseSitemapIndex(xml, normalizedBase);
        }

        // Regular sitemap
        return { urls: parseSitemapXml(xml), source: 'sitemap' };
    } catch (err: any) {
        return {
            urls: [],
            source: 'none',
            error: err.name === 'AbortError' ? 'Timeout' : err.message
        };
    }
}

/**
 * Parses a sitemap index and fetches all referenced sitemaps
 */
async function parseSitemapIndex(xml: string, baseUrl: string): Promise<SitemapResult> {
    const sitemapUrls: string[] = [];

    // Extract sitemap URLs from index
    const sitemapRegex = /<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi;
    let match;
    while ((match = sitemapRegex.exec(xml)) !== null) {
        sitemapUrls.push(match[1].trim());
    }

    // Fetch each sitemap (limit to first 5 to avoid timeout)
    const allUrls: SitemapUrl[] = [];
    const sitemapsToFetch = sitemapUrls.slice(0, 5);

    await Promise.all(
        sitemapsToFetch.map(async (url) => {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

                const res = await fetch(url, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'BiTBTrialCrawler/1.0 (+https://bitb.ltd)',
                    },
                });

                clearTimeout(timer);

                if (res.ok) {
                    const subXml = await res.text();
                    allUrls.push(...parseSitemapXml(subXml));
                }
            } catch {
                // Skip failed sitemaps
            }
        })
    );

    return { urls: allUrls, source: 'sitemap-index' };
}

/**
 * Parses URL entries from sitemap XML
 */
function parseSitemapXml(xml: string): SitemapUrl[] {
    const urls: SitemapUrl[] = [];

    // Extract URL entries
    const urlRegex = /<url>[\s\S]*?<\/url>/gi;
    const entries = xml.match(urlRegex) || [];

    for (const entry of entries) {
        const loc = extractTag(entry, 'loc');
        if (!loc) continue;

        urls.push({
            loc: loc.trim(),
            lastmod: extractTag(entry, 'lastmod') || undefined,
            priority: parseFloat(extractTag(entry, 'priority') || '0.5'),
            changefreq: extractTag(entry, 'changefreq') || undefined,
        });
    }

    return urls;
}

/**
 * Extracts content between XML tags
 */
function extractTag(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : null;
}

/**
 * Filters sitemap URLs to prioritize important pages
 */
export function prioritizeUrls(urls: SitemapUrl[], maxUrls: number = 50): SitemapUrl[] {
    // Priority patterns (higher = more important)
    const priorityPatterns: { pattern: RegExp; weight: number }[] = [
        { pattern: /\/(product|item|shop|store)[s]?(\/|$)/i, weight: 10 },
        { pattern: /\/(pricing|plans|packages)[s]?(\/|$)/i, weight: 9 },
        { pattern: /\/(faq|help|support|faqs)[s]?(\/|$)/i, weight: 8 },
        { pattern: /\/(about|company|team)[s]?(\/|$)/i, weight: 7 },
        { pattern: /\/(contact|locations)[s]?(\/|$)/i, weight: 7 },
        { pattern: /\/(services|solutions|features)[s]?(\/|$)/i, weight: 6 },
        { pattern: /\/(blog|news|article)[s]?(\/|$)/i, weight: 2 },
        { pattern: /\/(privacy|terms|legal)[s]?(\/|$)/i, weight: 1 },
    ];

    // Score each URL
    const scored = urls.map(url => {
        let weight = 5; // Default weight
        for (const { pattern, weight: w } of priorityPatterns) {
            if (pattern.test(url.loc)) {
                weight = Math.max(weight, w);
                break;
            }
        }
        // Boost by sitemap priority if available
        weight += (url.priority || 0.5) * 2;

        return { url, weight };
    });

    // Sort by weight (descending) and take top N
    scored.sort((a, b) => b.weight - a.weight);

    return scored.slice(0, maxUrls).map(s => s.url);
}

/**
 * Parses robots.txt to get disallowed paths
 */
export async function fetchRobotsTxt(baseUrl: string): Promise<string[]> {
    const normalizedBase = baseUrl.replace(/\/$/, '');
    const robotsUrl = `${normalizedBase}/robots.txt`;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(robotsUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'BiTBTrialCrawler/1.0 (+https://bitb.ltd)',
            },
        });

        clearTimeout(timer);

        if (!res.ok) return [];

        const text = await res.text();
        const disallowed: string[] = [];

        // Parse Disallow rules for all user agents
        const lines = text.split('\n');
        for (const line of lines) {
            const match = line.match(/^Disallow:\s*(.+)/i);
            if (match) {
                const path = match[1].trim();
                if (path && path !== '/') {
                    disallowed.push(path);
                }
            }
        }

        return disallowed;
    } catch {
        return [];
    }
}

/**
 * Checks if a URL is allowed by robots.txt rules
 */
export function isAllowedByRobots(url: string, disallowedPaths: string[]): boolean {
    const urlPath = new URL(url).pathname;

    for (const disallowed of disallowedPaths) {
        if (urlPath.startsWith(disallowed)) {
            return false;
        }
    }

    return true;
}
