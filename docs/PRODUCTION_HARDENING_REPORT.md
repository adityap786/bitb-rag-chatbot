# 4D Method: Deep Analysis & Production Hardening Report

## 1. DECONSTRUCT

### Inputs
*   **Onboarding Wizard:**
    *   `email`, `businessName`, `businessType` (Service, E-commerce, SaaS, Other).
    *   `companyInfo` (Manual text, max 10k chars).
    *   `files` (PDF, TXT, MD, DOCX; max 5MB/file, 50MB total).
    *   `branding`: `primaryColor`, `secondaryColor`, `tone`, `welcomeMessage`.
*   **System:**
    *   `tenant_id` (UUID).
    *   `trial_token` (JWT).
    *   `ingestion_job_id` (UUID).

### Automatic Processes
*   **Ingestion:**
    *   File upload -> Text Extraction (currently placeholder for PDF/DOCX).
    *   Chunking (`chunkText`: 1024 chars, 100 overlap).
    *   Embedding (`all-mpnet-base-v2`, 768 dims).
    *   Vector Store Write (`embeddings` table).
    *   Status Tracking (`ingestion_jobs` table).
*   **RAG:**
    *   Hybrid Search (`match_embeddings` RPC + Text Search).
    *   LLM Generation (Currently hardcoded to OpenAI in `chat/route.ts` - **VIOLATION**).

### Admin Controls
*   **Existing:** Basic `trials` table with `admin_email`.
*   **Required:**
    *   Provisioning MCP/LLM per tenant.
    *   Overriding trial limits.
    *   Force re-indexing.

### Non-Functional Constraints
*   **Isolation:** Strict RLS on `tenant_id`.
*   **Compliance:** PII Redaction (basic regex implemented).
*   **Performance:** Async ingestion (implemented).

---

## 2. DIAGNOSE

### P0: Critical Risks (Must Fix)
1.  **OpenAI Dependency Violation:**
    *   **Evidence:** `src/app/api/widget/chat/route.ts` calls `https://api.openai.com/v1/chat/completions`.
    *   **Risk:** Violates "Do not use - OpenAI" constraint.
    *   **Fix:** Switch to local LLM/Groq provider via `McpHybridRagResult` or similar interface.

2.  **RLS Context Mismatch:**
    *   **Evidence:** `embeddings` table RLS uses `current_setting('app.current_tenant_id', true)`.
    *   **Risk:** The `match_embeddings` RPC takes `match_tenant` as an argument but does *not* explicitly set the config variable. If the RPC is `SECURITY INVOKER` (default), it relies on the caller setting the config. If the API route doesn't call `set_config`, queries return empty.
    *   **Fix:** Ensure `set_tenant_context` is called before queries, or update RPC to be `SECURITY DEFINER` (careful!) or ensure the session context is propagated.

3.  **Missing PDF/DOCX Parsers:**
    *   **Evidence:** `src/app/api/trial/kb/upload/route.ts` has comments `// Placeholder for other formats`.
    *   **Risk:** Users uploading PDFs will get broken text `[Content from ... parser not implemented]`.
    *   **Fix:** Implement `pdf-parse` and `mammoth`.

### P1: High Priority
1.  **Widget Token Expiry:**
    *   **Evidence:** Token has 24h expiry, but frontend `localStorage` might persist it indefinitely.
    *   **Fix:** Add check on load to clear expired tokens.

2.  **Admin Provisioning Gap:**
    *   **Evidence:** No API found to toggle "MCP Enabled" for a tenant.
    *   **Fix:** Create `POST /api/admin/tenants/:id/provision`.

---

## 3. DEVELOP (Remediation Plan)

### Phase 1: Core RAG Hardening (P0)
1.  **Refactor Chat API:** Replace OpenAI call with Groq/Local LLM client.
2.  **Fix RLS/RPC:** Update `match_embeddings` to ensure tenant isolation is enforced correctly.
3.  **Implement Parsers:** Add real PDF/DOCX parsing to upload route.

### Phase 2: Admin & Lifecycle (P1)
1.  **Admin API:** Create provisioning endpoints.
2.  **Widget Hardening:** Implement token expiry checks in `TrialOnboardingWizard` and Widget.

### Phase 3: Observability & Testing (P2)
1.  **Monitoring:** Dashboard for `ingestion_jobs` failure rates.
2.  **Load Testing:** Script to simulate 100 concurrent ingestions.

---

## 4. DELIVER

*   **Status:** Phase 1 (Loader/Ingestion) Complete.
*   **Next Step:** Execute Phase 1 of Remediation (Remove OpenAI, Fix Parsers).
