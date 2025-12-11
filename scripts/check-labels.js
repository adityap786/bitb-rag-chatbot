const fs = require('fs');
const path = require('path');

function walk(dir, files=[]) {
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(jsx|tsx|js|ts)$/.test(file)) {
      files.push(full);
    }
  });
  return files;
}

const root = path.join(__dirname, '..', 'src');
const files = walk(root);
let problems = [];
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const labelRegex = /htmlFor=\"([^"]+)\"|for=\"([^"]+)\"/g;
  let match;
  while ((match = labelRegex.exec(content)) !== null) {
    const id = match[1] || match[2];
    if (!id) continue;
    const idRegex = new RegExp(`id=\\"${id}\\"`);
    if (!idRegex.test(content)) {
      problems.push({ file, id });
    }
  }
});

if (problems.length === 0) {
  console.log('No label/htmlFor mismatches found in src.');
  process.exit(0);
}

console.log('Found label/htmlFor mismatches:');
problems.forEach(p => {
  console.log(` - ${p.file}: htmlFor="${p.id}" not found as id in same file.`);
});
process.exit(1);
