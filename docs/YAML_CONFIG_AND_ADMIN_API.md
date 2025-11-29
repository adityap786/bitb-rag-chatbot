# YAML Tenant Config & Admin API

## YAML Structure (config/tenant.example.yaml)

```
id: tn_example
name: Example Tenant
vector_store: chroma
embedding_provider: local
embedding_model: BAAI/bge-large-en-v1.5
chunk_size: 1000
chunk_overlap: 200
features:
  hybrid_search: true
  rerank: false
  enable_sync_jobs: false
prompts:
  greeting: "Welcome to Example Tenant!"
  fallback: "Sorry, I don't have an answer for that."
mcp_tools:
  - name: "summarizer"
    enabled: true
    endpoint: "https://api.example.com/summarize"
    params:
      max_length: 256
prompt_versions:
  greeting:
    v1: "Welcome to Example Tenant!"
    v2: "Hello from Example Tenant, how can I help you today?"
feature_flags:
  enable_new_reranker: false
  use_llamaindex_llm: true
rollout:
  current_prompt_version: v2
  staged_features:
    - name: "enable_new_reranker"
      rollout: 10%
    - name: "use_llamaindex_llm"
      rollout: 100%
  canary_users:
    - user1@example.com
    - user2@example.com
```

## Admin API: Hot-Reload Endpoint

**POST /api/admin/reload-tenant-config**

Reloads the YAML config for a tenant at runtime (no server restart needed).

**Request Body:**
```json
{
  "tenant_id": "tn_example"
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Config for tenant tn_example reloaded"
}
```

### Security/Authentication

- This endpoint should be protected in production! (e.g., JWT, API key, or admin session)
- Example (add to Fastify route):
  ```js
  app.addHook('preHandler', (req, reply, done) => {
    if (!req.headers['x-admin-secret'] || req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    done();
  });
  ```

## GET Endpoint (Optional)

**GET /api/admin/tenant-config/:tenant_id**

Returns the current config for a tenant (for debugging/auditing).

**Response:**
```json
{
  "config": { ... }
}
```

> Add similar authentication as above.

## Env variables & responsibilities

- `SUPABASE_URL`: URL for your Supabase project. Required by all Supabase clients.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-side privileged key. Use this only on trusted servers (backend) for admin writes (e.g., audit rows, rollouts). Never send this value to browsers or clients.
- `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public key for client-side usage (only for operations allowed by RLS policies).
- `DATABASE_URL` (optional): If you ever use a direct Postgres connection (not recommended for today's Supabase-only policy), set this to the same Postgres connection string. For now we keep all runtime reads/writes through Supabase's client.

Responsibilities:

- Server-side admin & audit writes: use the Supabase client initialized with `SUPABASE_SERVICE_ROLE_KEY` (see `src/lib/supabase/client.ts`).
- Client-facing flows and browser code: use `SUPABASE_ANON_KEY` and RLS rules.
- Migrations: Currently planned to use Supabase CLI migrations; record migrations in `migrations/` and run from CI once Supabase is available.
- Centralization: All code should import the supabase client from `src/lib/supabase/client.ts` — do not create ad-hoc clients across the codebase.

Security reminders:
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client-side bundles or logs.
- Rotate service role keys if they are ever leaked and update envs across deployments.
