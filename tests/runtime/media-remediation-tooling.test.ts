/**
 * #525 re-derivation (2026-07-19) — bounded read-only media audit + dry-run.
 *
 * Every dependency is MOCKED — no production Neon, Cotality, or R2 connection
 * is made anywhere in this suite (the tsx toolchain checks run with a stub
 * DATABASE_URL and only IMPORT modules behind entry guards).
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  runAudit, probeListingMedia, buildInventoryRow, withBoundedRetries,
  classifyCotalityRowStrict, emptyCheckpoint, DEFAULT_BUDGETS,
} = require('@/scripts/audit/media-coverage-audit');
const {
  runDryRun, planListing, normalizeSourceUrl,
} = require('@/scripts/backfill/bucket-b-media-dry-run');
const { isMallanExclusiveListing } = require('@/lib/listings/exclusive-agent-assignment');
const { buildMediaR2Key } = require('@/lib/media/media-sync-service');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ─── fixtures ───────────────────────────────────────────────────────────────

const photoRow = (order: number, over: Record<string, unknown> = {}) => ({
  media_url_original: `https://cdn.example/p${order}.jpg`,
  media_url_cached: null,
  media_type: 'Photo',
  media_category: 'Photo',
  media_classification: null,
  order,
  preferred_photo_yn: false,
  status: 'active',
  ...over,
});

const auditRow = (over: Record<string, unknown> = {}) => ({
  listing_id: 'RLS20100000',
  rls_eligible: true,
  status: 'Active',
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  media: [],
  _count: { listing_media: 0 },
  listing_media: [],
  ...over,
});

const dryRow = (over: Record<string, unknown> = {}) => ({
  listing_id: 'RLS20100000',
  rls_eligible: true,
  status: 'Active',
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  media: [],
  _count: { listing_media: 0 },
  listing_media_active: [],
  listing_media_all: [],
  ...over,
});

const tightBudgets = (over: Record<string, unknown> = {}) => ({
  pageSize: 2, maxListings: 100, maxCotalityProbes: 100, maxCotalityRequests: 100,
  cotalityConcurrency: 1, maxMediaPagesPerListing: 5, runTimeBudgetMs: 60_000, ...over,
});

/** Keyset page reader over an in-memory listing set (records every call). */
function pagedReader(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ cursor: string | null; pageSize: number }> = [];
  return {
    calls,
    reader: {
      fetchPage: async (cursor: string | null, pageSize: number) => {
        calls.push({ cursor, pageSize });
        const sorted = [...rows].sort((a, b) => String(a.listing_id).localeCompare(String(b.listing_id)));
        const start = cursor ? sorted.findIndex((r) => String(r.listing_id) > cursor) : 0;
        return start < 0 ? [] : sorted.slice(start === -1 ? sorted.length : start, (start === -1 ? sorted.length : start) + pageSize);
      },
    },
  };
}

/** Mock Cotality reader: resolves listingId → KEY-<id>, serves media pages. */
function mockCotality(opts: {
  pages?: Array<{ rows: Array<Record<string, unknown>>; nextLink?: string | null }>;
  propertyError?: string;
  pageErrorAt?: number;
} = {}) {
  const log: string[] = [];
  let pageIdx = 0;
  return {
    log,
    reader: {
      resolvePropertyKey: async (listingId: string) => {
        log.push(`property:${listingId}`);
        if (opts.propertyError) return { error: opts.propertyError };
        return { listingKey: `KEY-${listingId}` };
      },
      buildFirstMediaUrl: (listingKey: string) => {
        log.push(`firstUrl:${listingKey}`);
        return `mock://media?key=${listingKey}&page=0`;
      },
      fetchMediaPage: async (url: string) => {
        log.push(`page:${url}`);
        const i = pageIdx++;
        if (opts.pageErrorAt === i) return { error: `injected page ${i} error` };
        const p = (opts.pages || [{ rows: [] }])[i] || { rows: [] };
        return { rows: p.rows as never, nextLink: p.nextLink ?? null };
      },
    },
  };
}

const cPhoto = (order: number, over: Record<string, unknown> = {}) => ({
  mediaKey: `MK-${order}`, mediaCategory: 'Photo', mediaType: 'Photo',
  order, mediaUrl: `https://cdn.example/c${order}.jpg`, ...over,
});

// ─── toolchain — executable under Node 20 / real tsx ────────────────────────

describe('toolchain — tsx wiring and startability', () => {
  it('package.json wires tsx scripts for audit + dry-run', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['media:audit']).toContain('tsx scripts/audit/media-coverage-audit.cli.ts');
    expect(pkg.scripts['media:audit:cotality']).toContain('--with-cotality');
    expect(pkg.scripts['media:backfill:dryrun']).toContain('tsx scripts/backfill/bucket-b-media-dry-run.cli.ts');
  });

  it('logic modules AND cli modules load under real tsx with mocked env — no production connection', () => {
    // The CLIs are entry-guarded (import.meta.url check) so importing them
    // executes nothing. DATABASE_URL is a stub — Prisma instantiates lazily
    // and no connection is made; no Cotality call happens on import. tsx is
    // invoked directly via node (no shell, no npx) for Windows safety.
    const driver = path.join(ROOT, '.tmp-525-toolchain-driver.mts');
    fs.writeFileSync(driver, [
      "import * as a from './scripts/audit/media-coverage-audit';",
      "import * as b from './scripts/backfill/bucket-b-media-dry-run';",
      "import * as c from './scripts/audit/media-coverage-audit.cli';",
      "import * as d from './scripts/backfill/bucket-b-media-dry-run.cli';",
      "const ok = typeof a.runAudit === 'function' && typeof b.runDryRun === 'function'",
      "  && typeof c.main === 'function' && typeof d.main === 'function';",
      "process.exit(ok ? 0 : 3);",
    ].join('\n'), 'utf8');
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), driver], {
        cwd: ROOT,
        env: {
          ...process.env,
          DATABASE_URL: 'postgresql://stub:stub@localhost:5432/stub?schema=public',
          DATABASE_URL_UNPOOLED: 'postgresql://stub:stub@localhost:5432/stub?schema=public',
        },
        timeout: 120_000,
      });
    } finally {
      fs.unlinkSync(driver);
    }
  }, 150_000);
});

// ─── read-only guarantee — no mutation reachable ────────────────────────────

describe('read-only guarantee — no mutation or R2 write reachable', () => {
  const files = [
    'lib/media/media-coverage-bucket.ts',
    'scripts/audit/media-coverage-audit.ts',
    'scripts/audit/media-coverage-audit.cli.ts',
    'scripts/backfill/bucket-b-media-dry-run.ts',
    'scripts/backfill/bucket-b-media-dry-run.cli.ts',
  ];
  const FORBIDDEN = [
    '.create(', '.createMany(', '.update(', '.updateMany(', '.upsert(',
    '.delete(', '.deleteMany(', '$executeRaw', '$queryRaw', '$transaction',
    'PutObject', 'DeleteObject', 'CopyObject', 'S3Client', '.put(', '--apply',
  ];
  it('no framework file references a Prisma mutation, raw SQL, or an R2 write', () => {
    for (const f of files) {
      const src = read(f);
      for (const tok of FORBIDDEN) {
        expect({ file: f, token: tok, present: src.includes(tok) }).toEqual({ file: f, token: tok, present: false });
      }
    }
  });
  it('the injected reader interfaces expose ONLY read methods', () => {
    const audit = read('scripts/audit/media-coverage-audit.ts');
    const listingIface = audit.slice(audit.indexOf('interface ListingPageReader'), audit.indexOf('}', audit.indexOf('interface ListingPageReader')));
    expect(listingIface).toContain('fetchPage');
    expect(listingIface.match(/\b\w+\(/g)!.filter((m) => m !== 'fetchPage(').length).toBe(0);
    const cotalityIface = audit.slice(audit.indexOf('interface CotalityMediaReader'), audit.indexOf('\n}\n', audit.indexOf('interface CotalityMediaReader')));
    for (const method of ['resolvePropertyKey', 'buildFirstMediaUrl', 'fetchMediaPage']) expect(cotalityIface).toContain(method);
    for (const tok of FORBIDDEN) expect(cotalityIface.includes(tok)).toBe(false);
  });
  it('no production cron/route/workflow runs the audit automatically', () => {
    const pkg = JSON.parse(read('package.json'));
    const wired = Object.values(pkg.scripts as Record<string, string>).filter((s) => s.includes('media-coverage-audit') || s.includes('bucket-b-media-dry-run'));
    expect(wired).toHaveLength(3); // exactly the three manual npm scripts, nothing else
  });
});

// ─── canonical ownership (PR #539 parity) ───────────────────────────────────

describe('canonical ownership — delegation matches PR #539', () => {
  it('the bucket module and audit module import the REAL canonical helper', () => {
    expect(read('lib/media/media-coverage-bucket.ts')).toContain("from '@/lib/listings/exclusive-agent-assignment'");
    expect(read('scripts/audit/media-coverage-audit.ts')).toContain("from '@/lib/listings/exclusive-agent-assignment'");
  });
  it('inventory ownership equals the real canonical helper for every signal shape', () => {
    for (const { id, rls } of [
      { id: 'SL-0004', rls: null }, { id: 'RL-0007', rls: true }, { id: 'sl-0004', rls: null },
      { id: 'RLS20100000', rls: true }, { id: 'C-1001', rls: false }, { id: '', rls: null },
    ]) {
      const rec = buildInventoryRow(auditRow({ listing_id: id || 'X', rls_eligible: rls }), { status: 'unknown', reason: 't' });
      const canonical = isMallanExclusiveListing({ listing_id: id || 'X', rls_eligible: rls });
      expect({ id, ownership: rec.ownership }).toEqual({ id, ownership: canonical ? 'mallan-owned' : 'third-party' });
    }
  });
  it('agent_id / owner_client_id cannot change ownership — no such field exists on any input shape', () => {
    for (const f of ['lib/media/media-coverage-bucket.ts', 'scripts/audit/media-coverage-audit.ts', 'scripts/backfill/bucket-b-media-dry-run.ts']) {
      const src = read(f);
      expect(src.includes('agent_id: ')).toBe(false);
      expect(src.includes('owner_client_id: ')).toBe(false);
    }
  });
});

// ─── bounded Neon reading ───────────────────────────────────────────────────

describe('bounded Neon reading — cursor pages, limits, checkpoint resume', () => {
  const sixListings = ['RLSA', 'RLSB', 'RLSC', 'RLSD', 'RLSE', 'RLSF'].map((id) =>
    auditRow({ listing_id: id, listing_media: [photoRow(1)] }));

  it('cursor pagination walks multiple pages to completion (deterministic keyset)', async () => {
    const { reader, calls } = pagedReader(sixListings);
    const res = await runAudit({ listings: reader, budgets: tightBudgets() });
    expect(res.processed).toBe(6);
    expect(res.complete).toBe(true);
    expect(calls.map((c) => c.cursor)).toEqual([null, 'RLSB', 'RLSD', 'RLSF']);
  });

  it('maximum-row cutoff stops safely and reports INCOMPLETE', async () => {
    const { reader } = pagedReader(sixListings);
    const res = await runAudit({ listings: reader, budgets: tightBudgets({ maxListings: 3 }) });
    expect(res.processed).toBe(3);
    expect(res.complete).toBe(false);
    expect(res.incompleteReasons.join(' ')).toContain('max-listings');
  });

  it('time budget stops safely and reports INCOMPLETE', async () => {
    const { reader } = pagedReader(sixListings);
    let t = 0;
    const res = await runAudit({
      listings: reader,
      budgets: tightBudgets({ runTimeBudgetMs: 5 }),
      now: () => { t += 4; return t; }, // exceeds 5ms after the first page
    });
    expect(res.complete).toBe(false);
    expect(res.incompleteReasons.join(' ')).toContain('time budget');
    expect(res.processed).toBeLessThan(6);
  });

  it('checkpoint resume continues from the cursor and never repeats completed pages', async () => {
    const first = pagedReader(sixListings);
    const saved: unknown[] = [];
    const run1 = await runAudit({
      listings: first.reader,
      budgets: tightBudgets({ maxListings: 4 }),
      saveCheckpoint: (cp: unknown) => { saved.push(JSON.parse(JSON.stringify(cp))); },
    });
    expect(run1.complete).toBe(false);
    expect(run1.checkpoint.cursor).toBe('RLSD');

    const second = pagedReader(sixListings);
    const run2 = await runAudit({
      listings: second.reader,
      budgets: tightBudgets(),
      checkpoint: run1.checkpoint,
    });
    // Resumed run only fetches AFTER the checkpoint cursor — no repeated pages.
    expect(second.calls.every((c) => c.cursor !== null && c.cursor >= 'RLSD')).toBe(true);
    expect(run2.processed).toBe(6); // cumulative 4 + 2
    expect(run2.complete).toBe(true);
    expect(saved.length).toBeGreaterThan(0);
  });
});

// ─── Cotality keying, pagination, budgets, retries ──────────────────────────

describe('Cotality probe — ListingKey keying, nextLink traversal, fail-closed', () => {
  it('resolves the Property ListingKey FIRST and keys Media by it', async () => {
    const { reader, log } = mockCotality({ pages: [{ rows: [cPhoto(1)] }] });
    const counters = { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
    const res = await probeListingMedia(reader, 'RLS20103891', tightBudgets(), counters);
    expect(log[0]).toBe('property:RLS20103891');
    expect(log[1]).toBe('firstUrl:KEY-RLS20103891'); // the RESOLVED key, not the RLS id
    expect(res.status).toBe('confirmed');
    expect(res.photoCount).toBe(1);
  });

  it('the real CLI reader filters Media by ResourceRecordKey and resolves Property by ListingId', () => {
    const cli = read('scripts/audit/media-coverage-audit.cli.ts');
    expect(cli).toContain("ResourceRecordKey eq '${escaped}'");
    expect(cli).toContain("ListingId eq '${escaped}'");
    expect(cli).toContain("@odata.nextLink");
    expect(cli).toContain('AbortSignal.timeout');
  });

  it('follows EVERY valid nextLink and sums the complete traversal', async () => {
    const { reader } = mockCotality({
      pages: [
        { rows: [cPhoto(1), cPhoto(2)], nextLink: 'mock://media?page=1' },
        { rows: [cPhoto(3)] },
      ],
    });
    const counters = { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
    const res = await probeListingMedia(reader, 'RLSX', tightBudgets(), counters);
    expect(res).toMatchObject({ status: 'confirmed', photoCount: 3 });
    expect(counters.requests).toBe(3); // property + 2 media pages
    expect(counters.successes).toBe(1);
  });

  it('an INCOMPLETE nextLink traversal is UNKNOWN — never a confirmed zero', async () => {
    const { reader } = mockCotality({
      pages: [{ rows: [cPhoto(1)], nextLink: 'mock://media?page=1' }],
      pageErrorAt: 1,
    });
    const counters = { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
    const res = await probeListingMedia(reader, 'RLSX', tightBudgets(), counters);
    expect(res.status).toBe('unknown');
    expect(counters.failures).toBe(1);
  });

  it('request budget exhaustion mid-walk is UNKNOWN and stops safely', async () => {
    const { reader } = mockCotality({ pages: [{ rows: [cPhoto(1)], nextLink: 'mock://p1' }, { rows: [cPhoto(2)] }] });
    const counters = { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
    const res = await probeListingMedia(reader, 'RLSX', tightBudgets({ maxCotalityRequests: 2 }), counters);
    expect(res.status).toBe('unknown');
    expect(String((res as { reason?: string }).reason)).toContain('budget');
  });

  it('the per-listing page cap is UNKNOWN (runaway-nextLink guard)', async () => {
    const { reader } = mockCotality({
      pages: Array.from({ length: 9 }, (_, i) => ({ rows: [cPhoto(i)], nextLink: `mock://p${i + 1}` })),
    });
    const counters = { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
    const res = await probeListingMedia(reader, 'RLSX', tightBudgets({ maxMediaPagesPerListing: 3 }), counters);
    expect(res.status).toBe('unknown');
  });

  it('OAuth/property failure is UNKNOWN', async () => {
    const { reader } = mockCotality({ propertyError: 'oauth failed' });
    const counters = { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
    const res = await probeListingMedia(reader, 'RLSX', tightBudgets(), counters);
    expect(res.status).toBe('unknown');
  });

  it('retries are bounded and counted', async () => {
    let attempts = 0;
    let retries = 0;
    await expect(withBoundedRetries(async () => { attempts += 1; throw new Error('x'); }, 2, () => { retries += 1; })).rejects.toThrow('x');
    expect(attempts).toBe(3);
    expect(retries).toBe(2);
    attempts = 0;
    const ok = await withBoundedRetries(async () => { attempts += 1; if (attempts < 2) throw new Error('x'); return 'ok'; }, 2, () => {});
    expect(ok).toBe('ok');
  });

  it('skipped or failed probes surface as bucket U and INCOMPLETE — never zero/D', async () => {
    const empty = auditRow({ listing_id: 'RLSEMPTY' });
    const failing = mockCotality({ propertyError: 'boom' });
    const withReader = await runAudit({ listings: pagedReader([empty]).reader, cotality: failing.reader, budgets: tightBudgets() });
    expect(withReader.inventory[0].bucket).toBe('U');
    expect(withReader.complete).toBe(false);
    const withoutReader = await runAudit({ listings: pagedReader([empty]).reader, budgets: tightBudgets() });
    expect(withoutReader.inventory[0].bucket).toBe('U');
    expect(withoutReader.counters.skipped).toBe(1);
  });
});

// ─── strict photo classification ────────────────────────────────────────────

describe('strict classification — absent/floorplan/video/unknown are never photos', () => {
  it('classifyCotalityRowStrict: absent category/type → unknown (never photo)', () => {
    expect(classifyCotalityRowStrict({ mediaCategory: null, mediaType: null })).toBe('unknown');
    expect(classifyCotalityRowStrict({ mediaCategory: '', mediaType: null })).toBe('unknown');
    expect(classifyCotalityRowStrict({ mediaCategory: 'Photo', mediaType: null })).toBe('Photo');
    expect(classifyCotalityRowStrict({ mediaCategory: 'FloorPlan', mediaType: null })).not.toBe('Photo');
    expect(classifyCotalityRowStrict({ mediaCategory: 'Video', mediaType: null })).not.toBe('Photo');
  });
  it('the probe counts ONLY strict photos', async () => {
    const { reader } = mockCotality({
      pages: [{
        rows: [
          cPhoto(1),
          cPhoto(2, { mediaCategory: 'FloorPlan', mediaType: 'FloorPlan' }),
          cPhoto(3, { mediaCategory: 'Video', mediaType: 'Video' }),
          cPhoto(4, { mediaCategory: null, mediaType: null }), // absent → NOT a photo
        ],
      }],
    });
    const counters = { requests: 0, successes: 0, failures: 0, retries: 0, skipped: 0 };
    const res = await probeListingMedia(reader, 'RLSX', tightBudgets(), counters);
    expect(res.photoCount).toBe(1);
  });
});

// ─── dry-run planner — order fidelity, actions, dedupe, exclusions ─────────

describe('dry-run planner — provider Order fidelity + full action taxonomy', () => {
  it('preserves the provider Order verbatim — including 0 and NEGATIVE — never the array index', () => {
    const plan = planListing(dryRow(), [
      { order: 7, sourceUrl: 'https://cdn.example/a.jpg', mediaKey: 'MK-A' },
      { order: -1, sourceUrl: 'https://cdn.example/b.jpg', mediaKey: 'MK-B' },
      { order: 0, sourceUrl: 'https://cdn.example/c.jpg', mediaKey: 'MK-C' },
    ]);
    expect(plan.items.map((i: { order: number }) => i.order)).toEqual([7, -1, 0]); // ≠ [0,1,2]
    expect(plan.items[0].r2Key).toBe(buildMediaR2Key(plan.listingId, 'Photo', 7));
    expect(plan.items[1].r2Key).toBe(buildMediaR2Key(plan.listingId, 'Photo', -1));
  });

  it('insert, restore, update and unchanged are ALL reachable and accurate', () => {
    const row = dryRow({
      _count: { listing_media: 3 },
      listing_media_all: [
        { id: '1', status: 'active', media_key: 'MK-SAME', media_url_original: 'https://cdn.example/same.jpg', media_url_cached: null, order: 1, media_type: 'Photo' },
        { id: '2', status: 'active', media_key: 'MK-MOVED', media_url_original: 'https://cdn.example/moved.jpg', media_url_cached: null, order: 2, media_type: 'Photo' },
        { id: '3', status: 'deleted', media_key: 'MK-GONE', media_url_original: 'https://cdn.example/gone.jpg', media_url_cached: null, order: 3, media_type: 'Photo' },
      ],
    });
    const plan = planListing(row, [
      { order: 1, sourceUrl: 'https://cdn.example/same.jpg', mediaKey: 'MK-SAME' },   // identical active → unchanged
      { order: 9, sourceUrl: 'https://cdn.example/moved.jpg', mediaKey: 'MK-MOVED' }, // active, order differs → UPDATE
      { order: 3, sourceUrl: 'https://cdn.example/gone.jpg', mediaKey: 'MK-GONE' },   // inactive match → restore
      { order: 4, sourceUrl: 'https://cdn.example/new.jpg', mediaKey: 'MK-NEW' },     // no match → insert
    ]);
    expect(plan.bucket).toBe('B_INACTIVE');
    expect({ i: plan.expectedInserts, r: plan.expectedRestores, u: plan.expectedUpdates, n: plan.unchangedMatches })
      .toEqual({ i: 1, r: 1, u: 1, n: 1 });
    const update = plan.items.find((x: { action: string }) => x.action === 'update');
    expect(update.changedFields).toContain('order');
    expect(update.matchedByMediaKey).toBe(true);
  });

  it('suppresses duplicate insert proposals (same normalized URL / mediaKey / claimed row)', () => {
    const row = dryRow({
      _count: { listing_media: 1 },
      listing_media_all: [
        { id: '1', status: 'deleted', media_key: null, media_url_original: 'https://cdn.example/x.jpg?sig=old', media_url_cached: null, order: 1, media_type: 'Photo' },
      ],
    });
    const plan = planListing(row, [
      { order: 1, sourceUrl: 'https://cdn.example/x.jpg?sig=new1', mediaKey: null }, // matches inactive by normalized URL → restore
      { order: 2, sourceUrl: 'https://cdn.example/x.jpg?sig=new2', mediaKey: null }, // SAME normalized URL → suppressed
    ]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action).toBe('restore');
    expect(plan.expectedInserts).toBe(0); // an inactive row representing the item never becomes a duplicate insert
    expect(normalizeSourceUrl('https://cdn.example/x.jpg?sig=a')).toBe(normalizeSourceUrl('HTTPS://cdn.example/x.jpg?sig=b'));
  });

  it('Mallan-owned, hidden, and already-served listings can NEVER enter Bucket B', async () => {
    const cot = mockCotality({ pages: [{ rows: [cPhoto(1)] }, { rows: [cPhoto(1)] }, { rows: [cPhoto(1)] }] });
    const rows = [
      dryRow({ listing_id: 'SL-0009' }),                                    // Mallan CRM — excluded
      dryRow({ listing_id: 'RLSHIDDEN', idx_display_yn: false }),           // hidden — excluded (not even probed)
      dryRow({ listing_id: 'RLSSERVED', listing_media_active: [photoRow(1)] }), // already served — excluded
      dryRow({ listing_id: 'RLSOK' }),                                      // genuine Bucket B
    ];
    const res = await runDryRun({ candidates: pagedReader(rows).reader, cotality: cot.reader, budgets: tightBudgets() });
    expect(res.plans.map((p: { listingId: string }) => p.listingId)).toEqual(['RLSOK']);
    // Mallan listing was probed then rejected by the shared classifier guard
    // (or pre-filtered) — either way it can never be planned:
    expect(res.plans.some((p: { listingId: string }) => p.listingId === 'SL-0009')).toBe(false);
  });

  it('dry-run budgets: probe cap and UNKNOWN probes produce INCOMPLETE, never plans', async () => {
    const failing = mockCotality({ propertyError: 'timeout' });
    const rows = [dryRow({ listing_id: 'RLS1' }), dryRow({ listing_id: 'RLS2' })];
    const res = await runDryRun({ candidates: pagedReader(rows).reader, cotality: failing.reader, budgets: tightBudgets({ maxCotalityProbes: 1 }) });
    expect(res.plans).toHaveLength(0);
    expect(res.complete).toBe(false);
    expect(res.counters.failures).toBe(1);
    expect(res.counters.skipped).toBe(1);
  });
});

// ─── RLS20103891 stays UNKNOWN without its own completed probe ─────────────

describe('RLS20103891 — UNKNOWN unless individually and completely probed', () => {
  it('without its own successful probe the listing is bucket U (never inferred from other samples)', async () => {
    const row = auditRow({ listing_id: 'RLS20103891' });
    const res = await runAudit({ listings: pagedReader([row]).reader, budgets: tightBudgets() });
    expect(res.inventory[0]).toMatchObject({ listingId: 'RLS20103891', bucket: 'U' });
  });
  it('only its OWN completed probe can move it out of U', async () => {
    const row = auditRow({ listing_id: 'RLS20103891' });
    const cot = mockCotality({ pages: [{ rows: [cPhoto(1), cPhoto(2)] }] });
    const res = await runAudit({ listings: pagedReader([row]).reader, cotality: cot.reader, budgets: tightBudgets() });
    expect(cot.log[0]).toBe('property:RLS20103891'); // the probe is ITS OWN, recorded
    expect(res.inventory[0].bucket).toBe('B_NEW');
    expect(res.inventory[0].cotality).toMatchObject({ status: 'confirmed', photoCount: 2 });
  });
});

// ─── checkpoint shape sanity ────────────────────────────────────────────────

describe('checkpoint', () => {
  it('emptyCheckpoint carries cursor/tally/counters/reasons and DEFAULT_BUDGETS are conservative', () => {
    const cp = emptyCheckpoint();
    expect(cp.cursor).toBeNull();
    expect(cp.processed).toBe(0);
    expect(Object.keys(cp.tally)).toContain('U');
    expect(DEFAULT_BUDGETS.maxListings).toBeLessThanOrEqual(1000);
    expect(DEFAULT_BUDGETS.maxCotalityRequests).toBeLessThanOrEqual(500);
  });
});
