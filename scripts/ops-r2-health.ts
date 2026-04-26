#!/usr/bin/env tsx
/**
 * R2 health check — validates Cloudflare R2 configuration and runs a
 * smoke upload/head/delete cycle against the configured bucket.
 *
 * Use:
 *   npm run ops:r2-health
 *
 * Exit codes:
 *   0  R2 fully operational (env vars present + smoke test green)
 *   1  R2 misconfigured (env vars missing or wrong)
 *   2  R2 reachable but smoke test failed (auth/permissions/network)
 *
 * This is the gate that PRs 3 and 4 of the master refactor plan
 * (memory/REFACTOR-2026-04-25.md) check before any media-delivery
 * code merges. Per the user adjustment 2026-04-25: "treat R2 as its
 * own explicit infrastructure checkpoint before media-delivery
 * changes depend on it."
 *
 * Reads .env.local automatically; mirrors the dotenv pattern used by
 * scripts/backfill-media-now.ts so this can run from a fresh worktree
 * or CI without manual env wiring.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import process from 'node:process';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import { uploadToR2, deleteFromR2, existsInR2, getR2PublicUrl, hasR2Config } from '../lib/images/r2';

interface HealthReport {
  state: 'ok' | 'misconfigured' | 'smoke_failed';
  reason?: string;
  config: {
    R2_ACCOUNT_ID: 'set' | 'missing';
    R2_ACCESS_KEY_ID: 'set' | 'missing';
    R2_SECRET_ACCESS_KEY: 'set' | 'missing';
    R2_BUCKET_NAME: 'set' | 'missing';
    R2_PUBLIC_URL: 'set' | 'missing';
  };
  smoke?: {
    test_key: string;
    upload_ms?: number;
    head_ms?: number;
    delete_ms?: number;
    public_url?: string;
    head_after_delete?: 'gone' | 'still_present';
    error?: string;
  };
}

function checkConfig(): HealthReport['config'] {
  const present = (k: string): 'set' | 'missing' => (process.env[k] ? 'set' : 'missing');
  return {
    R2_ACCOUNT_ID: present('R2_ACCOUNT_ID'),
    R2_ACCESS_KEY_ID: present('R2_ACCESS_KEY_ID'),
    R2_SECRET_ACCESS_KEY: present('R2_SECRET_ACCESS_KEY'),
    R2_BUCKET_NAME: present('R2_BUCKET_NAME'),
    R2_PUBLIC_URL: present('R2_PUBLIC_URL'),
  };
}

async function smokeTest(): Promise<HealthReport['smoke']> {
  const testKey = `health-checks/r2-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.bin`;
  const payload = Buffer.from(`r2-health: ${new Date().toISOString()}\n`);
  const result: NonNullable<HealthReport['smoke']> = { test_key: testKey };

  try {
    const t0 = Date.now();
    const publicUrl = await uploadToR2(testKey, payload, 'application/octet-stream');
    result.upload_ms = Date.now() - t0;
    result.public_url = publicUrl;

    const t1 = Date.now();
    const exists = await existsInR2(testKey);
    result.head_ms = Date.now() - t1;
    if (!exists) {
      result.error = 'HeadObject after PutObject returned not-found (eventual consistency? bucket misconfigured?)';
      return result;
    }

    const t2 = Date.now();
    await deleteFromR2([testKey]);
    result.delete_ms = Date.now() - t2;

    const stillExists = await existsInR2(testKey);
    result.head_after_delete = stillExists ? 'still_present' : 'gone';

    return result;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }
}

async function main() {
  const report: HealthReport = {
    state: 'ok',
    config: checkConfig(),
  };

  if (!hasR2Config()) {
    const missing = Object.entries(report.config)
      .filter(([_, v]) => v === 'missing')
      .map(([k]) => k);
    report.state = 'misconfigured';
    report.reason = `missing env vars: ${missing.join(', ')}`;
    console.log(JSON.stringify(report, null, 2));
    console.error(`\n[r2-health: MISCONFIGURED] ${report.reason}`);
    console.error(`See docs/r2-setup.md for provisioning instructions.`);
    process.exit(1);
  }

  console.log('[r2-health] env vars present — running smoke test...');
  const smoke = await smokeTest();
  report.smoke = smoke;

  if (smoke?.error) {
    report.state = 'smoke_failed';
    report.reason = smoke.error;
    console.log(JSON.stringify(report, null, 2));
    console.error(`\n[r2-health: SMOKE FAILED] ${smoke.error}`);
    console.error(`Bucket reachable but upload/head/delete cycle failed. Check API token permissions.`);
    process.exit(2);
  }

  if (smoke?.head_after_delete === 'still_present') {
    report.state = 'smoke_failed';
    report.reason = 'object still present after delete (delete permission issue?)';
    console.log(JSON.stringify(report, null, 2));
    console.error(`\n[r2-health: SMOKE FAILED] ${report.reason}`);
    process.exit(2);
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(
    `\n[r2-health: OK] upload=${smoke?.upload_ms}ms · head=${smoke?.head_ms}ms · delete=${smoke?.delete_ms}ms`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('[r2-health: UNEXPECTED ERROR]', e);
  process.exit(2);
});
