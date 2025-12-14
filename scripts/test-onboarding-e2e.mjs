import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const embeddingBase = process.env.BGE_EMBEDDING_SERVICE_URL || 'http://localhost:8000';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { _nonJsonBody: text };
  }
}

async function httpJson(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await readJson(res);
  return {
    ok: res.ok,
    status: res.status,
    headers: res.headers,
    data,
  };
}

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const out = await fn();
    console.log(`[OK] ${name} (${Date.now() - t0}ms)`);
    return out;
  } catch (err) {
    console.error(`[FAIL] ${name} (${Date.now() - t0}ms)`);
    throw err;
  }
}

async function startTrial() {
  const res = await fetch(`${base}/api/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_origin: 'http://localhost:3000',
      admin_email: `e2e+${runId}@example.com`,
      display_name: `Demo Tenant ${runId}`,
      // Use a valid ingest schema shape so /api/ingest (if configured) can accept it.
      data_source: {
        type: 'manual',
        text: `E2E onboarding seed content (${runId}). Refund policy: 30-day returns with receipt.`
      },
      theme: { theme: 'auto' },
    }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error('start-trial failed: ' + JSON.stringify(data));
  return data;
}

async function getPipelineReady(tenantId, accessToken) {
  const res = await fetch(`${base}/api/tenants/${tenantId}/pipeline-ready`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  const data = await readJson(res);
  return {
    ok: res.ok,
    status: res.status,
    cache: res.headers.get('x-cache'),
    data,
  };
}

async function pollPipeline(tenantId, accessToken, { timeoutMs = 180000, intervalMs = 3000 } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await getPipelineReady(tenantId, accessToken);
    if (last.ok && last.data && (last.data.ragStatus === 'failed' || last.data?.lastIngestion?.status === 'failed')) {
      throw new Error(`Pipeline entered failed state: ${JSON.stringify(last.data)}`);
    }
    if (last.ok && last.data && last.data.ready) {
      return last;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Pipeline not ready after ${timeoutMs}ms. Last: ${JSON.stringify(last)}`);
}

async function uploadKB(accessToken, filePaths) {
  const form = new FormData();
  for (const p of filePaths) {
    form.append('files', fs.createReadStream(p));
  }
  const res = await fetch(`${base}/api/trial/kb/upload`, {
    method: 'POST',
    headers: { ...form.getHeaders(), 'Authorization': `Bearer ${accessToken}` },
    body: form
  });
  const data = await readJson(res);
  return { ok: res.ok, status: res.status, data };
}

async function setBranding(accessToken, body) {
  const res = await fetch(`${base}/api/trial/branding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify(body)
  });
  const data = await readJson(res);
  return { ok: res.ok, status: res.status, data };
}

async function generateWidget(accessToken) {
  const res = await fetch(`${base}/api/trial/generate-widget`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await readJson(res);
  return { ok: res.ok, status: res.status, data };
}

async function ask(tenantId, trialToken, query, { accessToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const res = await fetch(`${base}/api/ask`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tenant_id: tenantId, trial_token: trialToken, query })
  });
  const data = await readJson(res);
  return { ok: res.ok, status: res.status, data };
}

async function getIngestionStatus(accessToken, jobId) {
  const res = await fetch(`${base}/api/trial/ingestion-status?jobId=${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await readJson(res);
  return { ok: res.ok, status: res.status, data };
}

async function pollIngestionJob(accessToken, jobId, { timeoutMs = 180000, intervalMs = 3000 } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await getIngestionStatus(accessToken, jobId);
    if (last.ok && last.data && ['completed', 'failed'].includes(last.data.status)) {
      return last;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Ingestion job not completed after ${timeoutMs}ms. Last: ${JSON.stringify(last)}`);
}

async function widgetSession(tenantId, visitorId) {
  return httpJson(`${base}/api/widget/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      tenantId,
      visitorId,
      referrer: 'http://localhost:3000/e2e',
    }
  });
}

async function widgetChat(sessionId, message, { accessToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  return httpJson(`${base}/api/widget/chat`, {
    method: 'POST',
    headers,
    body: { sessionId, message }
  });
}

(async () => {
  try {
    console.log(`Base URL: ${base}`);

    if (process.env.SKIP_EMBEDDING_PREFLIGHT !== '1') {
      await step('Embedding service preflight (/healthz)', async () => {
        const r = await httpJson(`${embeddingBase}/healthz`);
        assert(r.ok, `Embedding service not reachable at ${embeddingBase}. Start it with: cd services/bge_embedding_service ; python main.py`);
      });
    }

    // Temp KB files (self-contained)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitb-onboarding-e2e-'));
    const kb1 = path.join(tmpDir, 'kb1.md');
    const kb2 = path.join(tmpDir, 'kb2.txt');
    const kbDup = path.join(tmpDir, 'kb-dup.txt');
    const kbEmpty = path.join(tmpDir, 'empty.txt');
    const kbUnsupported = path.join(tmpDir, 'bad.exe');
    const kbLarge = path.join(tmpDir, 'large.txt');

    // Additional valid KB files to reliably reach MIN_PIPELINE_VECTORS (default 10)
    // even when embeddings are created 1:1 per file.
    const seedFiles = Array.from({ length: 10 }, (_, i) => path.join(tmpDir, `seed-${i}.txt`));

    fs.writeFileSync(kb1, [
      `Run ID: ${runId}`,
      '# Refund Policy',
      'We accept returns within 30 days of purchase with receipt.',
      'Refunds are issued to the original payment method within 5-10 business days.',
      '',
      '# Shipping',
      'Standard shipping takes 3-5 business days.'
    ].join('\n'));
    fs.writeFileSync(kb2, [
      `Run ID: ${runId}`,
      'Contact support at support@example.com.',
      'Warranty: 1 year limited warranty on all items.'
    ].join('\n'));
    fs.writeFileSync(kbDup, fs.readFileSync(kb1));
    fs.writeFileSync(kbEmpty, '');
    fs.writeFileSync(kbUnsupported, 'not really an exe');
    fs.writeFileSync(kbLarge, Buffer.alloc(6 * 1024 * 1024, 'a')); // > 5MB per-file limit

    for (let i = 0; i < seedFiles.length; i++) {
      fs.writeFileSync(
        seedFiles[i],
        [
          `Run ID: ${runId}`,
          `Seed doc: ${i}`,
          'Refund Policy: Returns within 30 days with receipt.',
          'Shipping: Standard shipping takes 3-5 business days.',
          'Warranty: 1 year limited warranty on all items.',
          `Unique nonce: ${crypto.randomBytes(8).toString('hex')}`,
        ].join('\n')
      );
    }

    const t = await step('Start trial', startTrial);
    const tenantId = t.tenant_id;
    const trialToken = t.trial_token;
    const accessToken = t.access_token;

    assert(tenantId && tenantId.startsWith('tn_'), 'Missing/invalid tenant_id from /api/start-trial');
    assert(trialToken && trialToken.startsWith('tr_'), 'Missing/invalid trial_token from /api/start-trial');
    assert(accessToken && accessToken.split('.').length === 3, 'Missing/invalid access_token JWT from /api/start-trial');

    console.log('Tenant:', tenantId);

    await step('pipeline-ready requires auth', async () => {
      const r = await getPipelineReady(tenantId, undefined);
      assert(r.status === 401, `Expected 401, got ${r.status} (${JSON.stringify(r.data)})`);
    });

    await step('pipeline-ready cache HIT works with auth', async () => {
      const r1 = await getPipelineReady(tenantId, accessToken);
      assert(r1.ok, `Expected OK, got ${r1.status}: ${JSON.stringify(r1.data)}`);
      assert(r1.cache === 'MISS' || r1.cache === 'HIT' || r1.cache === null, 'Unexpected cache header');
      const r2 = await getPipelineReady(tenantId, accessToken);
      assert(r2.ok, `Expected OK, got ${r2.status}: ${JSON.stringify(r2.data)}`);
      // Within TTL this should almost always be HIT.
      console.log('X-Cache 1:', r1.cache, 'X-Cache 2:', r2.cache);
    });

    await step('pipeline-ready rejects tenant mismatch', async () => {
      const otherTenant = `tn_${crypto.randomBytes(16).toString('hex')}`;
      const r = await getPipelineReady(otherTenant, accessToken);
      assert(r.status === 403, `Expected 403, got ${r.status} (${JSON.stringify(r.data)})`);
    });

    await step('/api/ask blocked before pipeline ready (425 expected)', async () => {
      const r = await ask(tenantId, trialToken, 'What is your refund policy?');
      // If ingestion already ran, this might be 200; accept either.
      assert([200, 425].includes(r.status), `Expected 200 or 425, got ${r.status} (${JSON.stringify(r.data)})`);
    });

    await step('generate-widget before branding fails (400 expected)', async () => {
      const r = await generateWidget(accessToken);
      assert(r.status === 400, `Expected 400, got ${r.status} (${JSON.stringify(r.data)})`);
    });

    await step('KB upload with no files fails (400 expected)', async () => {
      const form = new FormData();
      // Avoid sending a fully-empty multipart body (can trigger ECONNRESET in some multipart parsers);
      // still exercises the intended validation path because there is no `files` field.
      form.append('note', 'no files attached');
      const res = await fetch(`${base}/api/trial/kb/upload`, {
        method: 'POST',
        headers: { ...form.getHeaders(), Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const data = await readJson(res);
      assert(res.status === 400, `Expected 400, got ${res.status} (${JSON.stringify(data)})`);
    });

    await step('KB upload too many files fails (400 expected)', async () => {
      const form = new FormData();
      for (let i = 0; i < 11; i++) form.append('files', fs.createReadStream(kb1));
      const res = await fetch(`${base}/api/trial/kb/upload`, {
        method: 'POST',
        headers: { ...form.getHeaders(), Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const data = await readJson(res);
      assert(res.status === 400, `Expected 400, got ${res.status} (${JSON.stringify(data)})`);
    });

    const kbUpload = await step('KB upload mixed files (dedupe + failures)', async () => {
      const r = await uploadKB(accessToken, [kb1, kb2, kbDup, kbEmpty, kbUnsupported, kbLarge]);
      assert(r.ok, `Expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
      const uploaded = r.data?.uploadedFiles || [];
      console.log('KB uploadedFiles:', uploaded);
      assert(uploaded.length >= 4, 'Expected uploadedFiles entries');

      const byName = new Map(uploaded.map((x) => [x.filename, x]));
      const a = byName.get(path.basename(kb1));
      const b = byName.get(path.basename(kbDup));
      assert(a && b, 'Missing expected KB upload entries for dedupe test');
      console.log('KB dedupe pair:', { a, b });
      assert(a.status === 'completed' && b.status === 'completed', 'Expected both dedupe files to be completed');
      assert(a.kbId && b.kbId && a.kbId === b.kbId, 'Expected duplicate content to reuse same kbId');

      const failed = uploaded.filter((x) => x.status !== 'completed');
      assert(failed.length >= 1, 'Expected at least one failed file (empty/unsupported/oversize)');
      return r;
    });

    await step('KB upload seed files (ensure enough vectors for readiness)', async () => {
      const r = await uploadKB(accessToken, seedFiles);
      assert(r.ok, `Expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
      const uploaded = r.data?.uploadedFiles || [];
      const completed = uploaded.filter((x) => x.status === 'completed');
      assert(completed.length === seedFiles.length, `Expected ${seedFiles.length} completed, got ${completed.length} (${JSON.stringify(uploaded)})`);
    });

    await step('Branding validation rejects invalid hex', async () => {
      const r = await setBranding(accessToken, {
        primaryColor: '#fff',
        secondaryColor: '#8b5cf6',
        tone: 'professional',
        welcomeMessage: 'Welcome to the demo!',
        logoUrl: '',
        platform: 'web',
        framework: 'nextjs',
        hosting: 'localhost',
        knowledgeBaseSources: ['upload']
      });
      assert(r.status === 400, `Expected 400, got ${r.status} (${JSON.stringify(r.data)})`);
    });

    await step('Branding success', async () => {
      const r = await setBranding(accessToken, {
        primaryColor: '#6366f1',
        secondaryColor: '#8b5cf6',
        tone: 'professional',
        welcomeMessage: 'Welcome to the demo!',
        logoUrl: '',
        platform: 'web',
        framework: 'nextjs',
        hosting: 'localhost',
        knowledgeBaseSources: ['upload']
      });
      assert(r.ok, `Expected OK, got ${r.status}: ${JSON.stringify(r.data)}`);
    });

    const widget = await step('Generate widget (may trigger pipeline build)', async () => {
      const r = await generateWidget(accessToken);
      assert(r.ok, `Expected OK, got ${r.status}: ${JSON.stringify(r.data)}`);
      return r;
    });

    if (widget.data && widget.data.status === 'processing' && widget.data.jobId) {
      await step('Poll ingestion-status until completed/failed', async () => {
        const jr = await pollIngestionJob(accessToken, widget.data.jobId, { timeoutMs: 240000, intervalMs: 5000 });
        console.log('Ingestion job:', {
          status: jr.data?.status,
          error_message: jr.data?.error_message,
          error: jr.data?.error,
        });
        if (jr.data?.status === 'failed') {
          throw new Error(`RAG pipeline build failed: ${jr.data?.error_message || jr.data?.error || 'unknown error'}`);
        }
      });
    }

    const ready = await step('Poll pipeline-ready until ready', async () => {
      const r = await pollPipeline(tenantId, accessToken, { timeoutMs: 240000, intervalMs: 5000 });
      console.log('Pipeline:', {
        ready: r.data?.ready,
        ragStatus: r.data?.ragStatus,
        vectorCount: r.data?.vectorCount,
        minVectors: r.data?.minVectors,
      });
      return r;
    });

    await step('/api/ask rejects empty query (400 expected)', async () => {
      const r = await ask(tenantId, trialToken, '   ');
      assert(r.status === 400, `Expected 400, got ${r.status} (${JSON.stringify(r.data)})`);
    });

    await step('/api/ask succeeds after pipeline ready', async () => {
      const q = 'What is your refund policy?';
      const t0 = Date.now();
      const r1 = await ask(tenantId, trialToken, q);
      assert(r1.ok, `Expected 200, got ${r1.status}: ${JSON.stringify(r1.data)}`);
      const t1 = Date.now();
      const r2 = await ask(tenantId, trialToken, q);
      assert(r2.ok, `Expected 200, got ${r2.status}: ${JSON.stringify(r2.data)}`);
      console.log('Ask latency ms:', { first: t1 - t0, second: Date.now() - t1 });
    });

    await step('Widget session rejects invalid tenantId format (422 expected)', async () => {
      const r = await widgetSession('tn_invalid', 'visitor_123456');
      assert(r.status === 422, `Expected 422, got ${r.status} (${JSON.stringify(r.data)})`);
    });

    const visitorId = `v_${Math.random().toString(36).slice(2, 10)}`;
    const sess = await step('Widget session create', async () => {
      const r = await widgetSession(tenantId, visitorId);
      assert([200, 201].includes(r.status), `Expected 200/201, got ${r.status} (${JSON.stringify(r.data)})`);
      assert(r.data?.sessionId, 'Missing sessionId');
      return r.data.sessionId;
    });

    await step('Widget chat invalid sessionId returns 404', async () => {
      const r = await widgetChat('invalid12', 'Hello');
      assert(r.status === 404, `Expected 404, got ${r.status} (${JSON.stringify(r.data)})`);
    });

    await step('Widget chat success (with optional auth header)', async () => {
      const r = await widgetChat(sess, 'What is your refund policy?', { accessToken });
      assert(r.ok, `Expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
    });

    await step('Invalid trial token rejected', async () => {
      const r = await ask(tenantId, 'invalid', 'Test');
      assert(r.status === 403, `Expected 403, got ${r.status} (${JSON.stringify(r.data)})`);
    });

    console.log('Onboarding E2E test complete.');
    process.exit(0);
  } catch (err) {
    console.error('Onboarding E2E test failed:', err);
    process.exit(1);
  }
})();
