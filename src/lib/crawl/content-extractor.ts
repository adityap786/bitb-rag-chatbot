/**
 * Content Extractor - Extracts structured data from HTML pages
 * Supports: products, FAQs, pricing, contact info, Schema.org, JSON-LD
 */

export interface ExtractedProduct {
    name: string;
    price?: string;
    description?: string;
    imageUrl?: string;
    url?: string;
}

export interface ExtractedFaq {
    question: string;
    answer: string;
}

export interface ExtractedContact {
    email?: string;
    phone?: string;
    address?: string;
}

export interface ExtractedHeading {
    level: 1 | 2 | 3 | 4;
    text: string;
}

export interface ExtractedPage {
    url: string;
    title: string;
    metaDescription: string;
    headings: ExtractedHeading[];
    products: ExtractedProduct[];
    faqs: ExtractedFaq[];
    contact: ExtractedContact;
    mainContent: string;
    structuredDataRaw?: any[];
}

const MAX_CONTENT_LENGTH = 150_000;

/**
 * Main extraction function - extracts all structured content from HTML
 */
export function extractPageContent(html: string, url: string): ExtractedPage {
    const result: ExtractedPage = {
        url,
        title: extractTitle(html),
        metaDescription: extractMetaDescription(html),
        headings: extractHeadings(html),
        products: [],
        faqs: [],
        contact: {},
        mainContent: '',
    };

    // Extract JSON-LD structured data first (most reliable)
    const jsonLd = extractJsonLd(html);
    result.structuredDataRaw = jsonLd;

    // Process JSON-LD for products and FAQs
    for (const data of jsonLd) {
        if (data['@type'] === 'Product' || data['@type']?.includes('Product')) {
            result.products.push({
                name: data.name || '',
                price: data.offers?.price || data.offers?.[0]?.price || '',
                description: data.description || '',
                imageUrl: typeof data.image === 'string' ? data.image : data.image?.[0] || '',
                url: data.url || url,
            });
        }

        if (data['@type'] === 'FAQPage' || data['@type']?.includes('FAQPage')) {
            const mainEntity = data.mainEntity || [];
            for (const item of mainEntity) {
                if (item['@type'] === 'Question') {
                    result.faqs.push({
                        question: item.name || '',
                        answer: item.acceptedAnswer?.text || '',
                    });
                }
            }
        }

        if (data['@type'] === 'Organization' || data['@type'] === 'LocalBusiness') {
            result.contact.email = data.email || result.contact.email;
            result.contact.phone = data.telephone || result.contact.phone;
            result.contact.address = formatAddress(data.address) || result.contact.address;
        }
    }

    // Fallback: Extract products from HTML patterns if none found
    if (result.products.length === 0) {
        result.products = extractProductsFromHtml(html);
    }

    // Fallback: Extract FAQs from HTML patterns if none found
    if (result.faqs.length === 0) {
        result.faqs = extractFaqsFromHtml(html);
    }

    // Extract contact info if not found in JSON-LD
    if (!result.contact.email && !result.contact.phone) {
        result.contact = extractContactFromHtml(html);
    }

    // Extract main content (cleaned text)
    result.mainContent = extractMainContent(html);

    return result;
}

/**
 * Extracts page title
 */
function extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? decodeHtmlEntities(match[1].trim()) : '';
}

/**
 * Extracts meta description
 */
function extractMetaDescription(html: string): string {
    const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    return match ? decodeHtmlEntities(match[1].trim()) : '';
}

/**
 * Extracts headings with hierarchy
 */
function extractHeadings(html: string): ExtractedHeading[] {
    const headings: ExtractedHeading[] = [];
    const regex = /<h([1-4])[^>]*>([^<]+)<\/h\1>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
        const level = parseInt(match[1], 10) as 1 | 2 | 3 | 4;
        const text = decodeHtmlEntities(stripTags(match[2]).trim());
        if (text && text.length > 2 && text.length < 200) {
            headings.push({ level, text });
        }
    }

    return headings.slice(0, 50); // Limit to avoid huge arrays
}

/**
 * Extracts JSON-LD structured data
 */
function extractJsonLd(html: string): any[] {
    const results: any[] = [];
    const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            if (Array.isArray(data)) {
                results.push(...data);
            } else if (data['@graph']) {
                results.push(...data['@graph']);
            } else {
                results.push(data);
            }
        } catch {
            // Skip invalid JSON
        }
    }

    return results;
}

/**
 * Extracts products from common HTML patterns
 */
function extractProductsFromHtml(html: string): ExtractedProduct[] {
    const products: ExtractedProduct[] = [];

    // Pattern 1: Products with itemtype="http://schema.org/Product"
    const schemaRegex = /<[^>]+itemtype=["'][^"']*Product[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
    let match;

    while ((match = schemaRegex.exec(html)) !== null && products.length < 20) {
        const block = match[1];
        const name = extractItemprop(block, 'name');
        const price = extractItemprop(block, 'price');
        const description = extractItemprop(block, 'description');

        if (name) {
            products.push({ name, price, description });
        }
    }

    // Pattern 2: Common product card CSS classes
    const cardPatterns = [
        /class=["'][^"']*product[_-]?card[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi,
        /class=["'][^"']*product[_-]?item[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi,
    ];

    for (const pattern of cardPatterns) {
        while ((match = pattern.exec(html)) !== null && products.length < 20) {
            const block = match[1];

            // Try to extract product name from h2, h3, or .product-name
            const nameMatch = block.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i)
                || block.match(/class=["'][^"']*product[_-]?name[^"']*["'][^>]*>([^<]+)</i);

            // Try to extract price
            const priceMatch = block.match(/class=["'][^"']*price[^"']*["'][^>]*>[^<]*([0-9.,]+)/i)
                || block.match(/\$\s*([0-9.,]+)/);

            if (nameMatch) {
                products.push({
                    name: decodeHtmlEntities(nameMatch[1].trim()),
                    price: priceMatch ? priceMatch[1] : undefined,
                });
            }
        }
    }

    return products;
}

/**
 * Extracts itemprop value from schema.org microdata
 */
function extractItemprop(html: string, prop: string): string | undefined {
    const regex = new RegExp(`itemprop=["']${prop}["'][^>]*>([^<]+)`, 'i');
    const match = html.match(regex);
    return match ? decodeHtmlEntities(match[1].trim()) : undefined;
}

/**
 * Extracts FAQs from common HTML patterns
 */
function extractFaqsFromHtml(html: string): ExtractedFaq[] {
    const faqs: ExtractedFaq[] = [];

    // Pattern 1: <details><summary> pattern
    const detailsRegex = /<details[^>]*>[\s\S]*?<summary[^>]*>([^<]+)<\/summary>([\s\S]*?)<\/details>/gi;
    let match;

    while ((match = detailsRegex.exec(html)) !== null && faqs.length < 30) {
        const question = decodeHtmlEntities(stripTags(match[1]).trim());
        const answer = decodeHtmlEntities(stripTags(match[2]).trim());
        if (question && answer && question.length > 10 && answer.length > 10) {
            faqs.push({ question, answer });
        }
    }

    // Pattern 2: FAQ sections with Q/A class patterns
    const faqSectionRegex = /class=["'][^"']*faq[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
    while ((match = faqSectionRegex.exec(html)) !== null && faqs.length < 30) {
        const block = match[1];

        // Try to find Q&A pairs
        const qaRegex = /<h[3-5][^>]*>([^<]+)<\/h[3-5]>[\s\S]*?<p[^>]*>([^<]+)<\/p>/gi;
        let qaMatch;
        while ((qaMatch = qaRegex.exec(block)) !== null && faqs.length < 30) {
            const question = decodeHtmlEntities(qaMatch[1].trim());
            const answer = decodeHtmlEntities(qaMatch[2].trim());
            if (question && answer && question.includes('?')) {
                faqs.push({ question, answer });
            }
        }
    }

    return faqs;
}

/**
 * Extracts contact information from HTML
 */
function extractContactFromHtml(html: string): ExtractedContact {
    const contact: ExtractedContact = {};

    // Email pattern
    const emailMatch = html.match(/href=["']mailto:([^"'?]+)/i)
        || html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
        contact.email = emailMatch[1] || emailMatch[0];
    }

    // Phone pattern
    const phoneMatch = html.match(/href=["']tel:([^"']+)/i)
        || html.match(/(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/);
    if (phoneMatch) {
        contact.phone = phoneMatch[1] || phoneMatch[0];
    }

    return contact;
}

/**
 * Extracts and cleans main content from HTML
 */
function extractMainContent(html: string): string {
    // Remove script, style, nav, header, footer tags
    let content = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<header[\s\S]*?<\/header>/gi, ' ')
        .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');

    // Strip remaining tags
    content = stripTags(content);

    // Decode entities and clean whitespace
    content = decodeHtmlEntities(content)
        .replace(/\s+/g, ' ')
        .trim();

    return content.length > MAX_CONTENT_LENGTH
        ? content.slice(0, MAX_CONTENT_LENGTH)
        : content;
}

/**
 * Helper: strips HTML tags
 */
function stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, ' ');
}

/**
 * Helper: decodes HTML entities
 */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, '/');
}

/**
 * Helper: formats address from JSON-LD
 */
function formatAddress(address: any): string | undefined {
    if (!address) return undefined;
    if (typeof address === 'string') return address;

    const parts = [
        address.streetAddress,
        address.addressLocality,
        address.addressRegion,
        address.postalCode,
        address.addressCountry,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Converts extracted page to rich text for knowledge base
 */
export function formatExtractedPageAsText(page: ExtractedPage): string {
    const sections: string[] = [];

    // Title and meta
    sections.push(`# ${page.title || 'Untitled Page'}`);
    sections.push(`URL: ${page.url}`);
    if (page.metaDescription) {
        sections.push(`\n${page.metaDescription}`);
    }

    // Products
    if (page.products.length > 0) {
        sections.push('\n## Products');
        for (const product of page.products) {
            sections.push(`\n### ${product.name}`);
            if (product.price) sections.push(`Price: ${product.price}`);
            if (product.description) sections.push(product.description);
        }
    }

    // FAQs
    if (page.faqs.length > 0) {
        sections.push('\n## Frequently Asked Questions');
        for (const faq of page.faqs) {
            sections.push(`\nQ: ${faq.question}`);
            sections.push(`A: ${faq.answer}`);
        }
    }

    // Contact
    if (page.contact.email || page.contact.phone || page.contact.address) {
        sections.push('\n## Contact Information');
        if (page.contact.email) sections.push(`Email: ${page.contact.email}`);
        if (page.contact.phone) sections.push(`Phone: ${page.contact.phone}`);
        if (page.contact.address) sections.push(`Address: ${page.contact.address}`);
    }

    // Main content (summarized)
    if (page.mainContent && page.mainContent.length > 100) {
        sections.push('\n## Page Content');
        // Limit main content to avoid overwhelming
        const content = page.mainContent.length > 5000
            ? page.mainContent.slice(0, 5000) + '...'
            : page.mainContent;
        sections.push(content);
    }

    return sections.join('\n');
}
