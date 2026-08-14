#!/usr/bin/env tsx
/**
 * storage-health-monitor — READ-ONLY Neon + R2 storage health dashboard.
 *
 * PR #1 of the Neon + R2 Infrastructure Closure Audit
 * (docs/operations/neon-r2-infrastructure-closure-audit-2026-07-08.md §I).
 * Its whole job is *visibility*: install the "dashboard/check engine" so every
 * later storage decision (churn guard, retention, raw_data trim, R2 lifecycle)
 * is measured instead of guessed. It does NOT change anything.
 *
 * ┌─ SAFETY CONTRACT (enforced by tests/runtime/storage-health-monitor-readonly.test.ts) ─┐
 * │ • No DB writes — only `prisma.$queryRaw` SELECTs.                                      │
 * │ • No schema changes, no DELETE, no VACUUM, no raw_data trimming.                       │
 * │ • No R2 mutations — reports R2 *config presence* only; never uploads/deletes an        │
 * │   object (that smoke test lives in scripts/ops-r2-health.ts).                          │
 * │ • No cron / sync-write / retention side effects.                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Reports (Closure-Audit §I PR #1 spec, items 1–14):
 *   1  Neon database size (pg_database_size)
 *   2  Neon synthetic/storage estimate — NOT available via SQL (Neon control-plane
 *      metric); reported as "needs Neon API/console" per Maya's plan-confirmation note
 *   3  Top tables by total / heap / index / toast size
 *   4  Dead-tuple estimates (pg_stat_user_tables)
 *   5  listing_media total rows
 *   6  listing_media rows with r2_key
 *   7  listing_media rows with media_url_cached
 *   8  media rows missing R2 keys
 *   9  primary_photo_r2_key coverage (flagged unused-by-readers → informational)
 *   10 rows where the frontend would fall back to Trestle/proxy (active, cached IS NULL)
 *   11 listings raw_data toast size (catalog; precise per-column sum under --deep)
 *   12 audit_events size + count + date range
 *   13 terminal/closed/expired media counts (+ how many still hold an R2 object)
 *   14 green/yellow/red status summary
 *   15 R2 duplicate/redundancy checks — duplicate r2_key groups (+ active-vs-active),
 *      same original under different keys (real re-upload waste), same listing/order/type
 *   16 true R2 bucket orphan check (opt-in `--r2-orphans`; honest "not proven" otherwise)
 *   17 free-tier status (Neon + R2), reported separately, never guessing the plan
 *
 * Usage:
 *   npm run ops:storage-health                 # markdown report to stdout
 *   npm run ops:storage-health -- --json       # machine-readable JSON
 *   npm run ops:storage-health -- --out=report.md   # also write markdown to a file
 *   npm run ops:storage-health -- --deep       # + precise raw_data column-size sum (full scan)
 *   npm run ops:storage-health -- --r2-orphans # + read-only bucket LIST → true orphan check
 *                                              #   (needs R2 list permission; lists every object)
 *   npm run ops:storage-health -- --strict     # exit 1 if overall status is RED (for cron/CI)
 *
 * IMPORTANT (per Maya, 2026-07-08): this tool never deletes any duplicate or orphan
 * object. r2_key is deterministic, so multiple DB rows sharing a key point to ONE R2
 * object — DB-row duplicates do NOT inflate R2 storage. Without --r2-orphans, the report
 * makes NO claim about bucket orphans. Neon plan/tier stays "needs account confirmation".
 *
 * Thresholds are ADVISORY (see RAG_THRESHOLDS below). The Neon plan/tier is
 * "needs account confirmation" — the size RAG is a predictability signal, not a
 * free-tier limit claim.
 */
import prisma from '@/lib/prisma';
import { hasR2Config, listR2ObjectKeys, keyFromUrl } from '@/lib/images/r2';
import { TERMINAL_STATUSES } from '@/lib/idx/trestle-mapper';

// Listing-media R2 objects live ONLY under these prefixes (buildMediaR2Key in
// lib/media/media-sync-service.ts). The shared bucket also holds objects written
// by OTHER subsystems (e.g. broker-uploaded photos, Document.file_url), so the
// orphan diff compares ONLY objects under these prefixes against the listing DB
// references. Objects outside them are reported as "out of scope", never as
// orphans — we cannot classify them from listing tables alone.
const LISTING_MEDIA_PREFIXES = ['photos/', 'floorplans/', 'videos/', 'virtualtours/'] as const;
const inListingMediaScope = (key: string): boolean =>
  LISTING_MEDIA_PREFIXES.some((p) => key.startsWith(p));

// ── CLI args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const deep = argv.includes('--deep');
const strict = argv.includes('--strict');
// Opt-in, read-only bucket reconciliation. OFF by default: it lists every R2
// object (Class-A ops) and requires the R2 token to hold list permission.
// Without it, bucket-level orphans are NOT proven — the report says so.
const r2Orphans = argv.includes('--r2-orphans');
const outArg = argv.find((a) => a.startsWith('--out='));
const OUT_PATH = outArg ? outArg.split('=').slice(1).join('=') : null;

// Cloudflare R2 Standard free-tier limits (advisory; ops counts are NOT
// derivable from the S3 API — they need Cloudflare analytics).
const R2_FREE_TIER = {
  storageGB: 10, // 10 GB-month
  classAOpsPerMonth: 1_000_000,
  classBOpsPerMonth: 10_000_000,
  note: 'free egress for Standard storage',
} as const;
// Neon strict free-tier storage threshold (only relevant IF the project is on
// the free plan — which is UNCONFIRMED; see report).
const NEON_FREE_TIER_GIB = 0.5;

// ── WARNING-ONLY thresholds (env-configurable) ──────────────────────────────
// These ONLY color the report. They NEVER gate Cotality pulls, media ingest, R2
// upload, or listing display. Defaults are documented references (the hardcoded
// free-tier values above), NOT asserted provider limits — confirm each against
// the current provider docs/dashboard before treating a default as authoritative.
function numEnv(name: string, dflt: number): number {
  const v = process.env[name];
  const parsed = v == null || v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(parsed) ? parsed : dflt;
}
const WARN_THRESHOLDS = {
  r2StorageGB: numEnv('R2_STORAGE_WARNING_THRESHOLD_GB', R2_FREE_TIER.storageGB),
  r2ClassA: numEnv('R2_CLASS_A_WARNING_THRESHOLD', R2_FREE_TIER.classAOpsPerMonth),
  r2ClassB: numEnv('R2_CLASS_B_WARNING_THRESHOLD', R2_FREE_TIER.classBOpsPerMonth),
  neonStorageGB: numEnv('NEON_STORAGE_WARNING_THRESHOLD_GB', NEON_FREE_TIER_GIB),
  neonComputeHours: numEnv('NEON_COMPUTE_WARNING_THRESHOLD_HOURS', 0), // 0 = unset (compute needs the Neon API)
} as const;

// ── RAG thresholds (advisory) ───────────────────────────────────────────────
const RAG_THRESHOLDS = {
  // % of ACTIVE media rows that carry an r2_key
  r2CoveragePct: { green: 98, yellow: 90 },
  // % of ACTIVE media rows the frontend would proxy from Trestle (cached IS NULL)
  proxyFallbackPct: { green: 2, yellow: 10 }, // lower is better
  // pg_database_size in MB — predictability signal, NOT a plan-limit claim
  dbSizeMB: { green: 1024, yellow: 4096 },
  // max dead-tuple % across the top churn tables
  deadTuplePct: { green: 20, yellow: 40 }, // lower is better
  // groups where the SAME Trestle original was uploaded under DIFFERENT r2_keys
  // (true wasteful re-uploads). 0 = clean. Lower is better.
  duplicateUploadGroups: { green: 0, yellow: 25 },
} as const;

type Rag = 'GREEN' | 'YELLOW' | 'RED';

/** Higher-is-better metric → RAG. */
function ragHigher(value: number, t: { green: number; yellow: number }): Rag {
  if (value >= t.green) return 'GREEN';
  if (value >= t.yellow) return 'YELLOW';
  return 'RED';
}
/** Lower-is-better metric → RAG. */
function ragLower(value: number, t: { green: number; yellow: number }): Rag {
  if (value <= t.green) return 'GREEN';
  if (value <= t.yellow) return 'YELLOW';
  return 'RED';
}
function worst(...rags: Rag[]): Rag {
  if (rags.includes('RED')) return 'RED';
  if (rags.includes('YELLOW')) return 'YELLOW';
  return 'GREEN';
}
const RAG_ICON: Record<Rag, string> = { GREEN: '🟢', YELLOW: '🟡', RED: '🔴' };

// ── helpers ─────────────────────────────────────────────────────────────────
function fmtBytes(b: number): string {
  if (!Number.isFinite(b)) return 'n/a';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}
function pct(n: number, d: number): number {
  return d > 0 ? (n / d) * 100 : 0;
}
function n(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

/**
 * Retry transient Neon errors with exponential backoff. Neon compute
 * auto-suspends, so the first query after a quiet period can fail with
 * "Can't reach database server" before cold-start completes. Mirrors the
 * helper in scripts/neon-storage-audit.ts.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const transient =
        msg.includes("Can't reach database server") ||
        msg.includes('Connection terminated') ||
        msg.includes('connection closed') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT');
      if (!transient || attempt === maxAttempts) throw e;
      const waitMs = attempt * 2000;
      console.warn(
        `  [${label}] attempt ${attempt}/${maxAttempts} failed (${msg.split('\n')[0]}); retrying in ${waitMs}ms`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error('unreachable');
}

// ── row types ────────────────────────────────────────────────────────────────
interface TableSizeRow {
  table_name: string;
  total_bytes: bigint;
  heap_bytes: bigint;
  index_bytes: bigint;
  toast_bytes: bigint;
  est_rows: bigint;
}
interface DeadTupleRow {
  table_name: string;
  live: bigint;
  dead: bigint;
  dead_pct: number | null;
  last_autovacuum: Date | null;
  last_analyze: Date | null;
}

/**
 * Public media-supply health — read-only. Answers "why does a card placeholder?" with counts,
 * so cost/monitoring never has to be solved by suppressing images. Scoped to public
 * (idx_display_yn=true) listings. Referenced/orphan/missing_from_r2 come from the opt-in
 * `--r2-orphans` bucket check (data.orphan), not re-queried here.
 */
async function collectMediaHealth() {
  const [supply] = await withRetry('media-supply', () => prisma.$queryRaw<{
    public_listings: bigint; with_db_photos: bigint; zero_db_photos: bigint;
    zero_active_media_rows: bigint; floorplan_only: bigint;
  }[]>`
    WITH lm AS (
      SELECT listing_id,
        count(*) FILTER (WHERE status = 'active' AND media_type = 'Photo')     AS photo_rows,
        count(*) FILTER (WHERE status = 'active')                              AS active_rows,
        count(*) FILTER (WHERE status = 'active' AND media_type = 'FloorPlan') AS fp_rows
      FROM listing_media GROUP BY listing_id
    )
    SELECT
      count(*)                                                                    AS public_listings,
      count(*) FILTER (WHERE COALESCE(lm.photo_rows, 0) > 0)                       AS with_db_photos,
      count(*) FILTER (WHERE COALESCE(lm.photo_rows, 0) = 0)                       AS zero_db_photos,
      count(*) FILTER (WHERE COALESCE(lm.active_rows, 0) = 0)                      AS zero_active_media_rows,
      count(*) FILTER (WHERE COALESCE(lm.active_rows, 0) > 0
                         AND COALESCE(lm.photo_rows, 0) = 0
                         AND COALESCE(lm.fp_rows, 0) > 0)                          AS floorplan_only
    FROM listings l LEFT JOIN lm ON lm.listing_id = l.listing_id
    WHERE l.idx_display_yn = true
  `);
  const [json] = await withRetry('media-json-fallback', () => prisma.$queryRaw<{
    empty_json: bigint; json_recoverable: bigint;
  }[]>`
    WITH lm AS (SELECT listing_id, count(*) FILTER (WHERE status = 'active' AND media_type = 'Photo') AS photo_rows FROM listing_media GROUP BY listing_id)
    SELECT
      -- Guard jsonb_array_length against legacy object-shaped media (it THROWS on non-array).
      count(*) FILTER (WHERE COALESCE(CASE WHEN jsonb_typeof(l.media::jsonb) = 'array' THEN jsonb_array_length(l.media::jsonb) END, 0) = 0) AS empty_json,
      count(*) FILTER (WHERE COALESCE(CASE WHEN jsonb_typeof(l.media::jsonb) = 'array' THEN jsonb_array_length(l.media::jsonb) END, 0) > 0) AS json_recoverable
    FROM listings l LEFT JOIN lm ON lm.listing_id = l.listing_id
    WHERE l.idx_display_yn = true AND COALESCE(lm.photo_rows, 0) = 0
  `);
  const [rawFirst] = await withRetry('media-raw-first-floorplan', () => prisma.$queryRaw<{
    json_first_floorplan: bigint; exposed_json_path: bigint;
  }[]>`
    WITH lm AS (SELECT listing_id, count(*) FILTER (WHERE status = 'active' AND media_type = 'Photo') AS photo_rows FROM listing_media GROUP BY listing_id)
    SELECT
      count(*) FILTER (WHERE l.media::jsonb->0->>'mediaType' = 'FloorPlan')                                        AS json_first_floorplan,
      count(*) FILTER (WHERE l.media::jsonb->0->>'mediaType' = 'FloorPlan' AND COALESCE(lm.photo_rows, 0) = 0)     AS exposed_json_path
    FROM listings l LEFT JOIN lm ON lm.listing_id = l.listing_id
    -- CASE-guard the length (a sibling jsonb_typeof = 'array' AND predicate does NOT reliably
    -- short-circuit in Postgres — quals may be reordered — so jsonb_array_length must live inside
    -- the CASE). The ->0->>'mediaType' form is null-safe on a non-array, so only the length
    -- needs guarding.
    -- NOTE: no BACKTICKS in this comment. It sits inside a $queryRaw tagged template, so a
    -- backtick here terminates the template literal and the file stops parsing entirely
    -- (esbuild: "Expected ) but found jsonb_typeof"). That is how this monitor became
    -- unrunnable; keep prose here backtick-free.
    WHERE l.idx_display_yn = true
      AND COALESCE(CASE WHEN jsonb_typeof(l.media::jsonb) = 'array' THEN jsonb_array_length(l.media::jsonb) END, 0) > 0
  `);
  const [rows] = await withRetry('media-rows', () => prisma.$queryRaw<{ total: bigint; active: bigint }[]>`
    SELECT count(*) AS total, count(*) FILTER (WHERE status = 'active') AS active FROM listing_media
  `);
  return {
    public_listings: n(supply.public_listings),
    with_db_photos: n(supply.with_db_photos),
    zero_db_photos: n(supply.zero_db_photos),
    zero_active_media_rows: n(supply.zero_active_media_rows),
    floorplan_only: n(supply.floorplan_only),
    zero_photo_empty_json: n(json.empty_json),           // genuinely photo-less → placeholder is correct
    zero_photo_json_recoverable: n(json.json_recoverable), // has JSON media to fall back to
    json_first_floorplan: n(rawFirst.json_first_floorplan),
    json_first_floorplan_exposed_json_path: n(rawFirst.exposed_json_path),
    listing_media_rows_total: n(rows.total),
    listing_media_rows_active: n(rows.active),
  };
}

async function collect() {
  // 1 — database size
  const [{ bytes: dbBytes }] = await withRetry(
    'db-size',
    () => prisma.$queryRaw<{ bytes: bigint }[]>`
      SELECT pg_database_size(current_database()) AS bytes
    `,
  );

  // 3 — top tables by total / heap / index / toast
  const topTables = await withRetry(
    'top-tables',
    () => prisma.$queryRaw<TableSizeRow[]>`
      SELECT
        c.relname AS table_name,
        pg_total_relation_size(c.oid)                      AS total_bytes,
        pg_relation_size(c.oid)                            AS heap_bytes,
        pg_indexes_size(c.oid)                             AS index_bytes,
        COALESCE(pg_total_relation_size(c.reltoastrelid), 0) AS toast_bytes,
        c.reltuples::bigint                                AS est_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 15
    `,
  );

  // 4 — dead tuples
  const deadTuples = await withRetry(
    'dead-tuples',
    () => prisma.$queryRaw<DeadTupleRow[]>`
      SELECT
        relname AS table_name,
        n_live_tup AS live,
        n_dead_tup AS dead,
        CASE WHEN n_live_tup + n_dead_tup > 0
             THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1)
             ELSE 0 END AS dead_pct,
        last_autovacuum,
        last_analyze
      FROM pg_stat_user_tables
      ORDER BY n_dead_tup DESC
      LIMIT 12
    `,
  );

  // 5–8, 10 — listing_media coverage (single pass with FILTER)
  const [media] = await withRetry(
    'media-coverage',
    () => prisma.$queryRaw<
      {
        total_rows: bigint;
        active_rows: bigint;
        with_r2_key: bigint;
        with_cached: bigint;
        missing_r2_key: bigint;
        active_missing_r2_key: bigint;
        active_proxy_fallback: bigint;
        active_no_url: bigint;
        deleted_rows: bigint;
      }[]
    >`
      SELECT
        count(*)                                                        AS total_rows,
        count(*) FILTER (WHERE status = 'active')                       AS active_rows,
        count(*) FILTER (WHERE r2_key IS NOT NULL)                      AS with_r2_key,
        count(*) FILTER (WHERE media_url_cached IS NOT NULL)            AS with_cached,
        count(*) FILTER (WHERE r2_key IS NULL)                          AS missing_r2_key,
        count(*) FILTER (WHERE status = 'active' AND r2_key IS NULL)    AS active_missing_r2_key,
        count(*) FILTER (WHERE status = 'active'
                           AND media_url_cached IS NULL
                           AND media_url_original IS NOT NULL)          AS active_proxy_fallback,
        count(*) FILTER (WHERE status = 'active'
                           AND media_url_cached IS NULL
                           AND media_url_original IS NULL)              AS active_no_url,
        count(*) FILTER (WHERE status = 'deleted')                     AS deleted_rows
      FROM listing_media
    `,
  );

  // 9 — primary_photo_r2_key coverage (informational: column is unused by readers)
  const [primary] = await withRetry(
    'primary-photo',
    () => prisma.$queryRaw<
      {
        total_listings: bigint;
        with_primary_r2: bigint;
        listings_with_photos: bigint;
        photos_with_primary_r2: bigint;
      }[]
    >`
      SELECT
        count(*)                                                         AS total_listings,
        count(*) FILTER (WHERE primary_photo_r2_key IS NOT NULL)         AS with_primary_r2,
        count(*) FILTER (WHERE COALESCE(photo_count, 0) > 0)            AS listings_with_photos,
        count(*) FILTER (WHERE COALESCE(photo_count, 0) > 0
                           AND primary_photo_r2_key IS NOT NULL)         AS photos_with_primary_r2
      FROM listings
    `,
  );

  // 12 — audit_events count + date range (size comes from topTables)
  const [audit] = await withRetry(
    'audit-events',
    () => prisma.$queryRaw<
      { row_count: bigint; oldest: Date | null; newest: Date | null }[]
    >`
      SELECT count(*) AS row_count, min(created_at) AS oldest, max(created_at) AS newest
      FROM audit_events
    `,
  );

  // 13 — terminal/closed media (+ how many still hold an R2 object).
  // Uses a parameterised ANY($1) list from the canonical TERMINAL_STATUSES set
  // (imported from the mapper) so this never drifts from the compliance source.
  const terminalList = [...TERMINAL_STATUSES];
  const terminal = await withRetry('terminal-media', () =>
    prisma.$queryRawUnsafe<
      {
        media_rows: bigint;
        active_media_rows: bigint;
        with_r2_key: bigint;
        active_with_r2: bigint;
        deleted_with_r2: bigint;
        listings: bigint;
      }[]
    >(
      `SELECT
         count(lm.id)                                                          AS media_rows,
         count(lm.id) FILTER (WHERE lm.status = 'active')                      AS active_media_rows,
         count(lm.id) FILTER (WHERE lm.r2_key IS NOT NULL)                     AS with_r2_key,
         count(lm.id) FILTER (WHERE lm.status = 'active'  AND lm.r2_key IS NOT NULL) AS active_with_r2,
         count(lm.id) FILTER (WHERE lm.status = 'deleted' AND lm.r2_key IS NOT NULL) AS deleted_with_r2,
         count(DISTINCT l.listing_id)                                          AS listings
       FROM listings l
       JOIN listing_media lm ON lm.listing_id = l.listing_id
       WHERE l.status = ANY($1::text[])`,
      terminalList,
    ),
  );

  // ── R2 duplicate / redundancy checks (all DB-level, read-only) ──────────
  // NOTE the key nuance: r2_key is DETERMINISTIC ({folder}/{listingId}/{order}.jpg),
  // so N DB rows with the SAME key point to ONE R2 object. DB-row "duplicates"
  // therefore do NOT multiply R2 storage — they're mostly tombstoned history
  // rows (soft-delete) sharing a key with their live replacement. The check that
  // actually detects wasted R2 storage is `dupOriginal` (same original image
  // under DIFFERENT keys). We report both and label them precisely.

  // 1 — duplicate r2_key groups (any status)
  const [dupKey] = await withRetry(
    'dup-r2-key',
    () => prisma.$queryRaw<
      {
        rows_with_key: bigint;
        distinct_keys: bigint;
        dup_groups: bigint;
        dup_rows_beyond_first: bigint;
        max_group_size: bigint;
      }[]
    >`
      WITH g AS (
        SELECT r2_key, count(*) c
        FROM listing_media
        WHERE r2_key IS NOT NULL AND r2_key <> ''
        GROUP BY r2_key HAVING count(*) > 1
      )
      SELECT
        (SELECT count(*)          FROM listing_media WHERE r2_key IS NOT NULL AND r2_key <> '') AS rows_with_key,
        (SELECT count(DISTINCT r2_key) FROM listing_media WHERE r2_key IS NOT NULL AND r2_key <> '') AS distinct_keys,
        (SELECT count(*)          FROM g) AS dup_groups,
        (SELECT COALESCE(sum(c-1),0) FROM g) AS dup_rows_beyond_first,
        (SELECT COALESCE(max(c),0)   FROM g) AS max_group_size
    `,
  );

  // 1b — classify duplicate groups by status makeup (explains "by-design" reuse)
  const [dupKeyByStatus] = await withRetry(
    'dup-r2-key-by-status',
    () => prisma.$queryRaw<
      { groups_active_only: bigint; groups_deleted_only: bigint; groups_mixed: bigint }[]
    >`
      SELECT
        count(*) FILTER (WHERE statuses = 'active only')       AS groups_active_only,
        count(*) FILTER (WHERE statuses = 'deleted only')      AS groups_deleted_only,
        count(*) FILTER (WHERE statuses = 'mixed')             AS groups_mixed
      FROM (
        SELECT r2_key,
          CASE
            WHEN bool_and(status = 'active')  THEN 'active only'
            WHEN bool_and(status <> 'active') THEN 'deleted only'
            ELSE 'mixed'
          END AS statuses
        FROM listing_media
        WHERE r2_key IS NOT NULL AND r2_key <> ''
        GROUP BY r2_key HAVING count(*) > 1
      ) t
    `,
  );

  // 1c — genuine ACTIVE-vs-ACTIVE key sharing (multiple live rows → same object)
  const [activeDupKey] = await withRetry(
    'active-dup-r2-key',
    () => prisma.$queryRaw<
      { active_dup_groups: bigint; active_dup_rows_beyond_first: bigint; max_active_group: bigint }[]
    >`
      WITH g AS (
        SELECT r2_key, count(*) c
        FROM listing_media
        WHERE status = 'active' AND r2_key IS NOT NULL AND r2_key <> ''
        GROUP BY r2_key HAVING count(*) > 1
      )
      SELECT count(*) AS active_dup_groups,
             COALESCE(sum(c-1),0) AS active_dup_rows_beyond_first,
             COALESCE(max(c),0) AS max_active_group
      FROM g
    `,
  );

  // 2 — same original image under DIFFERENT keys (the real re-upload/waste signal)
  const [dupOriginal] = await withRetry(
    'dup-original',
    () => prisma.$queryRaw<
      { groups: bigint; rows_involved: bigint; max_distinct_keys: bigint }[]
    >`
      WITH g AS (
        SELECT media_url_original, count(*) AS rows, count(DISTINCT r2_key) AS dk
        FROM listing_media
        WHERE media_url_original IS NOT NULL AND media_url_original <> ''
          AND r2_key IS NOT NULL AND r2_key <> ''
        GROUP BY media_url_original HAVING count(DISTINCT r2_key) > 1
      )
      SELECT count(*) AS groups, COALESCE(sum(rows),0) AS rows_involved, COALESCE(max(dk),0) AS max_distinct_keys
      FROM g
    `,
  );

  // 3 — same listing / order / type duplicated among ACTIVE rows
  const [dupSlot] = await withRetry(
    'dup-slot',
    () => prisma.$queryRaw<
      { groups: bigint; extra_rows: bigint; max_group: bigint }[]
    >`
      WITH g AS (
        SELECT listing_id, "order", media_type, count(*) c
        FROM listing_media
        WHERE status = 'active'
        GROUP BY listing_id, "order", media_type
        HAVING count(*) > 1
      )
      SELECT count(*) AS groups, COALESCE(sum(c-1),0) AS extra_rows, COALESCE(max(c),0) AS max_group
      FROM g
    `,
  );

  // top-25 duplicate r2_key groups (for the report)
  const topDupGroups = await withRetry(
    'top-dup-groups',
    () => prisma.$queryRaw<
      {
        r2_key: string;
        cnt: bigint;
        active_cnt: bigint;
        listing_ids: string[];
        media_ids: string[];
        media_types: string[];
        statuses: string[];
      }[]
    >`
      SELECT r2_key,
             count(*) AS cnt,
             count(*) FILTER (WHERE status = 'active') AS active_cnt,
             (array_agg(DISTINCT listing_id))[1:5]       AS listing_ids,
             (array_agg(id::text ORDER BY id::text))[1:8] AS media_ids,
             (array_agg(DISTINCT media_type))[1:5]       AS media_types,
             (array_agg(DISTINCT status))[1:5]           AS statuses
      FROM listing_media
      WHERE r2_key IS NOT NULL AND r2_key <> ''
      GROUP BY r2_key HAVING count(*) > 1
      ORDER BY count(*) DESC, r2_key
      LIMIT 25
    `,
  );

  // 11 (deep only) — precise raw_data on-disk size across all listings
  let rawDataBytes: number | null = null;
  if (deep) {
    const [{ bytes }] = await withRetry(
      'raw-data-deep',
      () => prisma.$queryRaw<{ bytes: bigint }[]>`
        SELECT COALESCE(sum(pg_column_size(raw_data)), 0)::bigint AS bytes FROM listings
      `,
    );
    rawDataBytes = n(bytes);
  }

  // 5 — TRUE bucket orphan reconciliation (opt-in, read-only). Requires R2 list
  // permission. Compares every bucket object key against the union of live DB
  // references (listing_media.r2_key + listings.primary_photo_r2_key). Without
  // this pass we make NO claim about orphans.
  type OrphanResult =
    | { status: 'not_run'; note: string }
    | { status: 'unavailable'; note: string }
    | {
        status: 'proven';
        scope: string;
        bucket_objects: number;
        bucket_bytes: number;
        in_scope_objects: number;
        out_of_scope_objects: number;
        db_referenced_keys: number;
        orphans_in_r2: number;
        missing_from_r2: number;
        orphan_sample: string[];
        missing_sample: string[];
        out_of_scope_sample: string[];
        note: string;
      };
  let orphan: OrphanResult = {
    status: 'not_run',
    note: 'Bucket-level orphan check not run. Pass --r2-orphans (needs R2 list permission) to prove it. DB-level duplicate checks above do NOT prove the absence of bucket orphans.',
  };
  if (r2Orphans) {
    if (!hasR2Config()) {
      orphan = { status: 'unavailable', note: 'R2 env vars not configured; cannot list the bucket. Bucket-level orphans remain UNPROVEN.' };
    } else {
      try {
        const { keys: bucketKeys, totalBytes, count } = await listR2ObjectKeys();
        // Reference set = every listing-media R2 key we can derive from the DB:
        // listing_media.r2_key + listings.primary_photo_r2_key + any key encoded
        // in listing_media.media_url_cached (CRM variants can point cached at a
        // different key than r2_key). Bounded to listing-media prefixes only.
        const dbKeyRows = await withRetry(
          'db-r2-keys',
          () => prisma.$queryRaw<{ r2_key: string }[]>`
            SELECT DISTINCT r2_key FROM listing_media WHERE r2_key IS NOT NULL AND r2_key <> ''
            UNION
            SELECT DISTINCT primary_photo_r2_key FROM listings WHERE primary_photo_r2_key IS NOT NULL AND primary_photo_r2_key <> ''
          `,
        );
        const cachedRows = await withRetry(
          'db-cached-urls',
          () => prisma.$queryRaw<{ media_url_cached: string }[]>`
            SELECT DISTINCT media_url_cached FROM listing_media WHERE media_url_cached IS NOT NULL AND media_url_cached <> ''
          `,
        );
        const dbKeySet = new Set<string>(dbKeyRows.map((r) => r.r2_key));
        for (const row of cachedRows) {
          const k = keyFromUrl(row.media_url_cached);
          if (k) dbKeySet.add(k);
        }
        // Only compare objects UNDER listing-media prefixes. Everything else in
        // the shared bucket (agent photos, documents, etc.) is out of scope and
        // is NEVER flagged as an orphan here.
        const inScope = bucketKeys.filter(inListingMediaScope);
        const outOfScope = bucketKeys.filter((k) => !inListingMediaScope(k));
        const bucketSet = new Set(inScope);
        const orphansInR2 = inScope.filter((k) => !dbKeySet.has(k));
        // "missing" = a listing-media DB key with no bucket object (also scoped).
        const missingFromR2 = [...dbKeySet].filter((k) => inListingMediaScope(k) && !bucketSet.has(k));
        orphan = {
          status: 'proven',
          scope: `listing-media prefixes only: ${LISTING_MEDIA_PREFIXES.join(', ')}`,
          bucket_objects: count,
          bucket_bytes: totalBytes,
          in_scope_objects: inScope.length,
          out_of_scope_objects: outOfScope.length,
          db_referenced_keys: dbKeySet.size,
          orphans_in_r2: orphansInR2.length,
          missing_from_r2: missingFromR2.length,
          orphan_sample: orphansInR2.slice(0, 25),
          missing_sample: missingFromR2.slice(0, 25),
          out_of_scope_sample: outOfScope.slice(0, 25),
          note: 'Orphans/missing are scoped to listing-media prefixes. Out-of-scope objects (other subsystems) are counted, not classified — a lifecycle PR must confirm their owning table before any action. No objects deleted.',
        };
      } catch (e) {
        orphan = {
          status: 'unavailable',
          note: `R2 bucket list did not complete; captured error: ${e instanceof Error ? e.message : String(e)}. Bucket-level orphans remain UNPROVEN — rerun with R2 list permission against the correct bucket to verify.`,
        };
      }
    }
  }

  return {
    dbBytes: n(dbBytes),
    topTables,
    deadTuples,
    media,
    primary,
    audit,
    terminal: terminal[0],
    terminalStatuses: terminalList,
    rawDataBytes,
    r2Configured: hasR2Config(),
    dupKey,
    dupKeyByStatus,
    activeDupKey,
    dupOriginal,
    dupSlot,
    topDupGroups,
    orphan,
    mediaHealth: await collectMediaHealth(),
  };
}

function computeRag(data: Awaited<ReturnType<typeof collect>>) {
  const activeMedia = n(data.media.active_rows);
  const activeWithR2 =
    activeMedia - n(data.media.active_missing_r2_key); // active rows that HAVE r2_key
  const r2CoveragePct = pct(activeWithR2, activeMedia);
  const proxyFallbackPct = pct(n(data.media.active_proxy_fallback), activeMedia);
  const dbSizeMB = data.dbBytes / 1024 ** 2;

  // dead-tuple worst across the 3 known churn tables
  const churn = new Set(['listing_media', 'listings', 'listing_search_projection']);
  const maxDeadPct = Math.max(
    0,
    ...data.deadTuples.filter((d) => churn.has(d.table_name)).map((d) => n(d.dead_pct)),
  );

  const dims = {
    r2Coverage: {
      value: r2CoveragePct,
      rag: ragHigher(r2CoveragePct, RAG_THRESHOLDS.r2CoveragePct),
    },
    proxyFallback: {
      value: proxyFallbackPct,
      rag: ragLower(proxyFallbackPct, RAG_THRESHOLDS.proxyFallbackPct),
    },
    dbSize: { value: dbSizeMB, rag: ragLower(dbSizeMB, RAG_THRESHOLDS.dbSizeMB) },
    deadTuples: { value: maxDeadPct, rag: ragLower(maxDeadPct, RAG_THRESHOLDS.deadTuplePct) },
    // any active media row with NO url at all is a hard display defect
    brokenMedia: {
      value: n(data.media.active_no_url),
      rag: (n(data.media.active_no_url) === 0 ? 'GREEN' : 'RED') as Rag,
    },
    // wasteful re-uploads: same original image under different r2_keys
    duplicateUploads: {
      value: n(data.dupOriginal.groups),
      rag: ragLower(n(data.dupOriginal.groups), RAG_THRESHOLDS.duplicateUploadGroups),
    },
  };
  const overall = worst(...Object.values(dims).map((d) => d.rag));
  return { dims, overall, r2CoveragePct, proxyFallbackPct, dbSizeMB, maxDeadPct, activeWithR2 };
}

function renderMarkdown(
  data: Awaited<ReturnType<typeof collect>>,
  rag: ReturnType<typeof computeRag>,
  generatedAt: string,
): string {
  const L: string[] = [];
  const m = data.media;
  const p = data.primary;

  L.push('# Neon + R2 Storage Health Report');
  L.push('');
  L.push(`_Generated: ${generatedAt} · **read-only** · no DB/R2 mutations._`);
  L.push('');
  L.push(`## 14. Overall status: ${RAG_ICON[rag.overall]} **${rag.overall}**`);
  L.push('');
  L.push('| Dimension | Value | Status |');
  L.push('|---|---|---|');
  L.push(`| R2 coverage (active media w/ r2_key) | ${rag.r2CoveragePct.toFixed(1)}% | ${RAG_ICON[rag.dims.r2Coverage.rag]} ${rag.dims.r2Coverage.rag} |`);
  L.push(`| Proxy/Trestle fallback (active) | ${rag.proxyFallbackPct.toFixed(2)}% | ${RAG_ICON[rag.dims.proxyFallback.rag]} ${rag.dims.proxyFallback.rag} |`);
  L.push(`| DB size (advisory, plan unconfirmed) | ${fmtBytes(data.dbBytes)} | ${RAG_ICON[rag.dims.dbSize.rag]} ${rag.dims.dbSize.rag} |`);
  // SEPARATE Free-tier gate. The advisory `dbSize` dimension above uses a 1 GB
  // green threshold as a PREDICTABILITY signal, so a database comfortably over
  // the Neon Free 0.5 GB ceiling still reported GREEN while this same report
  // printed "Neon storage: 0.5 GB" two sections lower. That juxtaposition hid
  // the overage. CPU-free and STORAGE-free are independent gates and this one
  // is reported on its own terms.
  {
    const gib = data.dbBytes / 1024 ** 3;
    const warn = WARN_THRESHOLDS.neonStorageGB;
    const freeStatus: Rag = gib >= NEON_FREE_TIER_GIB ? 'RED' : gib >= warn ? 'YELLOW' : 'GREEN';
    const verdict =
      freeStatus === 'RED'
        ? `OVER the ${NEON_FREE_TIER_GIB} GiB Free ceiling`
        : freeStatus === 'YELLOW'
          ? `over the ${warn} GiB warning line, under the Free ceiling`
          : `under the ${warn} GiB warning line`;
    L.push(
      `| **Neon FREE-tier storage** (hard ${NEON_FREE_TIER_GIB} GiB) | ${gib.toFixed(3)} GiB — ${verdict} | ${RAG_ICON[freeStatus]} ${freeStatus} |`,
    );
  }
  L.push(`| Max dead-tuple % (churn tables) | ${rag.maxDeadPct.toFixed(1)}% | ${RAG_ICON[rag.dims.deadTuples.rag]} ${rag.dims.deadTuples.rag} |`);
  L.push(`| Broken active media (no URL) | ${n(m.active_no_url)} | ${RAG_ICON[rag.dims.brokenMedia.rag]} ${rag.dims.brokenMedia.rag} |`);
  L.push(`| Duplicate uploads (same original, diff key) | ${n(data.dupOriginal.groups)} groups | ${RAG_ICON[rag.dims.duplicateUploads.rag]} ${rag.dims.duplicateUploads.rag} |`);
  L.push(`| R2 bucket orphan check | ${data.orphan.status} | ${data.orphan.status === 'proven' ? RAG_ICON['GREEN'] : '❔'} ${data.orphan.status === 'proven' ? 'PROVEN' : 'UNPROVEN'} |`);
  L.push('');
  L.push('> _Note: the overall RAG covers size, coverage, churn, broken media and duplicate **uploads**. It does **not** assert "no bucket orphans" unless the orphan check ran (`--r2-orphans`)._');
  L.push('');

  // Media health (public photo supply) — WARNING-ONLY. Explains why a card placeholders,
  // so cost/monitoring is never solved by suppressing images. Not part of the overall RAG.
  const mh = data.mediaHealth;
  const orph = data.orphan as { status: string; missing_from_r2?: number; orphans_in_r2?: number };
  const zeroPct = mh.public_listings ? (mh.zero_db_photos / mh.public_listings) * 100 : 0;
  L.push('## Media health — public photo supply (warning-only, not gated)');
  L.push('');
  L.push('| Metric | Value |');
  L.push('|---|---|');
  L.push(`| Public listings (idx_display_yn) | ${n(mh.public_listings)} |`);
  L.push(`| — with DB photos | ${n(mh.with_db_photos)} |`);
  L.push(`| — **zero DB photos** (placeholder candidates) | ${n(mh.zero_db_photos)} (${zeroPct.toFixed(1)}%) |`);
  L.push(`| ——— empty JSON too (genuinely photo-less → placeholder correct) | ${n(mh.zero_photo_empty_json)} |`);
  L.push(`| ——— JSON media fallback available (recoverable) | ${n(mh.zero_photo_json_recoverable)} |`);
  L.push(`| — zero active media rows / floor-plan-only | ${n(mh.zero_active_media_rows)} / ${n(mh.floorplan_only)} |`);
  L.push(`| JSON raw-first = FloorPlan (all / exposed via JSON path) | ${n(mh.json_first_floorplan)} / ${n(mh.json_first_floorplan_exposed_json_path)} |`);
  L.push(`| listing_media rows (total / active) | ${n(mh.listing_media_rows_total)} / ${n(mh.listing_media_rows_active)} |`);
  if (orph.status === 'proven') {
    L.push(`| Referenced R2 keys missing from bucket (blank-card cause) | ${n(orph.missing_from_r2 ?? 0)} |`);
    L.push(`| R2 orphans in bucket (unreferenced) | ${n(orph.orphans_in_r2 ?? 0)} |`);
  } else {
    L.push('| Referenced-missing / bucket-orphans | _run with `--r2-orphans` to measure_ |');
  }
  L.push('');
  L.push('> _WARNING-ONLY: these counts NEVER suppress Cotality pulls, media ingest, R2 upload, or display. A zero-photo listing correctly renders a placeholder; a floor plan is never the hero. Raw-first-FloorPlan is inert on the primary API (photo-first serialization) — the count tracks residual raw-order exposure on any surface reading `media[0]` directly._');
  L.push('');
  L.push(`## Warning thresholds (env-configurable, advisory — never gating)`);
  L.push('');
  L.push(`- R2 storage: **${WARN_THRESHOLDS.r2StorageGB} GB** (\`R2_STORAGE_WARNING_THRESHOLD_GB\`)`);
  L.push(`- R2 Class A ops: **${WARN_THRESHOLDS.r2ClassA.toLocaleString()}** (\`R2_CLASS_A_WARNING_THRESHOLD\`) · Class B: **${WARN_THRESHOLDS.r2ClassB.toLocaleString()}** (\`R2_CLASS_B_WARNING_THRESHOLD\`) — op counts need the Cloudflare analytics API`);
  L.push(`- Neon storage: **${WARN_THRESHOLDS.neonStorageGB} GB** (\`NEON_STORAGE_WARNING_THRESHOLD_GB\`) · Neon compute: **${WARN_THRESHOLDS.neonComputeHours || 'unset'} h** (\`NEON_COMPUTE_WARNING_THRESHOLD_HOURS\`) — compute needs the Neon API`);
  L.push('> _Defaults are documented references, NOT asserted provider limits — confirm against current provider docs/dashboard._');
  L.push('');

  // 1 + 2
  L.push('## 1–2. Neon size');
  L.push(`- **pg_database_size:** ${fmtBytes(data.dbBytes)} (${data.dbBytes.toLocaleString()} bytes)`);
  L.push('- **Synthetic/storage-billing size:** _not available via SQL_ — it is a Neon control-plane metric. Read it from the Neon console/API. **Neon plan/tier: needs account confirmation.**');
  L.push('');

  // 3
  L.push('## 3. Top tables by size');
  L.push('| Table | Total | Heap | Indexes | Toast | ~Rows |');
  L.push('|---|--:|--:|--:|--:|--:|');
  for (const t of data.topTables) {
    L.push(
      `| ${t.table_name} | ${fmtBytes(n(t.total_bytes))} | ${fmtBytes(n(t.heap_bytes))} | ${fmtBytes(n(t.index_bytes))} | ${fmtBytes(n(t.toast_bytes))} | ${n(t.est_rows).toLocaleString()} |`,
    );
  }
  L.push('');

  // 4
  L.push('## 4. Dead-tuple estimates');
  L.push('| Table | Live | Dead | Dead % | Last autovacuum | Last analyze |');
  L.push('|---|--:|--:|--:|---|---|');
  for (const d of data.deadTuples) {
    const av = d.last_autovacuum ? new Date(d.last_autovacuum).toISOString().slice(0, 16) : '—';
    const an = d.last_analyze ? new Date(d.last_analyze).toISOString().slice(0, 16) : '—';
    L.push(`| ${d.table_name} | ${n(d.live).toLocaleString()} | ${n(d.dead).toLocaleString()} | ${n(d.dead_pct).toFixed(1)}% | ${av} | ${an} |`);
  }
  L.push('');

  // 5–10
  L.push('## 5–10. listing_media R2 coverage');
  const totalRows = n(m.total_rows);
  const activeRows = n(m.active_rows);
  L.push(`- **5. Total media rows:** ${totalRows.toLocaleString()} (active: ${activeRows.toLocaleString()}, deleted/tombstoned: ${n(m.deleted_rows).toLocaleString()})`);
  L.push(`- **6. Rows with r2_key:** ${n(m.with_r2_key).toLocaleString()} (${pct(n(m.with_r2_key), totalRows).toFixed(1)}% of all)`);
  L.push(`- **7. Rows with media_url_cached:** ${n(m.with_cached).toLocaleString()} (${pct(n(m.with_cached), totalRows).toFixed(1)}% of all)`);
  L.push(`- **8. Rows missing r2_key:** ${n(m.missing_r2_key).toLocaleString()} total · ${n(m.active_missing_r2_key).toLocaleString()} of them active`);
  L.push(`- **9. primary_photo_r2_key coverage:** ${n(p.with_primary_r2).toLocaleString()}/${n(p.total_listings).toLocaleString()} listings (${pct(n(p.with_primary_r2), n(p.total_listings)).toFixed(1)}%); of listings with photos: ${n(p.photos_with_primary_r2).toLocaleString()}/${n(p.listings_with_photos).toLocaleString()} (${pct(n(p.photos_with_primary_r2), n(p.listings_with_photos)).toFixed(1)}%). _Informational — this column is not consumed by any public reader (readers use listing_media directly)._`);
  L.push(`- **10. Frontend would proxy Trestle (active, cached IS NULL, original present):** ${n(m.active_proxy_fallback).toLocaleString()} rows (${rag.proxyFallbackPct.toFixed(2)}% of active). Broken (no URL at all): ${n(m.active_no_url).toLocaleString()}.`);
  L.push('');

  // 11
  L.push('## 11. listings raw_data (toast)');
  const listingsRow = data.topTables.find((t) => t.table_name === 'listings');
  L.push(`- **listings table toast (all Json columns, dominated by raw_data):** ${listingsRow ? fmtBytes(n(listingsRow.toast_bytes)) : 'n/a'}`);
  if (data.rawDataBytes !== null) {
    L.push(`- **Precise raw_data on-disk size (\`--deep\` scan):** ${fmtBytes(data.rawDataBytes)}`);
  } else {
    L.push('- _Run with `--deep` for a precise per-column `sum(pg_column_size(raw_data))` (full table scan; costs some compute)._');
  }
  L.push('');

  // 12
  L.push('## 12. audit_events');
  const auditRow = data.topTables.find((t) => t.table_name === 'audit_events');
  const oldest = data.audit.oldest ? new Date(data.audit.oldest).toISOString().slice(0, 10) : '—';
  const newest = data.audit.newest ? new Date(data.audit.newest).toISOString().slice(0, 10) : '—';
  L.push(`- **Rows:** ${n(data.audit.row_count).toLocaleString()} · **Range:** ${oldest} → ${newest}`);
  L.push(`- **Size:** ${auditRow ? fmtBytes(n(auditRow.total_bytes)) : 'n/a'}`);
  L.push('- _Retention assumption (unapproved): 12 months minimum. Actual prune policy is a pending compliance decision — this report does not prune._');
  L.push('');

  // 13
  L.push('## 13. Terminal/closed listing media');
  const term = data.terminal;
  L.push(`- **Terminal statuses:** ${data.terminalStatuses.join(', ')}`);
  L.push(`- **Listings in terminal status with media:** ${n(term.listings).toLocaleString()}`);
  L.push(`- **Media rows on terminal listings:** ${n(term.media_rows).toLocaleString()} (active: ${n(term.active_media_rows).toLocaleString()})`);
  L.push(`- **Terminal-listing media still holding an R2 object (r2_key present):** ${n(term.with_r2_key).toLocaleString()} (active: ${n(term.active_with_r2).toLocaleString()}, tombstoned/deleted: ${n(term.deleted_with_r2).toLocaleString()}) — these are the objects a future R2 lifecycle/retention policy would evaluate. **No deletion performed.**`);
  const totalR2 = n(data.media.with_r2_key);
  L.push(`- **Share of all R2-referencing media that is on terminal listings:** ${pct(n(term.with_r2_key), totalR2).toFixed(1)}% (${n(term.with_r2_key).toLocaleString()}/${totalR2.toLocaleString()}) → **retention/lifecycle candidate; do not delete yet.**`);
  L.push('');

  // 15 — duplicate / redundancy checks
  const dk = data.dupKey;
  const dks = data.dupKeyByStatus;
  const adk = data.activeDupKey;
  const dorig = data.dupOriginal;
  const dslot = data.dupSlot;
  L.push('## 15. R2 duplicate / redundancy checks (DB-level)');
  L.push(
    `> **Key nuance:** \`r2_key\` is deterministic (\`{folder}/{listingId}/{order}.jpg\`), so multiple DB rows with the **same key point to ONE R2 object**. DB-row duplicates therefore do **not** multiply R2 storage — they are mostly tombstoned history rows sharing a key with their live replacement. The check that detects real wasted storage is #2 (same original under different keys).`,
  );
  L.push('');
  L.push('**1. Duplicate `r2_key` groups (any status):**');
  L.push(`- Rows with a key: ${n(dk.rows_with_key).toLocaleString()} · Distinct keys: ${n(dk.distinct_keys).toLocaleString()}`);
  L.push(`- Duplicate groups: ${n(dk.dup_groups).toLocaleString()} · Rows beyond first: ${n(dk.dup_rows_beyond_first).toLocaleString()} · Largest group: ${n(dk.max_group_size)}`);
  L.push(`- Group makeup → **mixed active+tombstone: ${n(dks.groups_mixed).toLocaleString()}** (by-design key reuse), active-only: ${n(dks.groups_active_only).toLocaleString()}, deleted-only: ${n(dks.groups_deleted_only).toLocaleString()}`);
  L.push(`- **Genuine ACTIVE-vs-ACTIVE key sharing (multiple live rows → same object):** ${n(adk.active_dup_groups).toLocaleString()} groups, ${n(adk.active_dup_rows_beyond_first).toLocaleString()} redundant active rows (${pct(n(adk.active_dup_rows_beyond_first), n(data.media.active_rows)).toFixed(2)}% of active). Same key = same object, so no R2 storage waste — a DB-row dedup opportunity only.`);
  L.push('');
  L.push('**2. Same original image under DIFFERENT keys (the real re-upload/storage-waste signal):**');
  L.push(`- Groups: ${n(dorig.groups).toLocaleString()} · Rows involved: ${n(dorig.rows_involved).toLocaleString()} · Max distinct keys/original: ${n(dorig.max_distinct_keys)}`);
  L.push(`- ${n(dorig.groups) === 0 ? '🟢 **Zero** — no regenerated-key duplicate uploads; R2 storage is not inflated by re-uploads.' : '🟡 Non-zero — investigate regenerated keys.'}`);
  L.push('');
  L.push('**3. Same listing / order / media_type among active rows:**');
  L.push(`- Groups: ${n(dslot.groups).toLocaleString()} · Extra rows: ${n(dslot.extra_rows).toLocaleString()} · Largest group: ${n(dslot.max_group)}`);
  L.push('');
  if (data.topDupGroups.length > 0) {
    L.push('**Top duplicate `r2_key` groups (up to 25):**');
    L.push('| r2_key | rows | active | listing_ids | types | statuses |');
    L.push('|---|--:|--:|---|---|---|');
    for (const g of data.topDupGroups) {
      L.push(
        `| \`${g.r2_key}\` | ${n(g.cnt)} | ${n(g.active_cnt)} | ${(g.listing_ids || []).join(', ')} | ${(g.media_types || []).join(', ')} | ${(g.statuses || []).join(', ')} |`,
      );
    }
    L.push('');
  }

  // 16 — true bucket orphan check
  L.push('## 16. True R2 bucket orphan check');
  const o = data.orphan;
  if (o.status === 'proven') {
    L.push(`- **Status: 🟢 PROVEN** (bucket listed read-only).`);
    L.push(`- **Scope:** ${o.scope}. Objects outside these prefixes are counted, **not** classified as orphans.`);
    L.push(`- Bucket objects: ${o.bucket_objects.toLocaleString()} · Bucket size: ${fmtBytes(o.bucket_bytes)} → in-scope: ${o.in_scope_objects.toLocaleString()} · out-of-scope: ${o.out_of_scope_objects.toLocaleString()}`);
    L.push(`- DB-referenced listing-media keys (r2_key + primary + cached-derived): ${o.db_referenced_keys.toLocaleString()}`);
    L.push(`- **Orphans in R2 (in-scope object with no DB reference): ${o.orphans_in_r2.toLocaleString()}** · **Missing from R2 (in-scope DB key with no object): ${o.missing_from_r2.toLocaleString()}**`);
    if (o.orphan_sample.length) L.push(`- Orphan sample: ${o.orphan_sample.map((k) => `\`${k}\``).join(', ')}`);
    if (o.missing_sample.length) L.push(`- Missing sample: ${o.missing_sample.map((k) => `\`${k}\``).join(', ')}`);
    if (o.out_of_scope_sample.length) L.push(`- Out-of-scope sample (other subsystems — not evaluated): ${o.out_of_scope_sample.map((k) => `\`${k}\``).join(', ')}`);
    L.push(`- ${o.note}`);
  } else {
    L.push(`- **Status: ❔ ${o.status.toUpperCase()} — NOT PROVEN.** ${o.note}`);
    L.push('- ⚠️ This report makes **no claim** that R2 is free of orphans. DB-level checks (§15) cannot see objects that exist in the bucket with no DB row.');
  }
  L.push('');

  // 17 — free-tier status
  L.push('## 17. Free-tier status');
  const dbGiB = data.dbBytes / 1024 ** 3;
  L.push('**A. Neon**');
  L.push(`- Measured DB size: **${fmtBytes(data.dbBytes)}** (${dbGiB.toFixed(3)} GiB).`);
  L.push(`- **Neon plan/tier: needs account confirmation — do not guess.** If the project is on the strict free plan (${NEON_FREE_TIER_GIB} GiB storage), it is **at/near the edge, not comfortably free**. The 16 TiB branch limit seen in the API suggests a paid/Launch tier, in which case size cost is negligible — but this must be confirmed in the Neon dashboard.`);
  L.push('');
  L.push('**B. Cloudflare R2** (Standard free tier: 10 GB-month storage · 1M Class-A ops/mo · 10M Class-B ops/mo · free egress)');
  if (o.status === 'proven') {
    const usedGB = o.bucket_bytes / 1000 ** 3;
    L.push(`- Actual bucket storage: **${fmtBytes(o.bucket_bytes)}** (~${usedGB.toFixed(2)} GB of ${R2_FREE_TIER.storageGB} GB free → ${((usedGB / R2_FREE_TIER.storageGB) * 100).toFixed(1)}% of storage allowance).`);
    L.push('- **Class-A/B operation counts are NOT derivable from the S3 API** — read them from Cloudflare analytics to complete the free-tier picture.');
  } else {
    L.push('- **R2 free-tier status cannot be proven from DB row counts alone.** Bucket byte size + monthly Class-A/B op counts are required (run `--r2-orphans` for actual storage bytes; ops counts need Cloudflare analytics). Any estimate from row counts is advisory only, not proof.');
  }
  L.push('');

  L.push('---');
  L.push(`_R2 config present in env: **${data.r2Configured ? 'yes' : 'NO'}**. Thresholds are advisory (see \`scripts/storage-health-monitor.ts\` RAG_THRESHOLDS). This tool is strictly read-only; it neither writes to Neon nor mutates R2._`);
  return L.join('\n');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const data = await collect();
  const rag = computeRag(data);

  if (asJson) {
    const out = JSON.stringify(
      {
        generated_at: generatedAt,
        read_only: true,
        overall: rag.overall,
        rag: rag.dims,
        db_bytes: data.dbBytes,
        synthetic_storage: 'unavailable_via_sql_see_neon_console',
        neon_plan: 'needs_account_confirmation',
        top_tables: data.topTables.map((t) => ({
          table: t.table_name,
          total: n(t.total_bytes),
          heap: n(t.heap_bytes),
          indexes: n(t.index_bytes),
          toast: n(t.toast_bytes),
          est_rows: n(t.est_rows),
        })),
        dead_tuples: data.deadTuples.map((d) => ({
          table: d.table_name,
          live: n(d.live),
          dead: n(d.dead),
          dead_pct: n(d.dead_pct),
        })),
        media: Object.fromEntries(Object.entries(data.media).map(([k, v]) => [k, n(v)])),
        primary_photo: Object.fromEntries(Object.entries(data.primary).map(([k, v]) => [k, n(v)])),
        audit_events: {
          rows: n(data.audit.row_count),
          oldest: data.audit.oldest,
          newest: data.audit.newest,
        },
        terminal_media: Object.fromEntries(Object.entries(data.terminal).map(([k, v]) => [k, n(v)])),
        raw_data_bytes: data.rawDataBytes,
        r2_configured: data.r2Configured,
        // R2 duplicate / redundancy (DB-level)
        duplicate_r2_key_groups: n(data.dupKey.dup_groups),
        duplicate_r2_rows: n(data.dupKey.dup_rows_beyond_first),
        duplicate_r2_key_by_status: Object.fromEntries(
          Object.entries(data.dupKeyByStatus).map(([k, v]) => [k, n(v)]),
        ),
        active_dup_r2_groups: n(data.activeDupKey.active_dup_groups),
        active_dup_r2_rows: n(data.activeDupKey.active_dup_rows_beyond_first),
        duplicate_original_url_groups: n(data.dupOriginal.groups),
        duplicate_listing_slot_groups: n(data.dupSlot.groups),
        terminal_r2_rows: n(data.terminal.with_r2_key),
        top_duplicate_groups: data.topDupGroups.map((g) => ({
          r2_key: g.r2_key,
          rows: n(g.cnt),
          active: n(g.active_cnt),
          listing_ids: g.listing_ids,
          media_ids: g.media_ids,
          media_types: g.media_types,
          statuses: g.statuses,
        })),
        r2_orphan_check_status: data.orphan.status === 'proven' ? 'proven' : 'unavailable',
        r2_orphan_check: data.orphan,
        media_health: data.mediaHealth,
        warning_thresholds: WARN_THRESHOLDS,
        free_tier_status: {
          neon: {
            measured_bytes: data.dbBytes,
            plan: 'needs_account_confirmation',
            strict_free_gib: NEON_FREE_TIER_GIB,
          },
          r2:
            data.orphan.status === 'proven'
              ? {
                  status: 'storage_proven_ops_needs_metrics',
                  bucket_bytes: data.orphan.bucket_bytes,
                  free_storage_gb: R2_FREE_TIER.storageGB,
                }
              : { status: 'needs_account_metrics', free_tier: R2_FREE_TIER },
        },
      },
      null,
      2,
    );
    process.stdout.write(out + '\n');
  } else {
    const md = renderMarkdown(data, rag, generatedAt);
    process.stdout.write(md + '\n');
    if (OUT_PATH) {
      const fs = await import('node:fs');
      fs.writeFileSync(OUT_PATH, md + '\n', 'utf8');
      console.warn(`\n[storage-health] markdown written to ${OUT_PATH}`);
    }
  }

  await prisma.$disconnect();
  if (strict && rag.overall === 'RED') process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('[storage-health: ERROR]', e);
  prisma.$disconnect().finally(() => process.exit(2));
});
