#!/usr/bin/env tsx
/**
 * r2-orphan-cleanup — DESTRUCTIVE-ACTION-SAFE R2 listing-media orphan cleanup.
 *
 * Roadmap step #5 (R2 lifecycle). Ships **dry-run only**: it inventories orphan
 * candidates and writes a manifest, but deletes NOTHING unless every gate below
 * is satisfied. All decision logic lives in the pure, unit-tested planner at
 * lib/ops/r2-orphan-plan.ts.
 *
 * ┌─ DELETION GATES (ALL required; any failure aborts and deletes nothing) ────┐
 * │ • --execute                       (absent → dry-run, the default)          │
 * │ • --confirm "DELETE LISTING MEDIA ORPHANS"  (exact phrase)                  │
 * │ • --manifest <path>               (reviewed inventory; only its keys go)    │
 * │ • --batch-size N                  (how many to select this run; positive int)│
 * │ • --max-delete N                  (HARD ceiling; selected > max → abort)    │
 * │ • R2 list complete                (partial listing → abort)                 │
 * │ • DB reference query succeeded    (failure → abort)                         │
 * │ • object under listing-media prefix (photos/ floorplans/ videos/ virtualtours/) │
 * │ • object NOT referenced by r2_key / primary_photo_r2_key / media_url_cached │
 * │ • object older than --older-than-days (default 30; unknown age → keep)      │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * The planner may find far more candidates than --batch-size; it selects only the
 * first N (sorted oldest LastModified first, then key ascending) so large cleanups
 * run in controlled batches. --max-delete is the hard ceiling on that selected batch.
 *
 * Usage:
 *   # DRY RUN (default) — inventory + manifest, no deletion:
 *   npm run ops:r2-orphan-cleanup -- --out=docs/operations/r2-orphan-inventory-2026-07-08.md \
 *     --manifest-out=r2-orphan-manifest.json
 *
 *   # EXECUTE (all gates required; NOT run without explicit Maya approval):
 *   npm run ops:r2-orphan-cleanup -- --execute \
 *     --confirm "DELETE LISTING MEDIA ORPHANS" \
 *     --manifest r2-orphan-manifest.json --batch-size 100 --max-delete 100 --older-than-days 30
 *
 * SAFETY: read-only unless --execute + all gates pass. `deleteFromR2` is only
 * reachable inside the fully-gated execute block.
 */
import prisma from '@/lib/prisma';
import { hasR2Config, listR2Objects, keyFromUrl, deleteFromR2 } from '@/lib/images/r2';
import {
  planOrphanDeletions,
  resolveExecute,
  isValidGuardNumber,
  CONFIRM_PHRASE,
  LISTING_MEDIA_PREFIXES,
  inListingMediaScope,
  type R2ObjectMeta,
  type PlanInput,
} from '@/lib/ops/r2-orphan-plan';

// ── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string): string | null => {
  const hit = argv.find((a) => a.startsWith(`${f}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

// An explicit --dry-run ALWAYS overrides --execute (fail-safe): a run with both
// flags will never delete. Dry-run is also the default when --execute is absent.
const execute = resolveExecute(has('--execute'), has('--dry-run'));
const confirm = val('--confirm');
const manifestPath = val('--manifest');
const manifestOut = val('--manifest-out');
const outPath = val('--out');
const maxDeleteRaw = val('--max-delete');
const maxDelete = maxDeleteRaw === null ? null : Number(maxDeleteRaw);
const batchSizeRaw = val('--batch-size');
const batchSize = batchSizeRaw === null ? null : Number(batchSizeRaw);
const olderThanDaysRaw = val('--older-than-days');
const olderThanDays = olderThanDaysRaw !== null ? Number(olderThanDaysRaw) : 30;
// --prefix-scope is fixed to listing-media; the flag exists for explicitness and
// rejects any other value so nobody can widen the blast radius via CLI.
const prefixScope = val('--prefix-scope') ?? 'listing-media';

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

async function main() {
  const generatedAt = new Date().toISOString();

  if (prefixScope !== 'listing-media') {
    console.error(`[r2-orphan-cleanup] --prefix-scope only supports "listing-media" (got "${prefixScope}"). Aborting.`);
    process.exit(2);
  }
  // Fail closed on malformed numeric guards BEFORE any listing/planning, so a
  // typo like `--max-delete nope` can never silently bypass the hard cap or
  // invalidate the age window.
  if (maxDeleteRaw !== null && !isValidGuardNumber(maxDelete)) {
    console.error(`[r2-orphan-cleanup] --max-delete must be a non-negative integer (got "${maxDeleteRaw}"). Aborting (nothing deleted).`);
    process.exit(2);
  }
  if (batchSizeRaw !== null && (!isValidGuardNumber(batchSize) || (batchSize as number) < 1)) {
    console.error(`[r2-orphan-cleanup] --batch-size must be a positive integer (got "${batchSizeRaw}"). Aborting (nothing deleted).`);
    process.exit(2);
  }
  if (olderThanDaysRaw !== null && !isValidGuardNumber(olderThanDays)) {
    console.error(`[r2-orphan-cleanup] --older-than-days must be a non-negative integer (got "${olderThanDaysRaw}"). Aborting (nothing deleted).`);
    process.exit(2);
  }
  if (!hasR2Config()) {
    console.error('[r2-orphan-cleanup] R2 env vars not configured — cannot list the bucket. Aborting (nothing deleted).');
    process.exit(2);
  }

  // ── Gather R2 objects (read-only) ───────────────────────────────────────
  const { objects: bucketObjects, complete: listComplete } = await listR2Objects();

  // ── Gather DB reference set (fail-closed on error) ──────────────────────
  let dbRefKeys: Set<string> | null = null;
  try {
    const keyRows = await prisma.$queryRaw<{ r2_key: string }[]>`
      SELECT DISTINCT r2_key FROM listing_media WHERE r2_key IS NOT NULL AND r2_key <> ''
      UNION
      SELECT DISTINCT primary_photo_r2_key FROM listings WHERE primary_photo_r2_key IS NOT NULL AND primary_photo_r2_key <> ''
    `;
    const cachedRows = await prisma.$queryRaw<{ media_url_cached: string }[]>`
      SELECT DISTINCT media_url_cached FROM listing_media WHERE media_url_cached IS NOT NULL AND media_url_cached <> ''
    `;
    dbRefKeys = new Set<string>(keyRows.map((r) => r.r2_key));
    for (const row of cachedRows) {
      const k = keyFromUrl(row.media_url_cached);
      if (k) dbRefKeys.add(k);
    }
  } catch (e) {
    // Leave dbRefKeys null → planner fails closed.
    console.error(`[r2-orphan-cleanup] DB reference query failed: ${e instanceof Error ? e.message : String(e)}`);
    dbRefKeys = null;
  }

  // ── Load reviewed manifest (only used/required for --execute) ───────────
  let manifestKeys: Set<string> | null = null;
  if (manifestPath) {
    try {
      const fs = await import('node:fs');
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const keys: string[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.candidates)
          ? parsed.candidates.map((c: { key: string }) => c.key)
          : [];
      manifestKeys = new Set(keys);
    } catch (e) {
      console.error(`[r2-orphan-cleanup] failed to read --manifest ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`);
      manifestKeys = null;
    }
  }

  // ── Plan (pure) ─────────────────────────────────────────────────────────
  const input: PlanInput = {
    bucketObjects,
    listComplete,
    dbRefKeys,
    now: new Date(),
    olderThanDays,
    execute,
    confirm,
    manifestKeys,
    maxDelete,
    batchSize,
  };
  const plan = planOrphanDeletions(input);

  // ── Inventory report (markdown) ─────────────────────────────────────────
  const top100 = [...plan.candidates]
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0))
    .slice(0, 100);
  const md: string[] = [];
  md.push(`# R2 Orphan Cleanup Inventory (dry-run)`);
  md.push('');
  md.push(`_Generated: ${generatedAt} · mode: **${execute ? 'EXECUTE-REQUESTED' : 'DRY-RUN'}** · scope: ${plan.scope}_`);
  md.push('');
  md.push(`- R2 objects scanned (all prefixes): **${plan.scanned.toLocaleString()}**`);
  md.push(`- In listing-media scope: **${plan.inScope.toLocaleString()}** · out of scope (never deletable): **${plan.outOfScope.toLocaleString()}**`);
  md.push(`- DB-referenced listing-media keys (r2_key ∪ primary ∪ cached-derived): **${plan.dbReferenced.toLocaleString()}**`);
  md.push(`- **Orphan candidate count (in-scope, unreferenced, older than ${olderThanDays}d): ${plan.candidates.length.toLocaleString()}**`);
  md.push(`- **Total orphan candidate bytes: ${fmtBytes(plan.candidateBytes)}** (${plan.candidateBytes.toLocaleString()} bytes)`);
  md.push('');
  md.push(`- R2 list complete: ${listComplete ? '✅ yes' : '❌ NO (fail-closed)'} · DB reference set: ${dbRefKeys ? '✅ loaded' : '❌ FAILED (fail-closed)'}`);
  md.push(`- Guards passed: ${plan.guardsPassed.map((g) => `\`${g}\``).join(' · ')}`);
  if (plan.aborted) md.push(`- **ABORT reasons:** ${plan.abortReasons.map((r) => `\`${r}\``).join(' · ')}`);
  if (execute) md.push(`- **Selected batch this run: ${plan.selected.length.toLocaleString()}** objects · ${fmtBytes(plan.selectedBytes)} (batch-size ${batchSize ?? 'unset'}, max-delete ${maxDelete ?? 'unset'}, oldest-first)`);
  md.push(`- **Would delete on this run:** ${plan.willDelete ? `YES (${plan.selected.length})` : 'NO — nothing will be deleted'}`);
  md.push('');
  md.push('> **Out-of-scope objects are NOT deletion candidates.** Only objects under ' +
    LISTING_MEDIA_PREFIXES.join(', ') + ' are ever considered.');
  if (plan.outOfScopeSample.length) {
    md.push(`> Out-of-scope sample: ${plan.outOfScopeSample.map((k) => `\`${k}\``).join(', ')}`);
  }
  md.push('');
  md.push('## Top 100 orphan candidates');
  md.push('| # | key | prefix | in-scope | LastModified | Size |');
  md.push('|--:|---|---|:--:|---|--:|');
  top100.forEach((o, i) => {
    const prefix = LISTING_MEDIA_PREFIXES.find((p) => o.key.startsWith(p)) ?? '(none)';
    const lm = o.lastModified ? o.lastModified.toISOString().slice(0, 19) + 'Z' : 'unknown';
    md.push(`| ${i + 1} | \`${o.key}\` | ${prefix} | ${inListingMediaScope(o.key) ? 'yes' : 'no'} | ${lm} | ${fmtBytes(o.size)} |`);
  });
  md.push('');
  md.push('---');
  md.push('_Read-only inventory. No objects were deleted. Deletion requires --execute + --confirm + --manifest + --max-delete and all gates green; see docs/operations/r2-orphan-cleanup-plan-2026-07-08.md._');
  const report = md.join('\n');

  if (outPath) {
    const fs = await import('node:fs');
    fs.writeFileSync(outPath, report + '\n', 'utf8');
    console.error(`[r2-orphan-cleanup] inventory written to ${outPath}`);
  } else {
    process.stdout.write(report + '\n');
  }

  // ── Manifest (JSON) — the reviewable candidate list ─────────────────────
  const manifest = {
    generated_at: generatedAt,
    scope: plan.scope,
    older_than_days: olderThanDays,
    candidate_count: plan.candidates.length,
    candidate_bytes: plan.candidateBytes,
    candidates: plan.candidates.map((o) => ({
      key: o.key,
      size: o.size,
      last_modified: o.lastModified ? o.lastModified.toISOString() : null,
    })),
  };
  if (manifestOut) {
    const fs = await import('node:fs');
    fs.writeFileSync(manifestOut, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.error(`[r2-orphan-cleanup] manifest written to ${manifestOut}`);
  }

  // ── Execute (fully gated; unreachable unless the planner said willDelete) ─
  if (!plan.willDelete) {
    console.error(
      `[r2-orphan-cleanup] ${execute ? 'EXECUTE requested but gates NOT satisfied' : 'DRY-RUN'} — deleted 0 objects.` +
        (plan.aborted ? ` Abort: ${plan.abortReasons.join('; ')}` : ''),
    );
    await prisma.$disconnect();
    process.exit(plan.aborted && execute ? 1 : 0);
  }

  // Reaching here means every gate passed: --execute + exact confirm + manifest
  // + valid --batch-size + valid --max-delete (selected ≤ max-delete) + complete
  // R2 list + loaded DB reference set. Delete ONLY the selected batch, in chunks.
  console.error(`[r2-orphan-cleanup] EXECUTING deletion of ${plan.selected.length} orphan objects (selected batch)...`);
  const keys = plan.selected.map((o) => o.key);
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await deleteFromR2(batch);
    deleted += batch.length;
    console.error(`[r2-orphan-cleanup] deleted ${deleted}/${keys.length}`);
  }
  console.error(`[r2-orphan-cleanup] done — deleted ${deleted} objects.`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('[r2-orphan-cleanup] ERROR', e);
  prisma.$disconnect().finally(() => process.exit(2));
});
