**Supabase Migration: Applying RAG Vector Table + RPCs**

This document explains how to apply the SQL migration we added at `supabase/migrations/2025-11-22_create_vector_documents_and_rpc.sql` using the Supabase SQL Editor (recommended) or locally via `psql`.

**Why:** The migration creates a `vector_documents` table, `set_tenant_context` helper, `match_embeddings_by_tenant` ANN function (pgvector), and enables RLS for tenant isolation. All embeddings use `vector(768)`.

---

**Option A — Paste into the Supabase SQL Editor (recommended)**

1. Open your Supabase project in the browser.
2. From the left menu choose **Database → SQL Editor**.
3. Click **New query** (or open the query editor).
4. Open the file `supabase/migrations/2025-11-22_create_vector_documents_and_rpc.sql` locally and copy all its contents.
5. Paste the SQL into the editor and click **RUN**.
6. Wait for the query to complete — you should see a success message if all statements executed.

**Verify the migration succeeded**
- Check the table exists:
  - `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='vector_documents';`
- Check RLS is enabled:
  - `SELECT relrowsecurity FROM pg_class WHERE relname='vector_documents';` (should be `true`)
- Check policies:
  - `SELECT * FROM pg_policies WHERE tablename = 'vector_documents';`
- Check functions:
  - `SELECT proname FROM pg_proc WHERE proname IN ('set_tenant_context', 'match_embeddings_by_tenant');`
- Check index:
  - `SELECT indexname FROM pg_indexes WHERE tablename = 'vector_documents';`

**Quick smoke test - insert a sample document**

You can insert a sample row without an embedding (ingestion/upsert will fill embeddings later):

```sql
INSERT INTO public.vector_documents (tenant_id, content, metadata)
VALUES ('tn_local_sample', 'Sample knowledge base text for testing.', '{"title":"Sample KB"}');
```

After inserting, verify it shows up:

```sql
SELECT * FROM public.vector_documents WHERE tenant_id = 'tn_local_sample' LIMIT 5;
```

---

**Option B — Run via `psql` (local)**

1. Obtain your database connection string from the Supabase project settings → Database → Connection string (use the "Connection string (URI)" with a service role user or a DB user that can create extensions/migrations).
2. Set an environment variable in PowerShell:

```powershell
$env:SUPABASE_DB_URL = 'postgres://user:password@dbhost:5432/postgres'
```

3. Run the migration file with `psql`:

```powershell
psql $env:SUPABASE_DB_URL -f .\supabase\migrations\2025-11-22_create_vector_documents_and_rpc.sql
```

If `psql` is not installed on your machine, use the Supabase SQL editor instead.

---

**Notes & Troubleshooting**
- If you see errors about missing extensions (`vector` / `pgvector`), Supabase should provide the extension; if it doesn't, check your project plan or contact Supabase support.
- If `set_tenant_context` or `match_embeddings_by_tenant` are missing after running the migration, check execution errors in the SQL editor output and re-run the migration (or paste only the failed statements).
- The `vector(768)` dimension must match your embedding model. If you use a different embedding model, edit the migration SQL and change `vector(768)` to the correct dimension before running.

---

**After migration: run the ingestion test**

Set required env vars in PowerShell (example):

```powershell
$env:SUPABASE_URL = 'https://<your-project>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<your-service-role-key>'
$env:HUGGINGFACE_API_KEY = '<your-hf-key-if-using-HF>'
```

Then run the test script:

```powershell
node --loader ts-node/esm scripts/test-supabase-ingest-retrieve.ts
```

If the script logs errors like `Could not find the table 'public.vector_documents' in the schema cache`, the migration did not run or used a different schema — re-run the migration and verify.

---

If you'd like, I can also generate a one-line `psql` command to run the SQL directly using your connection string, or I can paste the SQL content into a message so you can copy/paste it into the SQL editor. Which do you prefer?