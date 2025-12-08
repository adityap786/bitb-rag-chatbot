// Automate end-to-end ingestion job: start, poll, print results
import fetch from 'node-fetch';
import FormData from 'form-data';

const API_BASE = 'http://localhost:3000'; // Change to your deployed API if needed
const TRIAL_TOKEN = process.env.TRIAL_TOKEN || 'tr_demo'; // Set your trial token here
const DATA_SOURCE_TYPE = process.env.DATA_SOURCE_TYPE || 'url'; // 'url' or 'files'
const SITE_URL = process.env.SITE_URL || 'https://example.com'; // For crawl jobs
const FILE_PATHS = (process.env.FILE_PATHS || '').split(',').filter(Boolean); // For upload jobs

async function startIngestion() {
  const form = new FormData();
  form.append('trial_token', TRIAL_TOKEN);

  if (DATA_SOURCE_TYPE === 'url') {
    form.append('site_url', SITE_URL);
  } else if (DATA_SOURCE_TYPE === 'files') {
    for (const filePath of FILE_PATHS) {
      form.append('files', require('fs').createReadStream(filePath));
    }
  }

  const res = await fetch(`${API_BASE}/api/ingest`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to start ingestion');
  return data.job_id;
}

async function pollStatus(jobId) {
  let status = 'queued';
  let tries = 0;
  while (status !== 'completed' && status !== 'failed' && tries < 60) {
    const res = await fetch(`${API_BASE}/api/ingest/status/${jobId}`);
    const data = await res.json();
    status = data.status;
    console.log(`Status: ${status}, Progress: ${data.progress || 0}%`);
    if (status === 'completed' || status === 'failed') {
      return data;
    }
    await new Promise(r => setTimeout(r, 5000));
    tries++;
  }
  throw new Error('Job did not complete in time');
}

(async () => {
  try {
    console.log('Starting ingestion job...');
    const jobId = await startIngestion();
    console.log('Job ID:', jobId);
    console.log('Polling for status...');
    const result = await pollStatus(jobId);
    console.log('Final job result:', result);
  } catch (err) {
    console.error('Automation error:', err);
    process.exit(1);
  }
})();
