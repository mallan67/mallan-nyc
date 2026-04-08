#!/usr/bin/env node
/**
 * Regenerate canonical counts for CLAUDE.md
 * Run: node scripts/regenerate-claude-counts.js
 *
 * Outputs verified counts. Use these to update CLAUDE.md.
 * CI can run this and fail if CLAUDE.md is out of sync.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function countFiles(dir, name, results = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return results;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      countFiles(path.relative(ROOT, full), name, results);
    } else if (entry.isFile() && entry.name === name) {
      results.push(path.relative(ROOT, full));
    }
  }
  return results;
}

// Counts
const vercelJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const cronScheduled = vercelJson.crons || [];
const cronRoutes = countFiles('app/api/cron', 'route.ts');
const apiRoutes = countFiles('app/api', 'route.ts');
const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
const models = (schema.match(/^\s*model\s+/gm) || []).length;
// Recursive count — includes subdirectories like neighborhoods/
function countTsxFiles(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      count += countTsxFiles(path.join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      count++;
    }
  }
  return count;
}
const components = countTsxFiles('app/components');
const errorBoundaries = countFiles('app', 'error.tsx');
const loadingStates = countFiles('app', 'loading.tsx');
const layouts = countFiles('app', 'layout.tsx');

const result = {
  timestamp: new Date().toISOString(),
  commit: (() => { try { return require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { return 'unknown'; } })(),
  scheduledCrons: cronScheduled.length,
  cronPaths: cronScheduled.map(c => c.path),
  cronRouteFiles: cronRoutes.length,
  prismaModels: models,
  apiRouteFiles: apiRoutes.length,
  components: components,
  errorBoundaries: errorBoundaries.length,
  loadingStates: loadingStates.length,
  layouts: layouts.length,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CLAUDE.md Canonical Counts (verified)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Commit:           ${result.commit.substring(0, 8)}`);
  console.log(`  Scheduled crons:  ${result.scheduledCrons}`);
  result.cronPaths.forEach(p => console.log(`    - ${p}`));
  console.log(`  Cron route files: ${result.cronRouteFiles}`);
  console.log(`  Prisma models:    ${result.prismaModels}`);
  console.log(`  API route files:  ${result.apiRouteFiles}`);
  console.log(`  Components:       ${result.components}`);
  console.log(`  Error boundaries: ${result.errorBoundaries}`);
  console.log(`  Loading states:   ${result.loadingStates}`);
  console.log(`  Layouts:          ${result.layouts}`);
  console.log('═══════════════════════════════════════════════════════════');
}
