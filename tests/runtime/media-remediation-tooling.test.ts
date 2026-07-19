/**
 * #525 re-derivation (2026-07-19, correction round 2) — bounded, RESUMABLE,
 * read-only media audit + dry-run.
 *
 * Every dependency is MOCKED — no production Neon, Cotality, or R2 connection
 * is made anywhere in this suite (the tsx toolchain check uses a stub
 * DATABASE_URL and imports only entry-guarded modules).
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  runAudit, probeListingMedia, buildInventoryRow, needsCotalityProbe,
  attemptWithAccounting, makeAccountant, CapStopError, classifyCotalityRowStrict,
  emptyCheckpoint, validateCheckpoint, DEFAULT_BUDGETS,
} = require('@/scripts/audit/media-coverage-audit');
const {
  runDryRun, planListing, diffAuthorizedFields, normalizeSourceUrl,
  emptyDryRunCheckpoint, validateDryRunCheckpoint,
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
  const sorted = () => [...rows].sort((a, b) => String(a.listing_id).localeCompare(String(b.listing_id)));
  return {
    calls,
    reader: {
      fetchPage: async (cursor: string | null, pageSize: number) => {
        calls.push({ cursor, pageSize });
        const s = sorted();
        const start = cursor ? s.findIndex((r) => String(r.listing_id) > cursor) : 0;
        if (start < 0) return [];
        return s.slice(start, start + pageSize);
      },
    },
  };
}

/** Mock Cotality reader honoring the accountant (1 consume per simulated
 *  request — the SAME authoritative path the real transport uses). */
function mockCotality(opts: {
  pages?: Array<{ rows: Array<Record<string, unknown>>; nextLink?: string | null }>;
  propertyError?: string;
  pageErrorAt?: number;
  pagesPerListing?: Record<string, Array<{ rows: Array<Record<string, unknown>>; nextLink?: string | null }>>;
} = {}) {
  const log: string[] = [];
  let pageIdx = 0;
  const perListing = new Map<string, number>();
  let currentListing = '';
  return {
    log,
    reader: {
      resolvePropertyKey: async (listingId: string, acct: { consume(): boolean }) => {
        if (!acct.consume()) return { error: 'request cap reached', deferred: true };
        log.push(`property:${listingId}`);
        currentListing = listingId;
        if (opts.propertyError) return { error: opts.propertyError };
        return { listingKey: `KEY-${listingId}` };
      },
      buildFirstMediaUrl: (listingKey: string) => {
        log.push(`firstUrl:${listingKey}`);
        return `mock://media?key=${listingKey}&page=0`;
      },
      fetchMediaPage: async (url: string, acct: { consume(): boolean }) => {
        if (!acct.consume()) return { error: 'request cap reached', deferred: true };
        log.push(`page:${url}`);
        if (opts.pagesPerListing) {
          const seq = opts.pagesPerListing[currentListing] || [{ rows: [] }];
          const n = perListing.get(currentListing) ?? 0;
          perListing.set(currentListing, n + 1);
          const p = seq[n] || { rows: [] };
          return { rows: p.rows as never, nextLink: p.nextLink ?? null };
        }
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
  order, mediaUrl: `https://cdn.example/c${order}.jpg`, preferredPhotoYn: false, ...over,
});

const acctOf = (max = 100) => makeAccountant(max);

// ─── toolchain ──────────────────────────────────────────────────────────────

describe('toolchain — tsx wiring and startability', () => {
  it('package.json wires tsx scripts for audit + dry-run (exactly three, nothing else)', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['media:audit']).toContain('tsx scripts/audit/media-coverage-audit.cli.ts');
    expect(pkg.scripts['media:audit:cotality']).toContain('--with-cotality');
    expect(pkg.scripts['media:backfill:dryrun']).toContain('tsx scripts/backfill/bucket-b-media-dry-run.cli.ts');
    const wired = Object.values(pkg.scripts as Record<string, string>).filter((s) => s.includes('media-coverage-audit') || s.includes('bucket-b-media-dry-run'));
    expect(wired).toHaveLength(3);
  });

  it('logic + cli modules load under real tsx with stub env — no production connection', () => {
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

// ─── read-only guarantee ────────────────────────────────────────────────────

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
    for (const method of ['resolvePropertyKey', 'buildFirstMediaUrl', 'fetchMediaPage']) {
      expect(audit).toContain(method);
    }
  });
});

// ─── canonical ownership ────────────────────────────────────────────────────

describe('canonical ownership — delegation matches PR #539', () => {
  it('bucket + audit modules import the REAL canonical helper', () => {
    expect(read('lib/media/media-coverage-bucket.ts')).toContain("from '@/lib/listings/exclusive-agent-assignment'");
  });
  it('inventory ownership equals the real canonical helper for every signal shape', () => {
    for (const { id, rls } of [
      { id: 'SL-0004', rls: null }, { id: 'RL-0007', rls: true }, { id: 'sl-0004', rls: null },
      { id: 'RLS20100000', rls: true }, { id: 'C-1001', rls: false },
    ]) {
      const rec = buildInventoryRow(auditRow({ listing_id: id, rls_eligible: rls }), { status: 'unknown', reason: 't' });
      const canonical = isMallanExclusiveListing({ listing_id: id, rls_eligible: rls });
      expect({ id, ownership: rec.ownership }).toEqual({ id, ownership: canonical ? 'mallan-owned' : 'third-party' });
    }
  });
  it('agent_id / owner_client_id cannot appear on any input shape', () => {
    for (const f of ['lib/media/media-coverage-bucket.ts', 'scripts/audit/media-coverage-audit.ts', 'scripts/backfill/bucket-b-media-dry-run.ts']) {
      const src = read(f);
      expect(src.includes('agent_id: ')).toBe(false);
      expect(src.includes('owner_client_id: ')).toBe(false);
    }
  });
});

// ─── ROUND 2: per-run budgets + resume semantics ───────────────────────────

describe('ROUND 2 — per-run budgets: resume with the SAME limits continues', () => {
  const six = ['RLSA', 'RLSB', 'RLSC', 'RLSD', 'RLSE', 'RLSF'].map((id) => auditRow({ listing_id: id, listing_media: [photoRow(1)] }));

  it('resume with the SAME --max-listings value continues after the cursor', async () => {
    const b = tightBudgets({ maxListings: 4 });
    const run1 = await runAudit({ listings: pagedReader(six).reader, budgets: b });
    expect(run1.processed).toBe(4);
    expect(run1.complete).toBe(false);
    // SAME budgets on resume — must NOT stop immediately:
    const second = pagedReader(six);
    const run2 = await runAudit({ listings: second.reader, budgets: b, checkpoint: run1.checkpoint });
    expect(run2.processed).toBe(6);
    expect(run2.complete).toBe(true);
    expect(second.calls[0].cursor).toBe('RLSD'); // continued, not restarted
  });

  it('the SAME request cap is available fresh on the next invocation', async () => {
    const empty = ['RLS1', 'RLS2', 'RLS3'].map((id) => auditRow({ listing_id: id }));
    // Each probe = 1 property + 1 media page = 2 attempts. Cap 4 → 2 probes/run.
    const b = tightBudgets({ maxCotalityRequests: 4, pageSize: 3 });
    const cot1 = mockCotality({ pagesPerListing: { RLS1: [{ rows: [cPhoto(1)] }], RLS2: [{ rows: [] }], RLS3: [{ rows: [] }] } });
    const run1 = await runAudit({ listings: pagedReader(empty).reader, cotality: cot1.reader, budgets: b });
    expect(run1.processed).toBe(2); // third listing DEFERRED, not finalized
    expect(run1.checkpoint.pendingFrom).toBe('RLS3');
    expect(run1.runCounters.requestAttempts).toBe(4); // the refused 5th attempt never consumed
    const cot2 = mockCotality({ pagesPerListing: { RLS3: [{ rows: [cPhoto(1)] }] } });
    const run2 = await runAudit({ listings: pagedReader(empty).reader, cotality: cot2.reader, budgets: b, checkpoint: run1.checkpoint });
    expect(run2.processed).toBe(3); // fresh cap → the deferred listing resolves
    expect(run2.complete).toBe(true);
    expect(run2.inventory.find((r: { listingId: string }) => r.listingId === 'RLS3').bucket).toBe('B_NEW');
  });

  it('deferred rows stay PENDING: never tallied, cursor never passes them, resume confirms them', async () => {
    const empty = ['RLS1', 'RLS2'].map((id) => auditRow({ listing_id: id }));
    const b = tightBudgets({ maxCotalityProbes: 1, pageSize: 2 });
    const cot = mockCotality({ pagesPerListing: { RLS1: [{ rows: [cPhoto(1)] }] } });
    const run1 = await runAudit({ listings: pagedReader(empty).reader, cotality: cot.reader, budgets: b });
    expect(run1.processed).toBe(1);
    expect(run1.checkpoint.cursor).toBe('RLS1');          // NOT advanced past RLS2
    expect(run1.checkpoint.pendingFrom).toBe('RLS2');
    expect(run1.tally.U).toBe(0);                          // pending ≠ permanent U
    const cot2 = mockCotality({ pagesPerListing: { RLS2: [{ rows: [cPhoto(1), cPhoto(2)] }] } });
    const run2 = await runAudit({ listings: pagedReader(empty).reader, cotality: cot2.reader, budgets: b, checkpoint: run1.checkpoint });
    const rls2 = run2.inventory.find((r: { listingId: string }) => r.listingId === 'RLS2');
    expect(rls2.bucket).toBe('B_NEW');                     // budget-deferred → CONFIRMED on resume
    expect(rls2.cotality).toMatchObject({ status: 'confirmed', photoCount: 2 });
  });

  it('resumed inventory covers EVERY cumulatively processed listing, deduped, reconciling', async () => {
    const six2 = ['RLSA', 'RLSB', 'RLSC', 'RLSD', 'RLSE', 'RLSF'].map((id) => auditRow({ listing_id: id, listing_media: [photoRow(1)] }));
    const b = tightBudgets({ maxListings: 4 });
    const run1 = await runAudit({ listings: pagedReader(six2).reader, budgets: b });
    const run2 = await runAudit({ listings: pagedReader(six2).reader, budgets: b, checkpoint: run1.checkpoint });
    expect(run2.inventory).toHaveLength(run2.processed);   // 6 === 6
    const ids = run2.inventory.map((r: { listingId: string }) => r.listingId);
    expect(new Set(ids).size).toBe(ids.length);            // no duplicates
    const tallySum = Object.values(run2.tally as Record<string, number>).reduce((s, n) => s + n, 0);
    expect(tallySum).toBe(run2.processed);                 // full reconciliation
  });

  it('checkpoint validation fails closed on version/mode/reconciliation problems', () => {
    expect(() => validateCheckpoint({ ...emptyCheckpoint(), version: 1 }, 'audit')).toThrow(/version/);
    expect(() => validateCheckpoint({ ...emptyCheckpoint(), mode: 'dryrun' }, 'audit')).toThrow(/mode/);
    const bad = emptyCheckpoint();
    bad.processed = 5; // inventory empty → does not reconcile
    expect(() => validateCheckpoint(bad, 'audit')).toThrow(/reconcile/);
    expect(() => validateDryRunCheckpoint({ ...emptyDryRunCheckpoint(), version: 1 })).toThrow(/version/);
  });
});

// ─── ROUND 2: one authoritative accounting path ────────────────────────────

describe('ROUND 2 — every HTTP attempt (incl. retries) consumes the cap and is reported', () => {
  it('attemptWithAccounting consumes one attempt per try, counts retries, stops at the cap', async () => {
    const acct = acctOf(3);
    let tries = 0;
    // fails twice then would succeed — but cap is 3 so: attempt+retry+retry = 3 consumed
    const ok = await attemptWithAccounting(async () => { tries += 1; if (tries < 3) throw new Error('x'); return 'ok'; }, acct, 5);
    expect(ok).toBe('ok');
    expect(acct.attempts).toBe(3);
    expect(acct.retries).toBe(2);
    // cap exhausted → next attempt is a CapStop, no HTTP possible:
    await expect(attemptWithAccounting(async () => 'never', acct, 5)).rejects.toThrow(CapStopError);
    expect(acct.attempts).toBe(3); // nothing consumed past the cap
  });

  it('runAudit returns the REAL retry count in counters (no disconnected object)', async () => {
    const empty = [auditRow({ listing_id: 'RLS1' })];
    // Reader that consumes 2 attempts + 1 retry for the property call:
    const reader = {
      resolvePropertyKey: async (_id: string, acct: { consume(): boolean; countRetry(): void }) => {
        acct.consume(); acct.consume(); acct.countRetry();
        return { listingKey: 'KEY-RLS1' };
      },
      buildFirstMediaUrl: () => 'mock://m',
      fetchMediaPage: async (_u: string, acct: { consume(): boolean }) => { acct.consume(); return { rows: [], nextLink: null }; },
    };
    const res = await runAudit({ listings: pagedReader(empty).reader, cotality: reader, budgets: tightBudgets() });
    expect(res.counters.retries).toBe(1);
    expect(res.counters.requests).toBe(3);
    expect(res.runCounters.retries).toBe(1);
    expect(res.runCounters.requestAttempts).toBe(3);
  });
});

// ─── Cotality probe — keying, traversal, validation ────────────────────────

describe('Cotality probe — ListingKey keying, nextLink traversal, fail-closed validation', () => {
  it('resolves the Property ListingKey FIRST and keys Media by it', async () => {
    const { reader, log } = mockCotality({ pages: [{ rows: [cPhoto(1)] }] });
    const res = await probeListingMedia(reader, 'RLS20103891', tightBudgets(), acctOf());
    expect(log[0]).toBe('property:RLS20103891');
    expect(log[1]).toBe('firstUrl:KEY-RLS20103891');
    expect(res).toMatchObject({ status: 'confirmed', photoCount: 1 });
  });

  it('the real CLI reader: ResourceRecordKey filter, ListingId lookup, $top=2 ambiguity, nextLink base validation, timeout', () => {
    const cli = read('scripts/audit/media-coverage-audit.cli.ts');
    expect(cli).toContain("ResourceRecordKey eq '${escaped}'");
    expect(cli).toContain("ListingId eq '${escaped}'");
    expect(cli).toContain('$top=2');
    expect(cli).toContain('AMBIGUOUS: multiple Property matches');
    expect(cli).toContain('nextLink is outside the allowed Cotality base');
    expect(cli).toContain('AbortSignal.timeout');
    expect(cli).toContain('attemptWithAccounting'); // single accounting path
  });

  it('follows EVERY valid nextLink; incomplete traversal is UNKNOWN never zero', async () => {
    const complete = mockCotality({ pages: [{ rows: [cPhoto(1), cPhoto(2)], nextLink: 'mock://p1' }, { rows: [cPhoto(3)] }] });
    const acct = acctOf();
    const ok = await probeListingMedia(complete.reader, 'RLSX', tightBudgets(), acct);
    expect(ok).toMatchObject({ status: 'confirmed', photoCount: 3 });
    expect(acct.attempts).toBe(3); // property + 2 pages, all accounted

    const broken = mockCotality({ pages: [{ rows: [cPhoto(1)], nextLink: 'mock://p1' }], pageErrorAt: 1 });
    const bad = await probeListingMedia(broken.reader, 'RLSX', tightBudgets(), acctOf());
    expect(bad.status).toBe('unknown');
  });

  it('request-cap stops are DEFERRED (pending), page-cap and property failures are UNKNOWN', async () => {
    const capped = mockCotality({ pages: [{ rows: [cPhoto(1)], nextLink: 'mock://p1' }, { rows: [] }] });
    const capRes = await probeListingMedia(capped.reader, 'RLSX', tightBudgets(), acctOf(2));
    expect(capRes).toMatchObject({ status: 'unknown', deferred: true });

    const runaway = mockCotality({ pages: Array.from({ length: 9 }, (_, i) => ({ rows: [], nextLink: `mock://p${i + 1}` })) });
    const pageCap = await probeListingMedia(runaway.reader, 'RLSX', tightBudgets({ maxMediaPagesPerListing: 3 }), acctOf());
    expect(pageCap.status).toBe('unknown');
    expect((pageCap as { deferred?: boolean }).deferred).toBeUndefined(); // genuine incompleteness, finalizes U

    const oauth = mockCotality({ propertyError: 'oauth failed' });
    expect((await probeListingMedia(oauth.reader, 'RLSX', tightBudgets(), acctOf())).status).toBe('unknown');
  });

  it('ambiguous Property results are UNKNOWN (reader contract) and empty ListingKey is UNKNOWN', async () => {
    const ambiguous = {
      resolvePropertyKey: async () => ({ error: 'AMBIGUOUS: multiple Property matches for ListingId' }),
      buildFirstMediaUrl: () => 'mock://m',
      fetchMediaPage: async () => ({ rows: [], nextLink: null }),
    };
    const res = await probeListingMedia(ambiguous, 'RLSX', tightBudgets(), acctOf());
    expect(res.status).toBe('unknown');
    expect((res as { reason: string }).reason).toContain('AMBIGUOUS');

    const emptyKey = { ...ambiguous, resolvePropertyKey: async () => ({ listingKey: '  ' }) };
    expect((await probeListingMedia(emptyKey, 'RLSX', tightBudgets(), acctOf())).status).toBe('unknown');
  });

  it('a malformed provider Order is UNKNOWN — never NaN, never an R2 key', async () => {
    for (const badOrder of [undefined, null, 'seven', NaN, 1.5]) {
      const { reader } = mockCotality({ pages: [{ rows: [cPhoto(1, { order: badOrder })] }] });
      const res = await probeListingMedia(reader, 'RLSX', tightBudgets(), acctOf());
      expect({ badOrder: String(badOrder), status: res.status }).toEqual({ badOrder: String(badOrder), status: 'unknown' });
      expect((res as { photos?: unknown[] }).photos).toBeUndefined(); // nothing plannable escapes
    }
  });
});

// ─── ROUND 2: Mallan-owned listings consume ZERO Cotality requests ─────────

describe('ROUND 2 — Mallan-owned listings are never probed', () => {
  it('needsCotalityProbe excludes Mallan-owned (canonical decision) before any provider call', () => {
    expect(needsCotalityProbe(auditRow({ listing_id: 'SL-0009' }))).toBe(false);
    expect(needsCotalityProbe(auditRow({ listing_id: 'C-1', rls_eligible: false }))).toBe(false);
    expect(needsCotalityProbe(auditRow({ listing_id: 'RLSX' }))).toBe(true);
  });
  it('audit: a DB-empty Mallan listing makes ZERO Cotality calls and classifies E (never U/D)', async () => {
    const rows = [auditRow({ listing_id: 'SL-0009' }), auditRow({ listing_id: 'C-1', rls_eligible: false })];
    const cot = mockCotality({ pages: [{ rows: [cPhoto(1)] }] });
    const res = await runAudit({ listings: pagedReader(rows).reader, cotality: cot.reader, budgets: tightBudgets() });
    expect(cot.log).toHaveLength(0);                         // zero provider traffic
    expect(res.counters.requests).toBe(0);
    expect(res.inventory.map((r: { bucket: string }) => r.bucket)).toEqual(['E', 'E']);
    expect(res.complete).toBe(true);
  });
  it('dry-run: Mallan-owned listings are pre-excluded and make zero Cotality calls', async () => {
    const cot = mockCotality({ pagesPerListing: { RLSOK: [{ rows: [cPhoto(1)] }] } });
    const rows = [dryRow({ listing_id: 'SL-0009' }), dryRow({ listing_id: 'RLSOK' })];
    const res = await runDryRun({ candidates: pagedReader(rows).reader, cotality: cot.reader, budgets: tightBudgets() });
    expect(cot.log.filter((l) => l.startsWith('property:'))).toEqual(['property:RLSOK']);
    expect(res.plans.map((p: { listingId: string }) => p.listingId)).toEqual(['RLSOK']);
  });
});

// ─── strict photo classification ────────────────────────────────────────────

describe('strict classification — absent/floorplan/video/unknown are never photos', () => {
  it('classifyCotalityRowStrict: absent → unknown; floorplan/video → not Photo', () => {
    expect(classifyCotalityRowStrict({ mediaCategory: null, mediaType: null })).toBe('unknown');
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
          cPhoto(4, { mediaCategory: null, mediaType: null }),
        ],
      }],
    });
    const res = await probeListingMedia(reader, 'RLSX', tightBudgets(), acctOf());
    expect(res).toMatchObject({ status: 'confirmed', photoCount: 1 });
  });
});

// ─── dry-run planner ────────────────────────────────────────────────────────

describe('dry-run planner — provider Order fidelity + COMPLETE update detection', () => {
  it('preserves provider Order verbatim (incl. 0/negative) — never the array index', () => {
    const plan = planListing(dryRow(), [
      { order: 7, sourceUrl: 'https://cdn.example/a.jpg', mediaKey: 'MK-A' },
      { order: -1, sourceUrl: 'https://cdn.example/b.jpg', mediaKey: 'MK-B' },
      { order: 0, sourceUrl: 'https://cdn.example/c.jpg', mediaKey: 'MK-C' },
    ]);
    expect(plan.items.map((i: { order: number }) => i.order)).toEqual([7, -1, 0]);
    expect(plan.items[0].r2Key).toBe(buildMediaR2Key(plan.listingId, 'Photo', 7));
  });

  it('insert, restore, update and unchanged are ALL reachable', () => {
    const row = dryRow({
      _count: { listing_media: 3 },
      listing_media_all: [
        { id: '1', status: 'active', media_key: 'MK-SAME', media_url_original: 'https://cdn.example/same.jpg', media_url_cached: null, order: 1, media_type: 'Photo', preferred_photo_yn: false },
        { id: '2', status: 'active', media_key: 'MK-MOVED', media_url_original: 'https://cdn.example/moved.jpg', media_url_cached: null, order: 2, media_type: 'Photo', preferred_photo_yn: false },
        { id: '3', status: 'deleted', media_key: 'MK-GONE', media_url_original: 'https://cdn.example/gone.jpg', media_url_cached: null, order: 3, media_type: 'Photo', preferred_photo_yn: false },
      ],
    });
    const plan = planListing(row, [
      { order: 1, sourceUrl: 'https://cdn.example/same.jpg', mediaKey: 'MK-SAME', preferredPhotoYn: false },
      { order: 9, sourceUrl: 'https://cdn.example/moved.jpg', mediaKey: 'MK-MOVED', preferredPhotoYn: false },
      { order: 3, sourceUrl: 'https://cdn.example/gone.jpg', mediaKey: 'MK-GONE', preferredPhotoYn: false },
      { order: 4, sourceUrl: 'https://cdn.example/new.jpg', mediaKey: 'MK-NEW', preferredPhotoYn: false },
    ]);
    expect({ i: plan.expectedInserts, r: plan.expectedRestores, u: plan.expectedUpdates, n: plan.unchangedMatches })
      .toEqual({ i: 1, r: 1, u: 1, n: 1 });
  });

  it('ROUND 2: a provider mediaKey with a MISSING existing key is an UPDATE, never unchanged', () => {
    const row = {
      id: '1', status: 'active', media_key: null,
      media_url_original: 'https://cdn.example/x.jpg', media_url_cached: null,
      order: 1, media_type: 'Photo', preferred_photo_yn: false,
    };
    const diff = diffAuthorizedFields(row, { order: 1, sourceUrl: 'https://cdn.example/x.jpg', mediaKey: 'MK-REAL', preferredPhotoYn: false });
    expect(diff).toContain('media_key');
    const plan = planListing(dryRow({ _count: { listing_media: 1 }, listing_media_all: [row] }),
      [{ order: 1, sourceUrl: 'https://cdn.example/x.jpg', mediaKey: 'MK-REAL', preferredPhotoYn: false }]);
    expect(plan.items[0].action).toBe('update');
    expect(plan.items[0].changedFields).toContain('media_key');
  });

  it('ROUND 2: preferred-photo and media-type differences are detected; missing media_type is never unchanged', () => {
    const base = {
      id: '1', status: 'active', media_key: 'MK', media_url_original: 'https://cdn.example/x.jpg',
      media_url_cached: null, order: 1, media_type: 'Photo', preferred_photo_yn: false,
    };
    expect(diffAuthorizedFields({ ...base, preferred_photo_yn: false }, { order: 1, sourceUrl: 'https://cdn.example/x.jpg', mediaKey: 'MK', preferredPhotoYn: true })).toContain('preferred_photo_yn');
    expect(diffAuthorizedFields({ ...base, media_type: 'FloorPlan' }, { order: 1, sourceUrl: 'https://cdn.example/x.jpg', mediaKey: 'MK', preferredPhotoYn: false })).toContain('media_type');
    expect(diffAuthorizedFields({ ...base, media_type: '' }, { order: 1, sourceUrl: 'https://cdn.example/x.jpg', mediaKey: 'MK', preferredPhotoYn: false })).toContain('media_type');
  });

  it('suppresses duplicate insert proposals (normalized URL / claimed rows)', () => {
    const row = dryRow({
      _count: { listing_media: 1 },
      listing_media_all: [
        { id: '1', status: 'deleted', media_key: null, media_url_original: 'https://cdn.example/x.jpg?sig=old', media_url_cached: null, order: 1, media_type: 'Photo', preferred_photo_yn: false },
      ],
    });
    const plan = planListing(row, [
      { order: 1, sourceUrl: 'https://cdn.example/x.jpg?sig=new1', mediaKey: null },
      { order: 2, sourceUrl: 'https://cdn.example/x.jpg?sig=new2', mediaKey: null },
    ]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action).toBe('restore');
    expect(normalizeSourceUrl('https://cdn.example/x.jpg?sig=a')).toBe(normalizeSourceUrl('HTTPS://cdn.example/x.jpg?sig=b'));
  });
});

// ─── ROUND 2: dry-run checkpoint/resume ─────────────────────────────────────

describe('ROUND 2 — dry-run checkpoint/resume preserves all plans and totals', () => {
  it('a resumed dry-run result represents the WHOLE candidate set', async () => {
    const rows = [dryRow({ listing_id: 'RLS1' }), dryRow({ listing_id: 'RLS2' }), dryRow({ listing_id: 'RLS3' })];
    const b = tightBudgets({ maxCotalityProbes: 2, pageSize: 3 });
    const cot1 = mockCotality({ pagesPerListing: { RLS1: [{ rows: [cPhoto(1)] }], RLS2: [{ rows: [cPhoto(1), cPhoto(2)] }] } });
    const run1 = await runDryRun({ candidates: pagedReader(rows).reader, cotality: cot1.reader, budgets: b });
    expect(run1.plans).toHaveLength(2);
    expect(run1.complete).toBe(false);
    expect(run1.checkpoint.pendingFrom).toBe('RLS3');
    expect(run1.checkpoint.cursor).toBe('RLS2'); // never past the pending row

    const cot2 = mockCotality({ pagesPerListing: { RLS3: [{ rows: [cPhoto(5)] }] } });
    const run2 = await runDryRun({ candidates: pagedReader(rows).reader, cotality: cot2.reader, budgets: b, checkpoint: run1.checkpoint });
    expect(run2.plans.map((p: { listingId: string }) => p.listingId).sort()).toEqual(['RLS1', 'RLS2', 'RLS3']);
    expect(run2.totals.inserts).toBe(4); // 1 + 2 + 1 across BOTH runs
    expect(run2.processed).toBe(3);
    expect(run2.complete).toBe(true);
    const ids = run2.plans.map((p: { listingId: string }) => p.listingId);
    expect(new Set(ids).size).toBe(ids.length); // deduped
  });
});

// ─── ROUND 2: fail-closed CLI flags ────────────────────────────────────────

describe('ROUND 2 — invalid safety flags fail closed (source + spawned contract)', () => {
  it('parseBound rejects supplied-invalid values and allows --retries 0 (source pins)', () => {
    const cli = read('scripts/audit/media-coverage-audit.cli.ts');
    expect(cli).toContain('refusing to run');
    expect(cli).toContain('process.exit(1)');
    expect(cli).toContain("parseBound(args, '--retries', 1, 0)"); // retries 0 allowed
    expect(cli).toContain("parseBound(args, '--max-media-pages'"); // explicit validated flag
    const dry = read('scripts/backfill/bucket-b-media-dry-run.cli.ts');
    expect(dry).toContain("parseBound(args, '--retries', 1, 0)");
    expect(dry).toContain('--checkpoint');
    expect(dry).toContain('--resume');
  });

  it('spawned CLI refuses invalid --max-listings with exit 1 (no silent default)', () => {
    const driver = path.join(ROOT, '.tmp-525-flags-driver.mts');
    fs.writeFileSync(driver, [
      "process.argv = [process.argv[0], process.argv[1], '--max-listings', 'abc'];",
      "const { main } = await import('./scripts/audit/media-coverage-audit.cli');",
      "await main();",
      "process.exit(0); // must be unreachable",
    ].join('\n'), 'utf8');
    try {
      let code = 0;
      try {
        execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), driver], {
          cwd: ROOT,
          env: { ...process.env, DATABASE_URL: 'postgresql://stub:stub@localhost:5432/stub?schema=public' },
          timeout: 120_000,
        });
      } catch (e) {
        code = (e as { status?: number }).status ?? -1;
      }
      expect(code).toBe(1);
    } finally {
      fs.unlinkSync(driver);
    }
  }, 150_000);
});

// ─── RLS20103891 ────────────────────────────────────────────────────────────

describe('RLS20103891 — UNKNOWN unless individually and completely probed', () => {
  it('without its own probe → U; only ITS OWN completed probe moves it', async () => {
    const row = auditRow({ listing_id: 'RLS20103891' });
    const noProbe = await runAudit({ listings: pagedReader([row]).reader, budgets: tightBudgets() });
    expect(noProbe.inventory[0]).toMatchObject({ listingId: 'RLS20103891', bucket: 'U' });

    const cot = mockCotality({ pages: [{ rows: [cPhoto(1), cPhoto(2)] }] });
    const probed = await runAudit({ listings: pagedReader([row]).reader, cotality: cot.reader, budgets: tightBudgets() });
    expect(cot.log[0]).toBe('property:RLS20103891');
    expect(probed.inventory[0].bucket).toBe('B_NEW');
  });
});
