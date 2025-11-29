#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function usage() {
  console.log(`Usage: node scripts/gradual-rollout.cjs --feature=<feature_name> [--tenants=all|t1,t2] [--stages=10,50,100] [--wait=60] [--admin-url=http://localhost:3000] [--dry-run] [--metric-gate='{"query":"...","threshold":0.01}']`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  args.forEach(a => {
    if (a === '--dry-run') { opts.dryRun = true; return; }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) opts[m[1]] = m[2];
  });
  return opts;
}

async function postJson(urlString, body, headers = {}) {
  const { default: fetch } = await import('node-fetch');
  const payload = JSON.stringify(body);
  const res = await fetch(urlString, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, headers),
    body: payload
  });
  const text = await res.text();
  try { return { statusCode: res.status, body: text ? JSON.parse(text) : null }; } catch (e) { return { statusCode: res.status, body: text }; }
}

function readYaml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.load(content) || {};
}

function writeYaml(filePath, obj) {
  const dump = yaml.dump(obj, { noRefs: true, lineWidth: 120 });
  fs.writeFileSync(filePath, dump, 'utf8');
}

function listTenantFiles(configDir) {
  if (!fs.existsSync(configDir)) return [];
  return fs.readdirSync(configDir).filter(f => f.endsWith('.yaml'));
}

function setFeatureRolloutInConfig(configObj, featureName, percent) {
  if (!configObj.rollout) configObj.rollout = {};
  if (!Array.isArray(configObj.rollout.staged_features)) configObj.rollout.staged_features = [];
  const staged = configObj.rollout.staged_features;
  const existing = staged.find(s => s.name === featureName);
  const rolloutValue = typeof percent === 'number' ? `${percent}%` : String(percent);
  if (existing) {
    existing.rollout = rolloutValue;
  } else {
    staged.push({ name: featureName, rollout: rolloutValue });
  }
}

async function run() {
  const opts = parseArgs();
  const feature = opts.feature;
  if (!feature) {
    console.error('Missing --feature argument');
    usage();
    process.exit(1);
  }

  const configDir = path.resolve(process.cwd(), 'config');
  let tenants = [];
  if (!opts.tenants || opts.tenants === 'all') {
    const files = listTenantFiles(configDir);
    tenants = files.map(f => path.basename(f, '.yaml'));
  } else {
    tenants = opts.tenants.split(',').map(s => s.trim()).filter(Boolean);
  }

  if (!tenants.length) {
    console.error('No tenants found to update');
    process.exit(1);
  }

  const stages = (opts.stages || '10,50,100').split(',').map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n));
  const waitSec = parseInt(opts.wait || '60', 10) || 60;
  const adminUrl = opts['admin-url'] || process.env.ADMIN_URL || null;
  const adminSecret = process.env.ADMIN_SECRET || opts['admin-secret'];
  const dryRun = !!opts.dryRun;
  const metricGateRaw = opts['metric-gate'] || opts['metric_gate'];
  let metricGate = null;
  if (metricGateRaw) {
    try {
      if (metricGateRaw.startsWith('@')) {
        const p = metricGateRaw.slice(1);
        metricGate = JSON.parse(fs.readFileSync(p, 'utf8'));
      } else {
        metricGate = JSON.parse(metricGateRaw);
      }
    } catch (err) {
      console.warn('Failed to parse metric_gate JSON, ignoring:', err.message || err);
      metricGate = null;
    }
  }

  console.log(`Starting progressive rollout for feature '${feature}' on ${tenants.length} tenants`);
  console.log('Stages:', stages.join(', '), 'waitSec:', waitSec, 'adminUrl:', adminUrl || '(local edits)', dryRun ? '(dry-run)' : '');

  // If admin API is available, call it and return
  if (adminUrl) {
    const url = new URL('/api/admin/rollout/promote', adminUrl).toString();
    const body = { feature, tenants: tenants.length === 0 ? 'all' : tenants, stages: stages.join(','), wait: waitSec, dryRun };
    if (metricGate) body.metric_gate = metricGate;
    try {
      const headers = {};
      if (adminSecret) headers['x-admin-secret'] = adminSecret;
      const res = await postJson(url, body, headers);
      console.log('Admin API response:', res.statusCode, res.body);
      process.exit(res.statusCode >= 400 ? 1 : 0);
    } catch (err) {
      console.error('Failed to call admin API:', err.message || err);
      process.exit(1);
    }
  }

  // Fallback: local file edits (legacy behavior)
  for (const stage of stages) {
    console.log(`\n=== Setting rollout to ${stage}% for feature ${feature} ===`);
    for (const tenantId of tenants) {
      try {
        const cfgPath = path.join(configDir, `${tenantId}.yaml`);
        if (!fs.existsSync(cfgPath)) {
          console.warn('[skip] Config not found for tenant', tenantId);
          continue;
        }
        const configObj = readYaml(cfgPath);
        setFeatureRolloutInConfig(configObj, feature, stage);
        if (dryRun) {
          console.log('[dry-run] Would write', cfgPath);
        } else {
          writeYaml(cfgPath, configObj);
          console.log('[write] Updated', cfgPath, '->', feature, '=', `${stage}%`);
        }
      } catch (err) {
        console.error('[error] tenant', tenantId, err?.message || err);
      }
    }

    if (stage !== stages[stages.length - 1]) {
      console.log(`Waiting ${waitSec} seconds before next stage...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }

  console.log('\nProgressive rollout finished');
}

run().catch(err => {
  console.error('Fatal error', err?.message || err);
  process.exit(1);
});
