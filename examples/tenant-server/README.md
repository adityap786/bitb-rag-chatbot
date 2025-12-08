# examples/tenant-server

A minimal Node/Express example showing the recommended tenant-server pattern for secure token minting and server-side injection of the `bitb-widget` loader.

This example demonstrates:
- Server-to-server call to `https://api.bitb.example.com/api/mint-token` using a tenant API key (kept server-side).
- Server-side injection of a short-lived token into the loader script via `data-token` (avoids inline scripts and CSP issues).
- Tenant-hosted fallback endpoint `/.well-known/bitb-token` for client-side token fetch (with simple origin validation).

## Quick start
1. Copy `.env.example` to `.env` and fill the values:
```
BITB_API_URL=https://api.bitb.example.com
BITB_TENANT_API_KEY=replace_with_tenant_api_key
TENANT_ID=tenant_demo
TENANT_ALLOWED_ORIGINS=http://localhost:3000
PORT=3000
```

2. Install dependencies and start the server:
```powershell
npm ci
npm start
```

3. Visit `http://localhost:3000` to see the demo page. The server will request a short-lived token from `BITB_API_URL` and inject it into the `data-token` attribute of the loader script.

## Notes
- This is an example scaffold. In production:
  - Store the tenant API key in a secrets manager.
  - Use HTTPS for the tenant server.
  - Implement proper authentication for `/` if you only want authenticated users to get a token.
  - Implement robust error handling and observability.

## Next steps
- Integrate this pattern into your tenant backend (Next.js, Rails, PHP, etc.).
- Optionally, add a Playwright test that loads the demo page and asserts the loader initialized.

## Running the Playwright E2E test

1. Install dev dependencies (Playwright):
```powershell
npm ci
npx playwright install
```

2. Start the tenant example server in one terminal:
```powershell
npm run dev
```

3. Run the E2E test in another terminal:
```powershell
npm run test:e2e
```

The provided test asserts that the server-rendered demo page includes a `<script data-token>` loader. This verifies the tenant-server injection and does not require contacting external CDNs.
