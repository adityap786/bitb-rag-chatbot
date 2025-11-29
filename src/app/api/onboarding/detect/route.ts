import { NextResponse } from 'next/server';

type Candidate = { name: string; confidence: number; evidence: string[] };

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'bitb-onboard-bot/1.0 (+https://bitb.ltd)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return await res.text();
  } catch (err) {
    clearTimeout(timeout);
    throw new Error('Fetch timeout or error');
  }
}

function detectFromHtml(html: string): Candidate[] {
  const candidates: Candidate[] = [];
  const lower = html.toLowerCase();

  if (lower.includes('wp-content') || lower.includes('wp-json') || lower.includes('wordpress')) {
    candidates.push({ name: 'WordPress', confidence: 0.95, evidence: ['wp-content or wp-json found'] });
  }
  if (lower.includes('cdn.shopify.com') || lower.includes('shopify')) {
    candidates.push({ name: 'Shopify', confidence: 0.9, evidence: ['cdn.shopify.com or shopify found'] });
  }
  if (lower.includes('static.parastorage.com') || lower.includes('wix.com') || lower.includes('wix')) {
    candidates.push({ name: 'Wix', confidence: 0.9, evidence: ['wix scripts or static.parastorage.com'] });
  }
  if (html.includes('__NEXT_DATA__') || lower.includes('nextjs') || lower.includes('next.data')) {
    candidates.push({ name: 'Next.js', confidence: 0.9, evidence: ['__NEXT_DATA__ found'] });
  }
  if (lower.includes('__nuxt') || lower.includes('nuxt')) {
    candidates.push({ name: 'Nuxt', confidence: 0.9, evidence: ['__NUXT__ or nuxt found'] });
  }
  if (lower.includes('framer') || lower.includes('data-framer')) {
    candidates.push({ name: 'Framer', confidence: 0.85, evidence: ['framer assets or data-framer'] });
  }
  if (lower.includes('svelte') || lower.includes('sveltekit')) {
    candidates.push({ name: 'Svelte', confidence: 0.8, evidence: ['svelte markers found'] });
  }
  if (lower.includes('reactroot') || lower.includes('data-reactroot') || lower.includes('react')) {
    candidates.push({ name: 'React (generic)', confidence: 0.6, evidence: ['react markers'] });
  }

  // Deduplicate by name keeping highest confidence
  const byName = new Map<string, Candidate>();
  for (const c of candidates) {
    const prev = byName.get(c.name);
    if (!prev || c.confidence > prev.confidence) byName.set(c.name, c);
  }

  return Array.from(byName.values()).sort((a, b) => b.confidence - a.confidence);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url = body?.url;
    if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 });

    // Normalize URL
    let target = url;
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

    const html = await fetchHtml(target);
    const candidates = detectFromHtml(html);
    return NextResponse.json({ candidates });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
