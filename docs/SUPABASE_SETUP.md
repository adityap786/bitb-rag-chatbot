# Supabase Setup Guide

This guide walks through setting up Supabase for the BiTB RAG Chatbot with tenant-isolated vector storage.

## Prerequisites

- Supabase account (free tier is sufficient for development)
- Node.js environment with npm/yarn

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in project details:
   - **Name**: `bitb-rag-chatbot` (or your preferred name)
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free (or Pro if needed)
4. Click "Create new project" and wait 2-3 minutes for provisioning

## Step 2: Enable pgvector Extension

1. In your Supabase project dashboard, go to **Database** → **Extensions**
2. Search for `vector`
3. Enable the `vector` extension (should show version 0.5.0 or higher)
4. Alternatively, run this SQL in the SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Step 3: Get Connection Details

1. Go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Project API Keys** → **service_role** (secret key, never expose to client)

## Step 4: Configure Environment Variables

Create or update `.env.local` in the project root:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# OpenAI (if not already set)
OPENAI_API_KEY=sk-your-openai-api-key

# Widget URL (optional, for embed code generation)
NEXT_PUBLIC_WIDGET_URL=http://localhost:3000
```

**⚠️ IMPORTANT**: Add `.env.local` to `.gitignore` to prevent committing secrets!

## Step 5: Apply Database Migration

### Option A: Using Supabase SQL Editor (Recommended for first-time setup)

1. Go to **SQL Editor** in your Supabase dashboard
2. Click "New query"
3. Copy the entire contents of `supabase/migrations/001_create_embeddings_with_rls.sql`
4. Paste into the SQL Editor
5. Click "Run" (bottom right)
6. Verify success: should see "Success. No rows returned"

### Option B: Using Supabase CLI (For version control and automation)

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link to your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```
   (Find project ref in Settings → General → Reference ID)

3. Apply migration:
   ```bash
   supabase db push
   ```

### Optional Step: per-tenant LLM fields

There is a second migration `supabase/migrations/002_add_llm_fields_to_trials.sql` which adds `llm_provider` and `llm_model` columns to the `trials` table. This allows per-tenant LLM selection (defaults to `groq`). Apply the migration via the Supabase SQL editor or the CLI if you want per-tenant overrides.

## Step 6: Verify Migration Success

Run this query in SQL Editor to check tables exist:

```sql
-- Check tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('embeddings', 'trials', 'audit_logs');

-- Check RLS policies
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';

-- Check vector function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'match_embeddings_by_tenant';
```

Expected results:
- 3 tables: `embeddings`, `trials`, `audit_logs`
- 12 RLS policies (4 per table: select, insert, update, delete)
- Function `match_embeddings_by_tenant` exists

## Step 7: Test Connection from Application

Run the built-in smoke test to verify connectivity and the `set_tenant_context` helper:

```bash
npm install
npm run test:supabase
### PowerShell helper for local env vars

If you prefer to set env vars for the current PowerShell session instead of editing `.env.local` (or you want the script to pick up `.env.local` and set them for you), there's a helper:

1. Dot-source the script (keeps the environment in the current shell):

```powershell
. .\scripts\set-env.ps1  # reads .env.local by default
# or dot-source with interactive prompt
. .\scripts\set-env.ps1 -Interactive
```

2. After dot-sourcing, run the smoke test in the same shell:

```powershell
npm run test:supabase
```

This avoids saving secrets into other shells and keeps them only in your current session. It is intended for local development convenience and will not write secrets to disk.
```

### Optional scripted verification

The `npm run test:supabase` helper is implemented in `scripts/test-supabase.mjs` and uses `dotenv` to load `.env.local` so you don't need to set environment variables manually.
If you prefer to set env vars per-shell instead, use PowerShell to set them manually (they only persist for the current shell session):

```powershell
$env:SUPABASE_URL = 'https://xabwdfohkeluojktnnic.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = 'service_role_...'
npm run test:supabase
```

## Step 8: Restart Development Server

```bash
npm run dev
```

Your API routes should now connect to Supabase with tenant-isolated vector storage!

## Troubleshooting

### Error: "relation 'embeddings' does not exist"
- Migration not applied. Go to Step 5 and apply SQL migration.

### Error: "extension 'vector' does not exist"
- pgvector not enabled. Go to Step 2 and enable extension.

### Error: "Invalid API key"
- Check that `SUPABASE_SERVICE_ROLE_KEY` is the **service_role** key, not the **anon** key.
- Verify `.env.local` is in the project root and has correct values.

### Error: "permission denied for function match_embeddings_by_tenant"
- RLS policies may not be applied. Re-run migration SQL.

### Error: "tenant_id cannot be NULL"
- Your code is calling `match_embeddings_by_tenant` without a valid tenant_id.
- Ensure `validateTenantContext` middleware is used in API routes.

## Next Steps

1. **Create your first trial**: POST to `/api/start-trial` with site details
2. **Ingest documents**: Use `/api/ingest` to add knowledge base content
3. **Test queries**: POST to `/api/ask` with `tenant_id` and `query`
4. **Run security tests**: `npx vitest tests/rag-security.test.ts`

## Security Checklist

- ✅ RLS policies enabled on all tables
- ✅ `match_embeddings_by_tenant` enforces tenant_id (raises exception if NULL)
- ✅ Service role key stored in `.env.local` (not in Git)
- ✅ All API routes validate tenant context before queries
- ✅ Trial expiration automated via `cleanup_expired_trials` function

## Production Considerations

- **Connection Pooling**: Use Supabase connection pooler (Supavisor/pgBouncer) for high traffic. Update your `.env.local` and `.env.example`:

```bash
# Example pooler endpoint
SUPABASE_URL=postgres://dbuser:dbpass@db-pooler.supabase.co:6543/postgres
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

- **Indexes**: IVFFlat vector index is created with default lists=100 (tune based on data size)
- **Backup**: Enable Point-in-Time Recovery (PITR) in Supabase dashboard
- **Monitoring**: Set up alerts for RLS policy violations and query errors
- **Rate Limiting**: Consider adding rate limits at Supabase edge functions or API Gateway
