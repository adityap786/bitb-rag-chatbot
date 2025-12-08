// Automate end-to-end ingestion flow test for BiTB Fastify backend
import fetch from 'node-fetch';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:3001';

async function startTrial() {
  const res = await fetch(`${BASE_URL}/api/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site_origin: 'http://localhost:3000',
      admin_email: 'test@example.com',
      display_name: 'Test User'
    })
  });
  const data = await res.json();
  if (!data.trial_token) throw new Error('No trial_token returned');
  console.log('Trial token:', data.trial_token);
  return data.trial_token;
}

async function startIngestion(trial_token) {
  const form = new FormData();
  form.append('trial_token', trial_token);
  form.append('site_url', 'https://example.com');
  const res = await fetch(`${BASE_URL}/api/ingest`, {
    method: 'POST',
    body: form
  });
  const data = await res.json();
  if (!data.job_id) throw new Error('No job_id returned');
  console.log('Ingestion job started:', data.job_id);
  return data.job_id;
}

async function pollStatus(job_id) {
  let attempts = 0;
  while (attempts < 10) {
    const res = await fetch(`${BASE_URL}/api/ingest/status/${job_id}`);
    const data = await res.json();
    console.log(`Status [${attempts}]:`, data.status);
    if (data.status === 'completed') {
      console.log('Ingestion complete:', data);
      return data;
    }
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }
  throw new Error('Job did not complete in time');
}

(async () => {
  try {
    const trial_token = await startTrial();
    const job_id = await startIngestion(trial_token);
    await pollStatus(job_id);
    console.log('End-to-end ingestion flow test complete.');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();
