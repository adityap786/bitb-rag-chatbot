import { Code, FileText, Layers3, PackageCheck, Workflow } from "lucide-react";

const guides = [
  {
    title: "Widget embed",
    icon: Code,
    steps: [
      "Copy the script tag generated during the trial flow.",
      "Paste it before your site's closing </body> tag.",
  "Visit your site - the BiTB bubble appears bottom-right by default.",
      "Use data attributes like data-theme, data-position, and data-api-url for advanced control.",
    ],
    snippet: `<script src="https://bitb.ltd/bitb-widget.js"
  data-trial-token="tr_xxx"
  data-theme="dark"
  data-api-url="https://api.bitb.ltd"></script>`,
  },
  {
    title: "POST /api/ask",
    icon: Workflow,
    steps: [
      "Send the current user question and optional history to the ask endpoint.",
      "The server normalizes history, performs retrieval, then streams a grounded answer.",
      "Responses include sources, confidence, and remaining query credits.",
    ],
    snippet: `curl -X POST https://bitb.ltd/api/ask \
  -H "Content-Type: application/json" \
  -d '{
        "trial_token": "tr_demo",
        "query": "What industries do you support?",
        "session_id": "sess_123"
      }'`,
  },
  {
    title: "Start ingestion",
    icon: Layers3,
    steps: [
      "Call /api/start-trial with your origin, admin email, and theme preferences.",
      "We respond with a trial token, embed code, and ingestion job id.",
      "Upload files or trigger a crawl via /api/ingest with multipart/form-data.",
      "Poll /api/ingest/status/:jobId for completion.",
    ],
    snippet: `fetch('/api/start-trial', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    site_origin: 'https://example.com',
    admin_email: 'ops@example.com',
    data_source: { type: 'url', url: 'https://example.com', crawl_depth: 2 }
  })
});`,
  },
];

const workerNotes = [
  'Python 3.9+, sentence-transformers, FAISS, BeautifulSoup4, and tiktoken required.',
  'Workers poll the Next.js API for new ingestion jobs and report status updates back.',
  'Chunker splits content to ~750 tokens with semantic overlap to maximise retrieval quality.',
  'Expired trials trigger purge jobs that delete vectors and cached completions.',
];

export default function DocumentationPage() {
  return (
    <div className="space-y-16">
      <section className="rounded-3xl border border-white/10 bg-black/60 p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">Documentation</p>
            <h1 className="text-4xl font-semibold text-white">Embed, configure, and ship BiTB assistants confidently.</h1>
            <p className="text-sm text-white/70">
              These docs cover the full stack: widget injection, free-tier LangChain setup, ingestion worker, and deployment patterns. Everything stays friendly to service businesses that need clarity more than complexity.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            <p className="flex items-center gap-2 text-white">
              <FileText className="h-5 w-5" /> REQUIREMENTS.md highlights architecture, security posture, and onboarding checklist.
            </p>
            <p className="mt-3 text-xs text-white/50">Need more? Email docs@bitb.ai for tailored playbooks.</p>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        {guides.map((guide) => (
          <div key={guide.title} className="rounded-3xl border border-white/10 bg-black/60 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-10">
              <div className="flex w-full max-w-sm flex-col gap-3">
                <div className="flex items-center gap-3 text-white">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <guide.icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-semibold">{guide.title}</h2>
                </div>
                <ul className="space-y-2 text-sm text-white/70">
                  {guide.steps.map((step) => (
                    <li key={step} className="flex items-start gap-2">
                      <span className="mt-1 text-xs text-white/40">-</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex-1 rounded-2xl border border-white/10 bg-black/70 p-4 font-mono text-xs text-white/80">
                <pre className="whitespace-pre-wrap leading-relaxed">
{guide.snippet}
                </pre>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-dashed border-white/20 bg-black/40 p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs uppercase tracking-[0.4em] text-white/40">Ingestion worker</p>
            <h2 className="text-3xl font-semibold text-white">Python worker keeps content fresh.</h2>
            <p className="text-sm text-white/70">
              A lightweight worker polls jobs, processes crawls, persists vectors, and calls back when ready. Use the provided requirements.txt as a baseline or swap in your own infrastructure.
            </p>
            <ul className="space-y-2 text-sm text-white/60">
              {workerNotes.map((note) => (
                <li key={note} className="flex items-start gap-2">
                  <PackageCheck className="mt-1 h-4 w-4 text-emerald-300" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/70">
            <p className="flex items-center gap-2 text-white">
              <Layers3 className="h-5 w-5" /> Queue, ingest, embed, answer - orchestrated via LangChain with guardrails.
            </p>
            <p className="mt-3 text-xs text-white/50">Ready-to-run script lives under python/ingest-worker.py inside this repo.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
