#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const skipDirs = new Set(['node_modules', '.git', 'dist', 'coverage', 'build']);
const testFileRegex = /\.(test|spec)\.(t|j)sx?$/i;

async function readJsonSafe(filePath) {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    return JSON.parse(txt);
  } catch (err) {
    return null;
  }
}

async function findTestFiles(dir) {
  const results = [];
  async function walk(d) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const ent of entries) {
      if (ent.name && skipDirs.has(ent.name)) continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile()) {
        if (testFileRegex.test(ent.name)) results.push(full);
      }
    }
  }
  await walk(dir);
  return results;
}

async function probeVitestConfig() {
  const cfgPathTS = path.join(repoRoot, 'vitest.config.ts');
  const cfgPath = path.join(repoRoot, 'vitest.config.js');
  const out = { found: false, path: null, includes: [], excludes: [], raw: '' };
  let p = null;
  if (existsSync(cfgPathTS)) p = cfgPathTS;
  else if (existsSync(cfgPath)) p = cfgPath;
  if (!p) return out;
  out.found = true;
  out.path = p;
  try {
    out.raw = await fs.readFile(p, 'utf8');
    // crude regex extraction for include/exclude arrays
    const testBlockMatch = out.raw.match(/test\s*:\s*\{([\s\S]*?)\}\s*,?/m);
    const block = testBlockMatch ? testBlockMatch[1] : out.raw;
    const includeMatch = block.match(/include\s*:\s*\[([\s\S]*?)\]/m);
    const excludeMatch = block.match(/exclude\s*:\s*\[([\s\S]*?)\]/m);
    if (includeMatch) {
      const inner = includeMatch[1];
      const strings = [...inner.matchAll(/['`\"]([^'`\"]+)['`\"]/g)].map(m => m[1]);
      out.includes = strings;
    }
    if (excludeMatch) {
      const inner = excludeMatch[1];
      const strings = [...inner.matchAll(/['`\"]([^'`\"]+)['`\"]/g)].map(m => m[1]);
      out.excludes = strings;
    }
  } catch (err) {
    out.raw = `ERROR reading config: ${err.message}`;
  }
  return out;
}

async function probeTsconfig() {
  const p = path.join(repoRoot, 'tsconfig.json');
  const out = { found: false, raw: null, include: [], exclude: [] };
  if (!existsSync(p)) return out;
  out.found = true;
  const json = await readJsonSafe(p);
  if (!json) return out;
  out.raw = json;
  if (Array.isArray(json.include)) out.include = json.include;
  if (Array.isArray(json.exclude)) out.exclude = json.exclude;
  return out;
}

async function probePackageJson() {
  const p = path.join(repoRoot, 'package.json');
  const out = { found: false, raw: null, scripts: {}, deps: {}, devDeps: {}, type: null };
  if (!existsSync(p)) return out;
  out.found = true;
  const json = await readJsonSafe(p);
  out.raw = json;
  if (!json) return out;
  out.scripts = json.scripts || {};
  out.deps = json.dependencies || {};
  out.devDeps = json.devDependencies || {};
  out.type = json.type || null;
  return out;
}

function suggestMatches(vitestCfg, testFiles) {
  const suggestions = [];
  if (!vitestCfg.found) {
    suggestions.push('No vitest.config.ts/js found at the repo root. If your project uses a custom path, run `npx vitest --config path/to/config` or create a root config.');
  } else {
    if (vitestCfg.includes.length === 0) {
      suggestions.push(`No explicit include globs found in ${path.basename(vitestCfg.path)}; Vitest will use defaults. If your tests are in a custom folder, add include globs such as ["tests/**/*.test.ts"].`);
    } else {
      suggestions.push(`Vitest include globs found: ${JSON.stringify(vitestCfg.includes)}.`);
    }
    if (vitestCfg.excludes.length) suggestions.push(`Vitest exclude globs found: ${JSON.stringify(vitestCfg.excludes)}.`);
  }
  if (testFiles.length === 0) suggestions.push('No test files found matching common patterns (*.test.* / *.spec.*). Create a simple test file (e.g., tests/quick.test.ts) to verify the runner.');
  else suggestions.push(`Found ${testFiles.length} test file(s). If Vitest is not discovering them, check that the include globs in vitest.config.ts match these paths and that tsconfig.json does not exclude them.`);
  return suggestions;
}

async function run() {
  console.log('Vitest diagnostic report - repo root:', repoRoot, '\n');
  const [testFiles, vitestCfg, tsconfig, pkg] = await Promise.all([
    findTestFiles(repoRoot),
    probeVitestConfig(),
    probeTsconfig(),
    probePackageJson(),
  ]);

  console.log('Package.json:');
  if (!pkg.found) console.log('  - package.json not found');
  else {
    console.log('  - scripts: ', Object.keys(pkg.scripts).slice(0, 10).join(', ') || '(none)');
    console.log('  - devDependencies includes vitest:', Boolean(pkg.devDeps && (pkg.devDeps.vitest || pkg.deps && pkg.deps.vitest)));
    console.log('  - package type:', pkg.type || '(not set)');
  }

  console.log('\nVitest config:');
  if (!vitestCfg.found) console.log('  - vitest.config.ts/js not found at repo root.');
  else {
    console.log('  - path:', vitestCfg.path);
    console.log('  - include globs (extracted):', vitestCfg.includes.length ? vitestCfg.includes : '(none detected)');
    console.log('  - exclude globs (extracted):', vitestCfg.excludes.length ? vitestCfg.excludes : '(none detected)');
  }

  console.log('\nTypeScript config:');
  if (!tsconfig.found) console.log('  - tsconfig.json not found at repo root.');
  else {
    console.log('  - include:', JSON.stringify(tsconfig.include));
    console.log('  - exclude:', JSON.stringify(tsconfig.exclude));
  }

  console.log('\nTest files discovered by diagnostic script:');
  if (testFiles.length === 0) console.log('  - No test files found (matching *.test.* or *.spec.*)');
  else {
    const sample = testFiles.slice(0, 20).map(p => `  - ${path.relative(repoRoot, p)}`).join('\n');
    console.log(`  - total: ${testFiles.length}\n${sample}`);
  }

  console.log('\nSuggestions:');
  const suggestions = suggestMatches(vitestCfg, testFiles);
  for (const s of suggestions) console.log('  -', s);

  console.log('\nQuick actionable commands:');
  console.log('  - npx vitest --run --reporter verbose');
  console.log('  - npx vitest run <path-to-test-file>');
  console.log('  - node ./scripts/diagnose-vitest.mjs  (this script)');
  console.log('\nIf you want, re-run vitest with `--run --reporter verbose --logLevel debug` to see config and transformer errors.');
}

run().catch(err => {
  console.error('Diagnostic script error:', err);
  process.exitCode = 2;
});
