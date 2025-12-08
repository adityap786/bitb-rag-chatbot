const fs = require('fs');
const path = require('path');

const covPath = path.resolve('coverage', 'coverage-final.json');
if (!fs.existsSync(covPath)) {
  console.error('coverage-final.json not found at', covPath);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(covPath, 'utf8'));
const thresholds = { statements: 80, branches: 75, functions: 80, lines: 80 };
const hotspots = [];

const repoRoot = process.cwd();

function pct(covered, total) {
  if (!total) return 100;
  return Math.round((covered / total) * 10000) / 100; // 2 decimals
}

for (const [absPath, data] of Object.entries(raw)) {
  try {
    const filePath = path.resolve(absPath);
    const rel = path.relative(repoRoot, filePath);
    if (!rel || rel.startsWith('..')) continue; // skip files outside repo
    // ignore coverage internals / assets
    if (rel.startsWith('coverage') || rel.includes('node_modules')) continue;

    // Statements
    const sMap = data.s || {};
    const statementsTotal = Object.keys(sMap).length;
    const statementsCovered = Object.values(sMap).filter(v => v > 0).length;
    const statementsPct = pct(statementsCovered, statementsTotal);

    // Functions
    const fMap = data.f || {};
    const functionsTotal = Object.keys(fMap).length;
    const functionsCovered = Object.values(fMap).filter(v => v > 0).length;
    const functionsPct = pct(functionsCovered, functionsTotal);

    // Branches (each branch entry is an array of counts)
    const bMap = data.b || {};
    const branchesTotal = Object.values(bMap).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
    const branchesCovered = Object.values(bMap).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.filter(x => x > 0).length : 0), 0);
    const branchesPct = pct(branchesCovered, branchesTotal);

    // Lines: approximate with statements if explicit line data not available
    const linesPct = statementsPct;

    const below = (statementsPct < thresholds.statements) || (branchesPct < thresholds.branches) || (functionsPct < thresholds.functions) || (linesPct < thresholds.lines);
    if (below) {
      hotspots.push({ file: rel.replace(/\\\\/g, '/'), statements: statementsPct, branches: branchesPct, functions: functionsPct, lines: linesPct, totals: { statementsTotal, branchesTotal, functionsTotal } });
    }
  } catch (err) {
    // ignore individual parse errors
  }
}

hotspots.sort((a, b) => (a.statements - b.statements) || (a.branches - b.branches) || (a.functions - b.functions));

fs.mkdirSync('tests', { recursive: true });
fs.writeFileSync('tests/coverage-hotspots.json', JSON.stringify({ generated: new Date().toISOString(), thresholds, hotspots }, null, 2));
console.log('Wrote tests/coverage-hotspots.json with ' + hotspots.length + ' hotspots');
