const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'frontend', 'build');

if (!fs.existsSync(buildDir)) {
  throw new Error('frontend/build does not exist. Run npm run build from frontend first.');
}

for (const entry of fs.readdirSync(buildDir)) {
  const source = path.join(buildDir, entry);
  const target = path.join(repoRoot, entry);
  fs.cpSync(source, target, { recursive: true, force: true });
}

console.log('Synced frontend/build into the GitHub Pages root.');
