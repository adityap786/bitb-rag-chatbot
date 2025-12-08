// Preview-only RAG helpers for the widget sandbox and unit tests
// Provides static playbook content plus a simple hybrid scorer that can
// run entirely on the client without secrets or network calls.

function splitText(text, chunkSize = 512, overlap = 40) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + chunkSize);
    chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
}

export const playbookEntries = [
  {
    id: 'overview',
    title: 'Bits and Bytes Pvt Ltd Overview',
    source: 'https://bitb.ltd/',
    content:
      "**Bits and Bytes Pvt Ltd (BiTB)** builds retrieval augmented chat assistants that let your customers and teams talk to your knowledge base in plain language.\n\n- Mission: deliver human sounding automation that never guesses.\n- Platform: ingestion pipeline, LangChain RAG core, and a voice enabled widget.\n- Coverage: service operators, ecommerce brands, and enterprise teams run on the same secure stack.\n\nAsk me about subscriptions, onboarding, or how we protect your data.",
  },
  {
    id: 'widget-purpose',
    title: 'Why the BiTB Widget Exists',
    source: 'https://bitb.ltd/platform',
    content:
      'The BiTB widget exists so visitors can ask about Bits and Bytes Pvt Ltd offerings without waiting for a human. It understands our roadmap, pricing, use cases, and launch process. Every answer cites trusted sources indexed by our own ingestion worker.',
  },
  {
    id: 'service-desk',
    title: 'BiTB Service Desk Plan',
    source: 'https://bitb.ltd/subscription/service',
    content:
      "**BiTB Service Desk** is built for agencies, studios, and consultancies.\n\n- Includes 5k monthly RAG responses across 3 active trials.\n- Drag and drop proposals, onboarding guides, and SOP PDFs for instant ingestion.\n- Voice greeting tuned for lead nurturing with call-to-action prompts.\n- Calendly and HubSpot connectors route hot leads to humans.\n\nTeams typically reduce email back-and-forth by 60 percent in the first month.",
  },
  {
    id: 'commerce-assist',
    title: 'BiTB Commerce Assist Plan',
    source: 'https://bitb.ltd/subscription/commerce',
    content:
      "**BiTB Commerce Assist** powers ecommerce brands that need product aware chat.\n\n- Syncs product catalogs, sizing charts, and shipping policies.\n- Supports cart sensitive replies: size guides, bundle suggestions, backorder alerts.\n- Integrates with Shopify or headless storefront APIs.\n- Provides AOV and conversion analytics per conversation.\n\nCommerce teams see fewer returns and higher first contact resolution.",
  },
  {
    id: 'enterprise-command',
    title: 'BiTB Enterprise Command Plan',
    source: 'https://bitb.ltd/subscription/enterprise',
    content:
      "**BiTB Enterprise Command** is for regulated industries and global support orgs.\n\n- Dedicated ingestion worker with SSO, SCIM, and audit trails.\n- Private VPC or on-prem FAISS cluster with configurable retention.\n- Custom LLM endpoints (OpenAI Azure, Anthropic, or internal).\n- 24x7 support with response time SLAs under 30 minutes.\n\nThis plan passes SOC 2 readiness and supports redaction policies out of the box.",
  },
  {
    id: 'plan-comparison',
    title: 'BiTB Plan Comparison',
    source: 'https://bitb.ltd/subscription',
    content:
      'Here is how the three BiTB subscriptions compare:\n\n- **Service Desk**: 5k responses, 3 simultaneous trials, lead routing automations.\n- **Commerce Assist**: 10k responses, product catalog sync, conversion analytics.\n- **Enterprise Command**: custom limits, dedicated infrastructure, compliance tooling.\n\nAll plans inherit the 3 day free trial workflow, voice greeting, and origin locked embeds.',
  },
  {
    id: 'service-use-cases',
    title: 'Service Business Use Cases',
    source: 'https://bitb.ltd/use-cases/service',
    content:
      'Service businesses use BiTB to:\n\n- Answer onboarding questions instantly from proposals and playbooks.\n- Qualify leads and capture project briefs via conversational forms.\n- Surface service catalog content with pricing guidance.\n- Route escalation requests to Slack or email when human follow up is needed.',
  },
  {
    id: 'commerce-use-cases',
    title: 'Commerce Use Cases',
    source: 'https://bitb.ltd/use-cases/commerce',
    content:
      'Ecommerce teams rely on BiTB Commerce Assist to:\n\n- Deliver sizing and fit answers using synchronized product data.\n- Provide shipping cutoffs, returns windows, and localized policy details.\n- Trigger back in stock alerts and promo codes through voice friendly flows.\n- Collect post purchase feedback without leaving the storefront.',
  },
  {
    id: 'enterprise-use-cases',
    title: 'Enterprise Command Use Cases',
    source: 'https://bitb.ltd/use-cases/enterprise',
    content:
      'Enterprise Command deployments cover:\n\n- Global support desks that need consistent policy answers.\n- Internal enablement bots for SOP, compliance, and HR FAQs.\n- Partner portals where access must be scoped per tenant.\n- Disaster recovery task forces with real time content updates.',
  },
  {
    id: 'trial',
    title: 'BiTB Trial Workflow',
    source: 'https://bitb.ltd/trial',
    content:
      'The BiTB trial lasts 72 hours. You can ingest up to 50 crawled pages or upload five 10 MB files per trial. We issue a token locked to your origin, and the system purges embeddings plus cached answers automatically when the timer ends.',
  },
  {
    id: 'ingestion',
    title: 'Ingestion Pipeline',
    source: 'https://bitb.ltd/docs/ingestion',
    content:
      'Our ingestion pipeline:\n\n1. Crawl or upload: PDFs, DOCX, TXT, HTML, and sitemap aware URLs.\n2. Clean: remove navigation noise, detect sections, preserve tables.\n3. Chunk: 750 token windows with semantic overlap to boost recall.\n4. Embed: sentence-transformer MiniLM locally or Hugging Face fallback.\n5. Store: FAISS per trial with cosine similarity and metadata filters.\n\nLangChain orchestrates retrieval plus answer synthesis every time you ask a question.',
  },
  {
    id: 'security',
    title: 'Security and Compliance',
    source: 'https://bitb.ltd/security',
    content:
      'Security practices at Bits and Bytes Pvt Ltd:\n\n- Trials and paid environments keep vectors isolated per tenant.\n- Automatic PII redaction (emails, phones, IDs) before storage.\n- Logging pipeline masks sensitive data and respects regional data residency.\n- SOC 2 readiness with quarterly penetration testing and incident response runbooks.\n\nEnterprise Command customers can request custom data retention schedules.',
  },
];

export function getPlaybookEntries() {
  return playbookEntries;
}

export function getPlaybookChunks() {
  return playbookEntries.map((entry) => `${entry.title}\n${entry.content}`);
}

function embedChunk(chunk) {
  const vec = Array(128).fill(0);
  for (const char of chunk) {
    const code = char.charCodeAt(0);
    if (code < 128) vec[code]++;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return norm ? vec.map((v) => v / norm) : vec;
}

export function getPlaybookEmbeddings() {
  return getPlaybookChunks().map(embedChunk);
}

export function reviewPlaybookOutput() {
  const entries = getPlaybookEntries();
  const chunks = getPlaybookChunks();
  const embeddings = getPlaybookEmbeddings();
  console.log('Playbook entries:', entries.length);
  console.log('First entry title:', entries[0]?.title);
  return { entries, chunks, embeddings };
}

function embedQuery(query) {
  return embedChunk(query);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

function keywordScore(chunk, query) {
  const chunkLower = chunk.toLowerCase();
  const queryWords = query.toLowerCase().split(/\W+/);
  let score = 0;
  for (const word of queryWords) {
    if (word && chunkLower.includes(word)) score++;
  }
  return score;
}

export function searchPlaybook(query, topK = 3) {
  const entries = getPlaybookEntries();
  const chunks = getPlaybookChunks();
  const embeddings = getPlaybookEmbeddings();
  const queryEmbedding = embedQuery(query);

  const results = chunks.map((chunk, index) => {
    const keyword = keywordScore(chunk, query);
    const semantic = cosineSimilarity(queryEmbedding, embeddings[index]);
    const score = 0.7 * semantic + 0.3 * (keyword > 0 ? 1 : 0);
    return {
      entry: entries[index],
      chunk,
      score,
      keyword,
      semantic,
    };
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
