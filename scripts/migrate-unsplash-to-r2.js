#!/usr/bin/env node
/**
 * Migrate Unsplash URLs to Cloudflare R2
 *
 * Downloads all Unsplash images used in the project and uploads them
 * to the mallan-images R2 bucket. Then updates all source files to
 * use the R2 URLs.
 *
 * Usage:
 *   DRY RUN:  node scripts/migrate-unsplash-to-r2.js --dry-run
 *   EXECUTE:  node scripts/migrate-unsplash-to-r2.js
 *
 * Prerequisites:
 *   - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars (R2 credentials)
 *   - R2_ENDPOINT env var (Cloudflare R2 endpoint)
 *   - R2_PUBLIC_URL env var (public R2 URL prefix)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// Files to scan for Unsplash URLs
const SCAN_PATTERNS = [
  'data/**/*.json',
  'app/**/*.tsx',
  'app/**/*.ts',
  'lib/**/*.ts',
  'public/crm/**/*.html',
  'public/crm/**/*.js',
];

// Regex to find Unsplash URLs
const UNSPLASH_RE = /https:\/\/images\.unsplash\.com\/[^\s"'`,)}\]]+/g;

function scanFiles(dir, pattern) {
  const results = [];
  const ext = path.extname(pattern);
  const glob = pattern.replace('**/', '');

  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full);
      } else if (entry.isFile() && (ext ? entry.name.endsWith(ext) : true)) {
        results.push(full);
      }
    }
  }

  const baseDir = path.join(PROJECT_ROOT, pattern.split('*')[0]);
  if (fs.existsSync(baseDir)) walk(baseDir);
  return results;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== MIGRATING ===');

  // 1. Find all Unsplash URLs across the project
  const urlMap = new Map(); // url -> Set<filePath>
  const allFiles = [];

  for (const pattern of SCAN_PATTERNS) {
    const baseDir = pattern.split('**')[0] || '.';
    const ext = pattern.split('.').pop();
    const searchDir = path.join(PROJECT_ROOT, baseDir);
    if (!fs.existsSync(searchDir)) continue;

    function walk(d) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.' + ext)) {
          allFiles.push(full);
        }
      }
    }
    walk(searchDir);
  }

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const matches = content.match(UNSPLASH_RE);
    if (matches) {
      for (const url of matches) {
        if (!urlMap.has(url)) urlMap.set(url, new Set());
        urlMap.get(url).add(file);
      }
    }
  }

  console.log(`Found ${urlMap.size} unique Unsplash URLs across ${allFiles.length} files`);

  if (DRY_RUN) {
    let i = 0;
    for (const [url, files] of urlMap) {
      i++;
      const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
      console.log(`  ${i}. ${hash} — used in ${files.size} file(s)`);
      console.log(`     ${url.slice(0, 80)}...`);
    }
    console.log('\nTo execute: node scripts/migrate-unsplash-to-r2.js');
    return;
  }

  // 2. Download and upload each URL
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.R2_PUBLIC_URL) {
    console.error('Missing R2 credentials. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_PUBLIC_URL');
    process.exit(1);
  }

  const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const R2_BUCKET = 'mallan-images';
  const R2_PUBLIC = process.env.R2_PUBLIC_URL;
  const replacements = new Map(); // oldUrl -> newUrl

  let i = 0;
  for (const [url] of urlMap) {
    i++;
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const key = `site/${hash}.jpg`;
    const r2Url = `${R2_PUBLIC}/${key}`;

    // Check if already exists
    try {
      await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      console.log(`  ${i}/${urlMap.size} EXISTS ${key}`);
      replacements.set(url, r2Url);
      continue;
    } catch { /* not found, need to upload */ }

    // Download
    try {
      const res = await fetch(url);
      if (!res.ok) { console.log(`  ${i}/${urlMap.size} SKIP ${url} (${res.status})`); continue; }
      const buffer = Buffer.from(await res.arrayBuffer());

      // Upload to R2
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      replacements.set(url, r2Url);
      console.log(`  ${i}/${urlMap.size} UPLOADED ${key} (${(buffer.length / 1024).toFixed(0)}KB)`);
    } catch (err) {
      console.log(`  ${i}/${urlMap.size} ERROR ${url}: ${err.message}`);
    }
  }

  // 3. Replace URLs in files
  console.log(`\nReplacing ${replacements.size} URLs in source files...`);
  let filesUpdated = 0;

  for (const file of allFiles) {
    let content = fs.readFileSync(file, 'utf-8');
    let changed = false;
    for (const [oldUrl, newUrl] of replacements) {
      if (content.includes(oldUrl)) {
        content = content.split(oldUrl).join(newUrl);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(file, content, 'utf-8');
      filesUpdated++;
      console.log(`  Updated: ${path.relative(PROJECT_ROOT, file)}`);
    }
  }

  console.log(`\nDone! ${replacements.size} URLs migrated, ${filesUpdated} files updated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
