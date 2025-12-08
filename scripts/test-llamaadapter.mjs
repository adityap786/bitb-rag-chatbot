// Simple test script to exercise the LlamaIndex microservice endpoints.
const BASE = process.env.LLAMA_INDEX_SERVICE_URL || 'http://127.0.0.1:8000';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (e) { return txt; }
}

(async function main(){
  try {
    console.log('-> health');
    console.log(await req('/health'));

    console.log('\n-> embeddings/batch');
    console.log(await req('/embeddings/batch', { method: 'POST', body: JSON.stringify({ texts: ['hello world'], batch_size: 1 }) }));

    console.log('\n-> search (preview)');
    console.log(await req('/search', { method: 'POST', body: JSON.stringify({ tenant_id: 'preview', query: 'trial' }) }));
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();
