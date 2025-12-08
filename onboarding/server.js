const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 4000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function fetchHtml(url) {
  // Use global fetch when available (Node 18+), fall back to http/https
  if (typeof fetch !== 'undefined') {
    const resp = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Platform-Detector/1.0' } });
    return await resp.text();
  }

  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'Platform-Detector/1.0' } }, (res) => {
      // follow one redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

function detectFramework(html) {
  const normalized = (html || '').toLowerCase();
  const has = (s) => normalized.indexOf(s) !== -1;
  const candidates = [];

  if (has('wp-content') || has('wp-includes') || has('wordpress') || has('wp-json')) {
    candidates.push({ name: 'WordPress', evidence: 'wp-content / wp-json found', confidence: 0.95 });
  }
  if (has('cdn.shopify.com') || has('x-shopify') || has('myshopify.com')) {
    candidates.push({ name: 'Shopify', evidence: 'cdn.shopify.com / myshopify markers', confidence: 0.95 });
  }
  if (has('__next_data__') || has('id="__next_data__"') || has('__next')) {
    candidates.push({ name: 'Next.js', evidence: '__NEXT_DATA__ script found', confidence: 0.9 });
  }
  if (has('window.__nuxt') || has('data-nuxt') || has('nuxt')) {
    candidates.push({ name: 'Nuxt.js', evidence: '__NUXT__ / data-nuxt found', confidence: 0.9 });
  }
  if (has('static.parastorage.com') || has('wixstatic') || has('wix.com')) {
    candidates.push({ name: 'Wix', evidence: 'Wix static domains or wix markers', confidence: 0.9 });
  }
  if (has('data-framer') || has('framer') || has('framer-motion')) {
    candidates.push({ name: 'Framer', evidence: 'Framer assets / attributes found', confidence: 0.85 });
  }
  if (has('sveltekit') || has('svelte')) {
    candidates.push({ name: 'Svelte/SvelteKit', evidence: 'Svelte markers present', confidence: 0.8 });
  }
  // Generic SPA/React detection
  if (has('data-reactroot') || has('react') || has('react-dom')) {
    candidates.push({ name: 'React (CSR)', evidence: 'React markers', confidence: 0.65 });
  }

  if (candidates.length === 0) {
    candidates.push({ name: 'Unknown/Static', evidence: 'no clear framework markers', confidence: 0.35 });
  }

  // sort
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

app.post('/api/detect-platform', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'missing url' });

    let fetchUrl = url;
    if (!/^https?:\/\//i.test(fetchUrl)) fetchUrl = 'https://' + fetchUrl;

    const html = await fetchHtml(fetchUrl);
    const candidates = detectFramework(html);
    res.json({ url: fetchUrl, candidates });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/frameworks', (req, res) => {
  res.json({ frameworks: ['WordPress', 'Shopify', 'Next.js', 'Nuxt.js', 'Wix', 'Framer', 'Svelte/SvelteKit', 'React (CSR)', 'Unknown/Static'] });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Onboarding service listening on http://localhost:${PORT}`);
});
