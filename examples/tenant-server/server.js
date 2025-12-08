import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BITB_API_URL = process.env.BITB_API_URL || 'https://api.bitb.example.com';
const TENANT_API_KEY = process.env.BITB_TENANT_API_KEY || '';
const TENANT_ID = process.env.TENANT_ID || 'tenant_demo';
const ALLOWED_ORIGINS = (process.env.TENANT_ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

async function requestBitbToken(tenantId) {
  const resp = await fetch(`${BITB_API_URL}/api/mint-token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TENANT_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenantId })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`mint-token failed: ${resp.status} ${text}`);
  }

  return resp.json(); // { token, expiresAt }
}

// Server-rendered page that injects the short-lived token into the loader (no inline script)
app.get('/', async (req, res) => {
  try {
    const { token } = await requestBitbToken(TENANT_ID);

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tenant Demo - BITB Widget</title>
  </head>
  <body>
    <h1>Tenant demo page</h1>
    <!-- Loader: versioned CDN URL + data-token avoids inline scripts -->
    <script src="https://cdn.bitb.example.com/v1/bitb-widget.js" data-tenant-id="${TENANT_ID}" data-token="${token}" async></script>
  </body>
</html>`;

    // Set a recommended CSP for this example. Tenants should adapt this to their needs.
    res.setHeader('Content-Security-Policy', `default-src 'self' https://cdn.bitb.example.com; script-src 'self' https://cdn.bitb.example.com; connect-src 'self' https://api.bitb.example.com;`);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching token; check server logs.');
  }
});

// Tenant-hosted endpoint for client-side token fetch (widget loader fallback)
app.get('/.well-known/bitb-token', async (req, res) => {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ message: 'Origin not allowed' });
  }

  try {
    const tokenResp = await requestBitbToken(TENANT_ID);

    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.json(tokenResp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to mint token' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Tenant example server listening at http://localhost:${PORT}`);
});
