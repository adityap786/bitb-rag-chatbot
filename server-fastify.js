// Admin: get rollout audit history for a tenant/feature
app.get('/api/admin/rollout/history', { preHandler: adminAuthHook }, async (request, reply) => {
  const { tenant_id, feature, limit } = request.query || {};
  if (!tenant_id) return reply.code(400).send({ error: 'Missing tenant_id' });
  try {
    const { RolloutManager } = await import('./src/lib/rollout/manager.js');
    const mgr = new RolloutManager();
    const history = await mgr.getAuditHistory(tenant_id, feature, limit ? parseInt(limit, 10) : 50);
    return reply.send({ tenant_id, feature: feature || null, history });
  } catch (err) {
    request.log.error('Failed to get rollout history', { error: err });
    return reply.code(500).send({ error: 'History failed', details: String(err) });
  }
});

// Admin: rollback rollout state for a tenant/feature to a previous audit entry
app.post('/api/admin/rollout/rollback', { preHandler: adminAuthHook }, async (request, reply) => {
  const { tenant_id, feature, audit_id, actor, reason } = request.body || {};
  if (!tenant_id || !feature || !audit_id) return reply.code(400).send({ error: 'Missing tenant_id, feature, or audit_id' });
  try {
    const { RolloutManager } = await import('./src/lib/rollout/manager.js');
    const mgr = new RolloutManager();
    const history = await mgr.getAuditHistory(tenant_id, feature, 100);
    const entry = history.find(h => h.id && h.id.toString() === audit_id.toString());
    if (!entry) return reply.code(404).send({ error: 'Audit entry not found' });
    // Set rollout state to old_percentage from audit entry
    if (typeof entry.old_percentage !== 'number') return reply.code(400).send({ error: 'No previous percentage to rollback to' });
    await mgr.setRolloutState(tenant_id, feature, entry.old_percentage, actor || 'rollback', reason || `Rollback to audit ${audit_id}`);
    return reply.send({ status: 'ok', tenant_id, feature, rolled_back_to: entry.old_percentage });
  } catch (err) {
    request.log.error('Failed to rollback rollout', { error: err });
    return reply.code(500).send({ error: 'Rollback failed', details: String(err) });
  }
});
// Admin authentication hook for admin endpoints
const adminAuthHook = (req, reply, done) => {
  if (!req.headers['x-admin-secret'] || req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  done();
};

// Hot-reload endpoint for tenant YAML config (POST)
app.route({
  method: 'POST',
  url: '/api/admin/reload-tenant-config',
  preHandler: adminAuthHook,
  handler: async (request, reply) => {
    const { tenant_id } = request.body || {};
    if (!tenant_id) {
      return reply.code(400).send({ error: 'Missing tenant_id' });
    }
    try {
      const { reloadTenantConfig } = await import('./src/lib/config/tenant-config-loader.js');
      reloadTenantConfig(tenant_id);
      return reply.send({ status: 'ok', message: `Config for tenant ${tenant_id} reloaded` });
    } catch (err) {
      request.log.error('Failed to reload tenant config', { error: err });
      return reply.code(500).send({ error: 'Reload failed', details: String(err) });
    }
  }
});

// GET endpoint to view current tenant config
app.route({
  method: 'GET',
  url: '/api/admin/tenant-config/:tenant_id',
  preHandler: adminAuthHook,
  handler: async (request, reply) => {
    const { tenant_id } = request.params || {};
    if (!tenant_id) {
      return reply.code(400).send({ error: 'Missing tenant_id' });
    }
    try {
      const { getTenantConfig } = await import('./src/lib/config/tenant-config-loader.js');
      const config = getTenantConfig(tenant_id);
      return reply.send({ config });
    } catch (err) {
      request.log.error('Failed to get tenant config', { error: err });
      return reply.code(500).send({ error: 'Get config failed', details: String(err) });
    }
  }
});
// Admin: promote rollout for a feature across tenants (staged)
app.post('/api/admin/rollout/promote', { preHandler: adminAuthHook }, async (request, reply) => {
  const body = request.body || {};
  const feature = body.feature;
  const tenantsInput = body.tenants; // 'all' or comma list or array
  const stages = body.stages || body.percent || '10,50,100';
  const wait = parseInt(body.wait || '60', 10);
  const dryRun = !!body.dryRun;

  if (!feature) return reply.code(400).send({ error: 'Missing feature' });

  try {
    const { RolloutManager } = await import('./src/lib/rollout/manager.js');
    const mgr = new RolloutManager({ adminUrl: process.env.ADMIN_URL, adminSecret: process.env.ADMIN_SECRET });

    let tenantList = [];
    if (!tenantsInput || tenantsInput === 'all') {
      tenantList = await mgr.listTenants();
    } else if (Array.isArray(tenantsInput)) {
      tenantList = tenantsInput;
    } else {
      tenantList = String(tenantsInput).split(',').map(s => s.trim()).filter(Boolean);
    }

    const stageValues = Array.isArray(stages) ? stages.map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n)) : String(stages).split(',').map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n));

      // Optional metric gate (Prometheus) config
      let metricGate = body.metric_gate || null;
      if (typeof metricGate === 'string') {
        try { metricGate = JSON.parse(metricGate); } catch (e) { /* ignore - leave as string */ }
      }

      for (const pct of stageValues) {
        await mgr.promoteFeatureAcrossTenants(feature, tenantList, pct, { dryRun });

        // If this is not the last stage, wait and optionally evaluate metric gate
        if (pct !== stageValues[stageValues.length - 1]) {
          await new Promise(r => setTimeout(r, (wait || 60) * 1000));

          if (metricGate && !dryRun) {
            try {
              const gateRes = await mgr.evaluatePrometheusGate(metricGate);
              if (!gateRes.ok) {
                request.log.warn('Metric gate failed, aborting rollout', { feature, stage: pct, gateRes });
                return reply.code(412).send({ status: 'aborted', feature, stage: pct, metricGate: gateRes });
              }
            } catch (err) {
              request.log.error('Metric gate evaluation error, aborting rollout', { error: err });
              return reply.code(500).send({ status: 'aborted', feature, stage: pct, error: String(err) });
            }
          }
        }
      }

      return reply.send({ status: 'ok', feature, stages: stageValues, dryRun });
  } catch (err) {
    request.log.error('Rollout promote failed', { error: err });
    return reply.code(500).send({ error: 'Promote failed', details: String(err) });
  }
});

// Admin: check rollout config for a tenant
app.get('/api/admin/rollout/status/:tenant_id', { preHandler: adminAuthHook }, async (request, reply) => {
  const { tenant_id } = request.params || {};
  if (!tenant_id) return reply.code(400).send({ error: 'Missing tenant_id' });
  try {
    const { RolloutManager } = await import('./src/lib/rollout/manager.js');
    const mgr = new RolloutManager();
    const config = mgr.readTenantConfig(tenant_id);
    return reply.send({ tenant_id, rollout: config.rollout || null });
  } catch (err) {
    request.log.error('Failed to get rollout status', { error: err });
    return reply.code(500).send({ error: 'Status failed', details: String(err) });
  }
});
// Hot-reload endpoint for tenant YAML config
app.post('/api/admin/reload-tenant-config', async (request, reply) => {
  const { tenant_id } = request.body || {};
  if (!tenant_id) {
    return reply.code(400).send({ error: 'Missing tenant_id' });
  }
  try {
    const { reloadTenantConfig } = await import('./src/lib/config/tenant-config-loader.js');
    reloadTenantConfig(tenant_id);
    return reply.send({ status: 'ok', message: `Config for tenant ${tenant_id} reloaded` });
  } catch (err) {
    request.log.error('Failed to reload tenant config', { error: err });
    return reply.code(500).send({ error: 'Reload failed', details: String(err) });
  }
});
/**
 * server-fastify.js
 * BiTB Fastify Backend Server (Mock Implementation)
 * 
 * Features:
 * - High-throughput Fastify v4+ with plugins
 * - JSON Schema route validation (Ajv)
 * - JWT token signing for trials
 * - Rate limiting for /api/ask
 * - In-memory mock data with production migration notes
 * - Modular adapter layer for vector stores & embeddings
 * 
 * Usage:
 *   node server-fastify.js
 * 
 * Production Migration:
 *   Replace in-memory stores with Redis/PostgreSQL
 *   Replace FAISS mock with Pinecone/Weaviate adapter
 *   Add BullMQ for ingestion queue
 */

import fastify from 'fastify';
import path from 'path';
import crypto from 'crypto';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';

import { getTenantConfig } from './src/lib/config/tenant-config-loader.js';

const app = fastify({ logger: true });

// ============================================================================
// PLUGINS REGISTRATION
// ============================================================================

// CORS
app.register(fastifyCors, {
  origin: true, // In production: whitelist specific origins
  credentials: true
});

// JWT
app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'bitb-dev-secret-change-in-production'
});

// Multipart (file upload)
app.register(fastifyMultipart, {
  limits: {
    fieldNameSize: 100,
    fieldSize: 100,
    fields: 10,
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5,
    headerPairs: 2000
  }
});

// Rate limiting
app.register(fastifyRateLimit, {
  global: false,
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    // Use tenant_id or trial_token for per-tenant rate limiting
    if (req.body && req.body.tenant_id) return req.body.tenant_id;
    if (req.body && req.body.trial_token) return req.body.trial_token;
    if (req.query && req.query.tenant_id) return req.query.tenant_id;
    if (req.query && req.query.trial_token) return req.query.trial_token;
    return req.ip;
  }
});

// Static files (if needed)
// app.register(fastifyStatic, {
//   root: path.join(__dirname, 'public'),
//   prefix: '/public/'
// });

// ============================================================================
// IN-MEMORY MOCK DATA STORES
// ============================================================================

// Trials storage (replace with database in production)
const trials = new Map();
// Structure: trial_token -> { site_origin, expires_at, theme, usage, admin_email, display_name, status }

// Ingestion jobs queue (replace with Redis/BullMQ in production)
const ingestJobs = new Map();
// Structure: job_id -> { trial_token, status, data_source, created_at, completed_at, error }

// Vector indexes (replace with Pinecone/Weaviate in production)
const indexes = new Map();
// Structure: trial_token -> { vectors: [], metadata: [], index_path: string }

// Preview mode mock knowledge base
const previewKnowledgeBase = [
  {
    text: "Bits and Bytes Private Limited (BiTB) builds the BiTB retrieval augmented assistant platform for service, commerce, and enterprise teams. The product bundles ingestion, hybrid search, grounded responses, and a customizable widget with voice greeting.",
    url: "https://bitb.ltd/",
    title: "About BiTB"
  },
  {
    text: "BiTB offers a 3-day trial with no credit card required. Trials include 50 crawled pages or five 10 MB uploads, origin locked tokens, full widget configuration, and automatic purge when the window closes.",
    url: "https://bitb.ltd/connect#trial",
    title: "Trial Details"
  },
  {
    text: "BiTB pairs BM25 keyword scoring with sentence-transformer embeddings stored in FAISS, then re-ranks results so every answer cites a precise snippet. This hybrid retrieval keeps responses grounded and auditable.",
    url: "https://bitb.ltd/documentation",
    title: "RAG Technology"
  },
  {
    text: "Pricing highlights three subscriptions: Service Desk at $149 per month with 5k responses, Commerce Assist at $249 with catalog sync and analytics, and Enterprise Command with custom quotes, dedicated infrastructure, and on-call SLAs.",
    url: "https://bitb.ltd/subscription",
    title: "Pricing Plans"
  },
  {
    text: "Installation takes three steps: complete the trial wizard, copy the script tag, and paste it before the closing </body> tag. The BiTB widget appears instantly with your chosen theme and assistant name.",
    url: "https://bitb.ltd/documentation",
    title: "Installation Guide"
  },
  {
    text: "BiTB supports public URL crawls plus PDF, DOCX, TXT, and HTML uploads up to ten megabytes. Content is cleaned, chunked to ~750 tokens, and stored with provenance for citation.",
    url: "https://bitb.ltd/documentation",
    title: "Supported Data Sources"
  },
  {
    text: "BiTB widgets detect language automatically and ship with a warm female Web Speech greeting. Visitors can mute audio, and admins can provide alternate scripts or disable voice entirely.",
    url: "https://bitb.ltd/documentation",
    title: "Multilingual & Voice Support"
  },
  {
    text: "BiTB prioritizes privacy: trial data purges after 72 hours, embeddings stay isolated per tenant, and Enterprise Command adds SSO, SCIM, customer managed keys, and compliance reviews.",
    url: "https://bitb.ltd/subscription",
    title: "Privacy & Data Retention"
  },
  {
    text: "Customize your widget with primary and accent colors, assistant name, avatar, and light/dark/auto themes. All styling applies instantly inside the trial configuration panel.",
    url: "https://bitb.ltd/documentation",
    title: "Customization Options"
  },
  {
    text: "BiTB provides email support during the trial period. Commerce Assist adds live chat, and Enterprise Command includes a dedicated account manager with on-call escalation.",
    url: "https://bitb.ltd/connect",
    title: "Support & Contact"
  },
  {
    text: "Key features include origin locked security, responsive mobile design, keyboard accessibility, session persistence, source citations, confidence scoring, and ARIA-live screen reader support.",
    url: "https://bitb.ltd/",
    title: "Key Features"
  },
  {
    text: "BiTB uses a cost-efficient stack: sentence-transformer embeddings, FAISS for local vector search, and optional OpenRouter or Hugging Face gateways. Enterprise Command can swap in private LLM endpoints.",
    url: "https://bitb.ltd/documentation",
    title: "Technology Stack"
  }
];

// ============================================================================
// ADAPTERS (Modular layer for external services)
// ============================================================================

/**
 * Vector Store Adapter
 * Replace with Pinecone/Weaviate client in production
 */
class VectorStoreAdapter {
  constructor() {
    this.useLocal = process.env.USE_LOCAL_VECTORS !== 'false';
  }

  async search(trialToken, query, topK = 6) {
    if (trialToken === 'preview') {
      // Mock semantic search for preview
      const queryLower = query.toLowerCase();
      const results = previewKnowledgeBase
        .map((item, idx) => ({
          ...item,
          score: this.calculateSimilarity(queryLower, item.text.toLowerCase())
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      
      return results;
    }

    // Mock retrieval from in-memory index
    const index = indexes.get(trialToken);
    if (!index || !index.vectors.length) {
      return [];
    }

    // In production: compute query embedding and run cosine similarity
    // For mock: return random subset
    return index.metadata.slice(0, topK);
  }

  calculateSimilarity(query, text) {
    // Simple keyword matching for mock
    const queryWords = query.split(/\s+/);
    const matches = queryWords.filter(word => text.includes(word)).length;
    return matches / queryWords.length;
  }

  async addDocuments(trialToken, documents) {
    // Mock: store documents in memory
    indexes.set(trialToken, {
      vectors: documents.map(() => Array(768).fill(0)), // Mock 768-dim vectors
      metadata: documents,
      index_path: `/indexes/${trialToken}.faiss`
    });
    return true;
  }
}

/**
 * Embeddings Adapter
 * Replace with HuggingFace API or local sentence-transformers in production
 */
class EmbeddingsAdapter {
  constructor() {
    this.useLocal = !process.env.HF_API_KEY;
  }

  async embed(text) {
    // Mock: return random 768-dim vector
    // Production: call sentence-transformers or HF API
    return Array(768).fill(0).map(() => Math.random());
  }

  async embedBatch(texts) {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

// Initialize adapters
const vectorStore = new VectorStoreAdapter();
const embeddings = new EmbeddingsAdapter();

// ============================================================================
// ROUTE SCHEMAS (JSON Schema for validation)
// ============================================================================

const startTrialSchema = {
  body: {
    type: 'object',
    required: ['site_origin', 'admin_email', 'display_name'],
    properties: {
      site_origin: { type: 'string', format: 'uri' },
      admin_email: { type: 'string', format: 'email' },
      display_name: { type: 'string', minLength: 1, maxLength: 50 },
      data_source: { type: 'object' },
      theme: { type: 'object' }
    }
  }
};

const ingestSchema = {
  // Multipart validation handled by plugin
};

const askSchema = {
  body: {
    type: 'object',
    required: ['trial_token', 'query'],
    properties: {
      trial_token: { type: 'string', minLength: 3 },
      origin: { type: 'string' },
      query: { type: 'string', minLength: 1, maxLength: 500 },
      session_id: { type: 'string' },
      context: { type: 'array' }
    }
  }
};

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/start-trial
 * Create new trial with JWT token
 */
app.post('/api/start-trial', { schema: startTrialSchema }, async (request, reply) => {
  const { site_origin, admin_email, display_name, data_source, theme } = request.body;

  // TODO: CAPTCHA verification
  // TODO: Email verification

  // Generate trial token (JWT for production, UUID for mock)
  const trial_token = 'tr_' + crypto.randomBytes(16).toString('hex');
  
  // For production JWT:
  // const trial_token = app.jwt.sign({
  //   aud: site_origin,
  //   sub: admin_email,
  //   trial: true
  // }, { expiresIn: '3d' });

  const created_at = new Date();
  const expires_at = new Date(created_at.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Store trial metadata
  trials.set(trial_token, {
    site_origin,
    admin_email,
    display_name,
    theme: theme || {},
    created_at: created_at.toISOString(),
    expires_at: expires_at.toISOString(),
    status: 'active',
    usage_count: 0,
    queries_limit: 100
  });

  // Generate embed code
  const widgetUrl = process.env.WIDGET_URL || 'http://localhost:3000';
  const embed_code = `<script src="${widgetUrl}/bitb-widget.js" data-trial-token="${trial_token}" data-theme="${theme?.theme || 'auto'}"></script>`;

  return {
    success: true,
    trial_token,
    expires_at: expires_at.toISOString(),
    embed_code,
    message: 'Trial created successfully. Starting ingestion...'
  };
});

/**
 * POST /api/ingest
 * Start ingestion job
 */
app.post('/api/ingest', async (request, reply) => {

  const isMultipart = request.isMultipart && request.isMultipart();
  let trial_token = 'preview';
  let site_url = null;
  const files = [];
  let parsedFields = {};

  if (isMultipart) {
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        parsedFields[part.fieldname] = part.value;
        if (part.fieldname === 'trial_token') trial_token = part.value;
        if (part.fieldname === 'site_url') site_url = part.value;
      } else if (part.type === 'file') {
        files.push(part);
      }
    }
    console.log('Received multipart fields:', parsedFields, 'files:', files.length);
    if (!parsedFields.trial_token && !parsedFields.site_url && files.length === 0) {
      return reply.code(400).send({ error: 'No fields or files received in multipart request.' });
    }
  } else {
    // Handle JSON body
    const body = request.body;
    trial_token = body?.trial_token || 'preview';
    site_url = body?.site_url;
    console.log('Received JSON body:', body);
    if (!trial_token && !site_url) {
      return reply.code(400).send({ error: 'No trial_token or site_url in JSON body.' });
    }
  }

  // Validate trial exists
  const trial = trials.get(trial_token);
  if (!trial && trial_token !== 'preview') {
    return reply.code(404).send({ error: 'Trial not found' });
  }

  // Validate quotas
  if (files.length > 5) {
    return reply.code(400).send({ error: 'Maximum 5 files allowed' });
  }

  // Create ingestion job
  const job_id = 'job_' + crypto.randomBytes(8).toString('hex');
  
  ingestJobs.set(job_id, {
    trial_token,
    status: 'queued',
    data_source: site_url ? { type: 'url', url: site_url } : { type: 'files', count: files.length },
    created_at: new Date().toISOString(),
    completed_at: null,
    error: null
  });

  // Mock async processing
  processIngestionJob(job_id, trial_token, site_url, files);

  return {
    success: true,
    job_id,
    status: 'queued',
    status_url: `/api/ingest/status/${job_id}`,
    message: 'Ingestion started. Check status for progress.'
  };
});

/**
 * GET /api/ingest/status/:job_id
 * Check ingestion job status
 */
app.get('/api/ingest/status/:job_id', async (request, reply) => {
  const { job_id } = request.params;
  const status = await getIngestionJobStatus(job_id);
  if (!status || status.status === 'not_found') {
    return reply.code(404).send({ error: 'Job not found' });
  }
  return status;
});

/**
 * POST /api/ask
 * RAG query endpoint with rate limiting
 */
app.post('/api/ask', {
  schema: askSchema,
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute'
    }
  }
}, async (request, reply) => {
  const { trial_token, origin, query, session_id, context } = request.body;

  // Validate trial (skip for preview)
  if (trial_token !== 'preview') {
    const trial = trials.get(trial_token);
    if (!trial) {
      return reply.code(404).send({ error: 'Trial not found' });
    }

    // Check expiry
    if (new Date() > new Date(trial.expires_at)) {
      return reply.code(403).send({ error: 'Trial expired' });
    }

    // Validate origin
    if (origin && trial.site_origin !== origin) {
      return reply.code(403).send({ error: 'Origin mismatch' });
    }

    // Check usage quota
    if (trial.usage_count >= trial.queries_limit) {
      return reply.code(429).send({ error: 'Query limit reached' });
    }

    // Increment usage
    trial.usage_count++;
  }

  // Load tenant config (YAML)
  let tenantConfig;
  try {
    tenantConfig = getTenantConfig(trial?.tenant_id || trial_token);
  } catch (err) {
    request.log.error('Failed to load tenant config', { error: err });
    return reply.code(500).send({ error: 'Tenant config error' });
  }

  // Use feature flags, prompt versioning, and MCP tools from config
  const featureFlags = tenantConfig.feature_flags || tenantConfig.features || {};
  const rollout = tenantConfig.rollout || {};
  const promptVersion = rollout.current_prompt_version || 'v1';
  const prompts = tenantConfig.prompt_versions?.greeting?.[promptVersion] || tenantConfig.prompts.greeting;
  // Example: use MCP tool config
  const mcpTools = tenantConfig.mcp_tools || [];

  // Retrieval-first approach (replace with YAML-driven logic as needed)
  const results = await vectorStore.search(trial_token, query, 6);

  if (results.length === 0) {
    return {
      answer: "I don't have specific information about that in my knowledge base. Could you rephrase your question?",
      sources: [],
      confidence: 0.1
    };
  }

  // Compose answer from top results (no LLM call for mock)
  const topResult = results[0];
  const answer = topResult.text;
  const sources = results.slice(0, 3).map(r => ({
    url: r.url,
    title: r.title,
    snippet: r.text.substring(0, 150) + '...'
  }));

  // Mock confidence based on score
  const confidence = Math.min(0.95, Math.max(0.5, topResult.score));

  // Production: Use LLM for synthesis
  // const llmResponse = await callLLM({
  //   system: "You are a helpful assistant. Answer based on the provided context.",
  //   context: results.map(r => r.text).join('\n\n'),
  //   query: query,
  //   conversationHistory: context
  // });

  return {
    answer,
    sources,
    confidence,
    session_id
  };
});

/**
 * GET /api/check-trial
 * Validate trial token and origin
 */
app.get('/api/check-trial', async (request, reply) => {
  const { trial_token, origin } = request.query;

  if (!trial_token) {
    return reply.code(400).send({ error: 'Missing trial_token' });
  }

  // Preview mode
  if (trial_token === 'preview') {
    return {
      valid: true,
      is_preview: true,
      expires_at: null,
      usage: { count: 0, limit: 999 }
    };
  }

  const trial = trials.get(trial_token);
  if (!trial) {
    return { valid: false, error: 'Trial not found' };
  }

  // Check expiry
  const now = new Date();
  const expires = new Date(trial.expires_at);
  if (now > expires) {
    return { valid: false, error: 'Trial expired', expires_at: trial.expires_at };
  }

  // Validate origin
  if (origin && trial.site_origin !== decodeURIComponent(origin)) {
    return { valid: false, error: 'Origin mismatch' };
  }

  return {
    valid: true,
    is_preview: false,
    expires_at: trial.expires_at,
    usage: {
      count: trial.usage_count,
      limit: trial.queries_limit
    }
  };
});

/**
 * GET /api/voicesupport
 * Voice support capabilities
 */
app.get('/api/voicesupport', async (request, reply) => {
  return {
    web_speech_supported: true, // Browser detection done client-side
    fallback_audio_url: process.env.FALLBACK_AUDIO_URL || null
  };
});

// ============================================================================
// MOCK INGESTION PROCESSOR
// ============================================================================

async function processIngestionJob(job_id, trial_token, site_url, files) {
  const job = ingestJobs.get(job_id);
  if (!job) return;

  try {
    // Update status
    job.status = 'processing';

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock document extraction and indexing
    let documents = [];

    if (site_url) {
      // Mock website crawl
      documents = [
        { text: `Content from ${site_url} page 1`, url: site_url, title: 'Homepage' },
        { text: `Content from ${site_url} page 2`, url: `${site_url}/about`, title: 'About' },
        { text: `Content from ${site_url} page 3`, url: `${site_url}/services`, title: 'Services' }
      ];
    } else if (files.length > 0) {
      // Mock file processing
      documents = files.map((f, i) => ({
        text: `Extracted content from file ${i + 1}`,
        url: `file://${f.filename}`,
        title: f.filename
      }));
    }

    // Add to vector store (prefer microservice for real indexing)
    if (typeof llamaAdapter !== 'undefined' && trial_token !== 'preview') {
      try {
        // Convert mock document shapes to the microservice ingest schema
        const docs = documents.map((d, i) => ({
          tenant_id: trial_token,
          doc_id: `${trial_token}_doc_${i}`,
          content: d.text,
          metadata: { url: d.url, title: d.title }
        }));

        const res = await llamaAdapter.ingestBatch(docs);
        console.log('LlamaIndex adapter response for job', job_id, JSON.stringify(res));
        // If the microservice returns a summary, attach it to the job for visibility
        if (res && res.success) {
          job.documents_count = (res.result && (res.result.added || res.result.added === 0)) ? res.result.added : docs.length;
          job.index_path = res.result && res.result.collection_name ? res.result.collection_name : null;
        } else {
          job.documents_count = docs.length;
        }
      } catch (err) {
        // fallback to local index on failure
        console.warn('LlamaIndex ingestBatch failed, falling back to local index:', err?.message || err);
        await vectorStore.addDocuments(trial_token, documents);
      }
    } else {
      // Preview or no adapter available: keep in-memory index
      await vectorStore.addDocuments(trial_token, documents);
    }

    // Update job
    job.status = 'completed';
    job.completed_at = new Date().toISOString();

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
  }
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n🚀 BiTB Fastify Server running on http://${HOST}:${PORT}\n`);
    console.log('📋 Available endpoints:');
    console.log('   POST   /api/start-trial');
    console.log('   POST   /api/ingest');
    console.log('   GET    /api/ingest/status/:job_id');
    console.log('   POST   /api/ask');
    console.log('   GET    /api/check-trial');
    console.log('   GET    /api/voicesupport');
    console.log('\n💡 Environment variables:');
    console.log('   JWT_SECRET - JWT signing secret');
    console.log('   HF_API_KEY - HuggingFace API key');
    console.log('   OPENROUTER_KEY - OpenRouter API key');
    console.log('   PINECONE_KEY - Pinecone API key');
    console.log('   USE_LOCAL_VECTORS - Use local FAISS (default: true)');
    console.log('\n📖 See README.md for curl examples\n');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

/**
 * PRODUCTION MIGRATION NOTES
 * ===========================
 * 
 * 1. Replace In-Memory Stores:
 *    - trials Map → PostgreSQL/Supabase table
 *    - ingestJobs Map → Redis with BullMQ
 *    - indexes Map → Pinecone/Weaviate
 * 
 * 2. Ingestion Queue:
 *    const queue = new Queue('ingestion', { connection: redisClient });
 *    queue.add('ingest', { trial_token, data_source });
 * 
 * 3. Vector Store Adapter (Pinecone):
 *    const pinecone = new PineconeClient();
 *    await pinecone.init({ apiKey: process.env.PINECONE_KEY });
 *    const index = pinecone.Index('bitb-trials');
 * 
 * 4. Embeddings Adapter (HuggingFace):
 *    const response = await fetch('https://api-inference.huggingface.co/...', {
 *      headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` },
 *      body: JSON.stringify({ inputs: text })
 *    });
 * 
 * 5. JWT Validation:
 *    app.addHook('preHandler', async (request, reply) => {
 *      const token = request.headers.authorization?.replace('Bearer ', '');
 *      const decoded = app.jwt.verify(token);
 *      request.trial = decoded;
 *    });
 * 
 * 6. Horizontal Scaling:
 *    - Use stateless JWT tokens
 *    - Redis for shared session state
 *    - Load balancer (Nginx/HAProxy)
 *    - Multiple Fastify instances (PM2 cluster mode)
 * 
 * 7. Monitoring:
 *    - Add @fastify/helmet for security headers
 *    - Add @fastify/compress for gzip
 *    - Add @fastify/metrics for Prometheus
 *    - Log to structured JSON for centralized logging
 */
