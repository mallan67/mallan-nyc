/**
 * #525 re-derivation (2026-07-19, correction round 3) — bounded, resumable,
 * identity-bound, self-repairing, read-only media audit + dry-run.
 *
 * Every dependency is MOCKED — no production Neon, Cotality, or R2 connection
 * is made anywhere in this suite (spawned tsx checks use a stub DATABASE_URL
 * and entry-guarded modules).
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  runAudit, probeListingMedia, buildInventoryRow, needsCotalityProbe,
  attemptWithAccounting, makeAccountant, CapStopError, classifyCotalityMedia, classifyCotalityRowStrict,
  isValidProviderMediaUrl, validateNextLink, identitiesMatch, validateRetryQueue,
  emptyCheckpoint, validateCheckpoint, DEFAULT_BUDGETS, CHECKPOINT_VERSION, TOOL_VERSION, MAX_UNKNOWN_RETRIES,
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

const TEST_IDENTITY = {
  schemaVersion: CHECKPOINT_VERSION, toolVersion: TOOL_VERSION, toolMode: 'audit' as const, probeMode: 'cotality' as const,
  cotalitySource: 'https://api.cotality.com/trestle', cotalityClientFingerprint: 'client000001',
  neonFingerprint: 'testfp000001', maxUnknownRetries: 3, checkpointPath: null,
};
const NEON_ONLY_IDENTITY = { ...TEST_IDENTITY, probeMode: 'neon-only' as const, cotalitySource: null, cotalityClientFingerprint: null };
const DRY_IDENTITY = { ...TEST_IDENTITY, toolMode: 'dryrun' as const };

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
  listing_id: 'RLS20100000', rls_eligible: true, status: 'Active',
  idx_display_yn: true, internet_entire_listing_display_yn: true,
  owner_opt_out: false, participant_only: false, media: [],
  _count: { listing_media: 0 }, listing_media: [], ...over,
});

const dryRow = (over: Record<string, unknown> = {}) => ({
  listing_id: 'RLS20100000', rls_eligible: true, status: 'Active',
  idx_display_yn: true, internet_entire_listing_display_yn: true,
  owner_opt_out: false, participant_only: false, media: [],
  _count: { listing_media: 0 }, listing_media_active: [], listing_media_all: [], ...over,
});

const tightBudgets = (over: Record<string, unknown> = {}) => ({
  pageSize: 2, maxListings: 100, maxCotalityProbes: 100, maxCotalityRequests: 100,
  cotalityConcurrency: 1, maxMediaPagesPerListing: 5, runTimeBudgetMs: 60_000,
  maxUnknownRetriesPerListing: 3, ...over,
});

function pagedReader(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ cursor: string | null; pageSize: number }> = [];
  const byIdCalls: string[][] = [];
  const sorted = () => [...rows].sort((a, b) => String(a.listing_id).localeCompare(String(b.listing_id)));
  return {
    calls,
    byIdCalls,
    reader: {
      fetchPage: async (cursor: string | null, pageSize: number) => {
        calls.push({ cursor, pageSize });
        const s = sorted();
        const start = cursor ? s.findIndex((r) => String(r.listing_id) > cursor) : 0;
        if (start < 0) return [];
        return s.slice(start, start + pageSize);
      },
      fetchByIds: async (ids: string[]) => {
        byIdCalls.push(ids);
        return sorted().filter((r) => ids.includes(String(r.listing_id)));
      },
    },
  };
}

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
const runTsx = (driverLines: string[], expectExit: number) => {
  const driver = path.join(ROOT, `.tmp-525-driver-${Math.abs(driverLines.join('').length)}.mts`);
  fs.writeFileSync(driver, driverLines.join('\n'), 'utf8');
  try {
    let code = 0;
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), driver], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: 'postgresql://stub:stub@localhost:5432/stub?schema=public', DATABASE_URL_UNPOOLED: 'postgresql://stub:stub@localhost:5432/stub?schema=public' },
        timeout: 120_000,
      });
    } catch (e) {
      code = (e as { status?: number }).status ?? -1;
    }
    expect(code).toBe(expectExit);
  } finally {
    fs.unlinkSync(driver);
  }
};

// ─── toolchain ──────────────────────────────────────────────────────────────

describe('toolchain — tsx wiring and startability', () => {
  it('package.json wires exactly three tsx scripts', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['media:audit']).toContain('tsx scripts/audit/media-coverage-audit.cli.ts');
    expect(pkg.scripts['media:audit:cotality']).toContain('--with-cotality');
    expect(pkg.scripts['media:backfill:dryrun']).toContain('tsx scripts/backfill/bucket-b-media-dry-run.cli.ts');
    const wired = Object.values(pkg.scripts as Record<string, string>).filter((s) => s.includes('media-coverage-audit') || s.includes('bucket-b-media-dry-run'));
    expect(wired).toHaveLength(3);
  });

  it('logic + cli modules load under real tsx with stub env — no production connection', () => {
    runTsx([
      "import * as a from './scripts/audit/media-coverage-audit';",
      "import * as b from './scripts/backfill/bucket-b-media-dry-run';",
      "import * as c from './scripts/audit/media-coverage-audit.cli';",
      "import * as d from './scripts/backfill/bucket-b-media-dry-run.cli';",
      // Node 24 exposes tsx's CommonJS-transpiled namespace under `default` /
      // `module.exports`; Node 20 also exposed its named properties at the top
      // level. Unwrap the namespace so this startability test validates the
      // actual exports instead of depending on one Node interop representation.
      "const unwrap = (mod) => mod.default ?? mod;",
      "const aa = unwrap(a), bb = unwrap(b), cc = unwrap(c), dd = unwrap(d);",
      "const ok = typeof aa.runAudit === 'function' && typeof bb.runDryRun === 'function'",
      "  && typeof cc.main === 'function' && typeof dd.main === 'function';",
      "process.exit(ok ? 0 : 3);",
    ], 0);
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
});

// ─── ROUND 3: secure nextLink validation ────────────────────────────────────

describe('ROUND 3 — secure nextLink validation (parse, never string prefix)', () => {
  const BASE = 'https://api.cotality.com/trestle';
  it('the string-prefix bypass host/path attacks are REJECTED before any token is sent', () => {
    // The exact review example: passes startsWith(BASE) but is a different path.
    expect(validateNextLink('https://api.cotality.com/trestle.attacker.example/path', BASE)).toMatchObject({ error: expect.stringContaining('outside the allowed OData path') });
    // Different-host attack that also passes naive prefixes:
    expect(validateNextLink('https://api.cotality.com.attacker.example/trestle/odata/Media', BASE)).toMatchObject({ error: expect.stringContaining('origin') });
    expect(validateNextLink('http://api.cotality.com/trestle/odata/Media', BASE)).toMatchObject({ error: expect.stringContaining('https') });
    expect(validateNextLink('https://user:pw@api.cotality.com/trestle/odata/Media', BASE)).toMatchObject({ error: expect.stringContaining('credentials') });
    expect(validateNextLink('https://evil.example/trestle/odata/Media', BASE)).toMatchObject({ error: expect.stringContaining('origin') });
  });
  it('a valid absolute nextLink and a RELATIVE nextLink resolve safely', () => {
    expect(validateNextLink(`${BASE}/odata/Media?$skip=100`, BASE)).toMatchObject({ url: expect.stringContaining('/trestle/odata/Media') });
    expect(validateNextLink('/trestle/odata/Media?$skip=200', BASE)).toMatchObject({ url: 'https://api.cotality.com/trestle/odata/Media?$skip=200' });
  });
  it('the CLI reader validates BEFORE the next authenticated request (source pins)', () => {
    const cli = read('scripts/audit/media-coverage-audit.cli.ts');
    expect(cli).toContain('validateNextLink(rawNext, BASE)');
    expect(cli).toContain('unsafe nextLink rejected');
    expect(cli).not.toContain('nextLink.startsWith');
  });
});

// ─── ROUND 3: identity-bound checkpoints + strict flags ────────────────────

describe('ROUND 3 — identity-bound checkpoints', () => {
  it('a Neon-only checkpoint can NEVER resume in Cotality mode (cross-mode rejected)', () => {
    const cp = emptyCheckpoint(NEON_ONLY_IDENTITY);
    expect(() => validateCheckpoint(cp, TEST_IDENTITY)).toThrow(/identity mismatch/);
    expect(identitiesMatch(NEON_ONLY_IDENTITY, TEST_IDENTITY).join(' ')).toContain('probeMode');
  });
  it('cross-source, cross-client, and cross-tool-version checkpoints are rejected', () => {
    expect(() => validateCheckpoint(emptyCheckpoint({ ...TEST_IDENTITY, neonFingerprint: 'otherdb00002' }), TEST_IDENTITY)).toThrow(/neonFingerprint/);
    expect(() => validateCheckpoint(emptyCheckpoint({ ...TEST_IDENTITY, cotalitySource: 'https://other.example/trestle' }), TEST_IDENTITY)).toThrow(/cotalitySource/);
    expect(() => validateCheckpoint(emptyCheckpoint({ ...TEST_IDENTITY, cotalityClientFingerprint: 'differentclient' }), TEST_IDENTITY)).toThrow(/cotalityClientFingerprint/);
    expect(() => validateCheckpoint(emptyCheckpoint({ ...TEST_IDENTITY, toolVersion: 'media-coverage-audit@OLD' }), TEST_IDENTITY)).toThrow(/toolVersion/);
  });
  it('version/mode/reconciliation still fail closed; dry-run identity too', () => {
    expect(() => validateCheckpoint({ ...emptyCheckpoint(TEST_IDENTITY), version: 2 }, TEST_IDENTITY)).toThrow(/version/);
    const bad = emptyCheckpoint(TEST_IDENTITY);
    bad.processed = 5;
    expect(() => validateCheckpoint(bad, TEST_IDENTITY)).toThrow(/reconcile/);
    expect(() => validateDryRunCheckpoint(emptyDryRunCheckpoint({ ...DRY_IDENTITY, probeMode: 'neon-only', cotalitySource: null }), DRY_IDENTITY)).toThrow(/identity mismatch/);
  });
  it('runAudit stamps the identity on fresh checkpoints and rejects foreign ones', async () => {
    const rows = [auditRow({ listing_id: 'RLSA', listing_media: [photoRow(1)] })];
    const res = await runAudit({ listings: pagedReader(rows).reader, identity: NEON_ONLY_IDENTITY, budgets: tightBudgets() });
    expect(res.checkpoint.identity).toEqual(NEON_ONLY_IDENTITY);
    await expect(runAudit({ listings: pagedReader(rows).reader, identity: TEST_IDENTITY, budgets: tightBudgets(), checkpoint: res.checkpoint }))
      .rejects.toThrow(/identity mismatch/);
  });
  it('checkpoints are written atomically (tmp + rename) — source pin', () => {
    const cli = read('scripts/audit/media-coverage-audit.cli.ts');
    expect(cli).toContain('writeCheckpointAtomic');
    expect(cli).toContain('renameSync');
    expect(cli).toContain('.tmp');
  });
});

describe('ROUND 3 — strict fail-closed CLI flags (spawned real tsx)', () => {
  const cliImport = "const { main } = await import('./scripts/audit/media-coverage-audit.cli');";
  it('--resume without an existing checkpoint file fails (never a silent fresh start)', () => {
    runTsx([
      "process.argv = [process.argv[0], process.argv[1], '--resume', '--checkpoint', '.does-not-exist-525.json'];",
      cliImport, 'await main();', 'process.exit(0);',
    ], 1);
  }, 150_000);
  it('an unknown/misspelled flag fails', () => {
    runTsx([
      "process.argv = [process.argv[0], process.argv[1], '--max-listngs', '10'];",
      cliImport, 'await main();', 'process.exit(0);',
    ], 1);
  }, 150_000);
  it('a duplicate bound flag fails', () => {
    runTsx([
      "process.argv = [process.argv[0], process.argv[1], '--max-listings', '10', '--max-listings', '20'];",
      cliImport, 'await main();', 'process.exit(0);',
    ], 1);
  }, 150_000);
  it('--checkpoint with a missing value fails; invalid bound values fail; --retries 0 is allowed (source pins)', () => {
    runTsx([
      "process.argv = [process.argv[0], process.argv[1], '--checkpoint', '--json'];",
      cliImport, 'await main();', 'process.exit(0);',
    ], 1);
    const cli = read('scripts/audit/media-coverage-audit.cli.ts');
    expect(cli).toContain("parseBound(args, '--retries', 1, 0)");
    expect(cli).toContain("parseBound(args, '--max-media-pages'");
    expect(cli).toContain('refusing to run');
  }, 150_000);
});

// ─── ROUND 3: provider MediaURL validation ──────────────────────────────────

describe('ROUND 3 — provider MediaURL validation', () => {
  it('isValidProviderMediaUrl: absolute http(s) only', () => {
    expect(isValidProviderMediaUrl('https://cdn.example/a.jpg')).toBe(true);
    expect(isValidProviderMediaUrl('http://cdn.example/a.jpg')).toBe(true);
    for (const bad of ['', '   ', null, undefined, 42, 'notaurl', 'ftp://x/a.jpg', '/relative/a.jpg']) {
      expect({ bad: String(bad), ok: isValidProviderMediaUrl(bad) }).toEqual({ bad: String(bad), ok: false });
    }
  });
  it('an empty or malformed MediaURL on a Photo row makes the WHOLE probe UNKNOWN — no plan, no R2 key', async () => {
    for (const badUrl of ['', undefined, 'notaurl']) {
      const { reader } = mockCotality({ pages: [{ rows: [cPhoto(1, { mediaUrl: badUrl })] }] });
      const res = await probeListingMedia(reader, 'RLSX', tightBudgets(), acctOf());
      expect({ badUrl: String(badUrl), status: res.status }).toEqual({ badUrl: String(badUrl), status: 'unknown' });
      expect((res as { photos?: unknown[] }).photos).toBeUndefined();
    }
  });
});

// ─── ROUND 3: R2-key collisions + ambiguous matches ────────────────────────

describe('ROUND 3 — R2-key collisions and ambiguous matches are CONFLICTS', () => {
  // #575 BEHAVIOUR CHANGE — this case is no longer a conflict.
  //
  // Under the old Order-based key scheme these two DISTINCT photos both mapped
  // to `photos/{id}/1.jpg`, so the planner had to reject otherwise-valid feed
  // data. Keying on MediaKey makes that collision structurally impossible, so
  // the pair now plans cleanly. The old assertion encoded the DEFECT as
  // expected behaviour; keeping it would have blocked the fix.
  it('two distinct provider photos with the SAME Order now plan cleanly (distinct MediaKeys)', () => {
    const plan = planListing(dryRow(), [
      { order: 1, sourceUrl: 'https://cdn.example/a.jpg', mediaKey: 'MK-A' },
      { order: 1, sourceUrl: 'https://cdn.example/b.jpg', mediaKey: 'MK-B' }, // distinct photo, same order
    ]);
    expect(plan.conflict).toBeNull();
    expect(plan.items).toHaveLength(2);
    // Distinct MediaKeys => distinct R2 keys, which is the whole point.
    expect(new Set(plan.items.map((i: { r2Key: string }) => i.r2Key)).size).toBe(2);
  });

  it('a provider photo with NO MediaKey => conflict (fail-closed, never Order-keyed)', () => {
    const plan = planListing(dryRow(), [
      { order: 1, sourceUrl: 'https://cdn.example/a.jpg', mediaKey: undefined as unknown as string },
    ]);
    expect(plan.conflict).not.toBeNull();
    expect(plan.conflict!.join(' ')).toContain('no MediaKey');
    expect(plan.expectedInserts).toBe(0);
  });
  it('duplicate existing media_key values => conflict (never arbitrary Map selection)', () => {
    const row = dryRow({
      _count: { listing_media: 2 },
      listing_media_all: [
        { id: '1', status: 'deleted', media_key: 'MK-DUP', media_url_original: 'https://cdn.example/a.jpg', media_url_cached: null, order: 1, media_type: 'Photo' },
        { id: '2', status: 'deleted', media_key: 'MK-DUP', media_url_original: 'https://cdn.example/b.jpg', media_url_cached: null, order: 2, media_type: 'Photo' },
      ],
    });
    const plan = planListing(row, [{ order: 1, sourceUrl: 'https://cdn.example/a.jpg', mediaKey: 'MK-DUP' }]);
    expect(plan.conflict!.join(' ')).toContain("duplicate existing media_key 'MK-DUP'");
  });
  it('multiple existing rows sharing a normalized URL => conflict', () => {
    const row = dryRow({
      _count: { listing_media: 2 },
      listing_media_all: [
        { id: '1', status: 'deleted', media_key: 'MK-1', media_url_original: 'https://cdn.example/x.jpg?v=1', media_url_cached: null, order: 1, media_type: 'Photo' },
        { id: '2', status: 'deleted', media_key: 'MK-2', media_url_original: 'https://cdn.example/x.jpg?v=2', media_url_cached: null, order: 2, media_type: 'Photo' },
      ],
    });
    const plan = planListing(row, [{ order: 1, sourceUrl: 'https://cdn.example/x.jpg', mediaKey: 'MK-1' }]);
    expect(plan.conflict!.join(' ')).toContain('share normalized URL');
  });
  it('one provider item matching DIFFERENT rows by key and URL => conflict', () => {
    const row = dryRow({
      _count: { listing_media: 2 },
      listing_media_all: [
        { id: '1', status: 'deleted', media_key: 'MK-K', media_url_original: 'https://cdn.example/k.jpg', media_url_cached: null, order: 1, media_type: 'Photo' },
        { id: '2', status: 'deleted', media_key: 'MK-U', media_url_original: 'https://cdn.example/u.jpg', media_url_cached: null, order: 2, media_type: 'Photo' },
      ],
    });
    // provider item: key matches row 1, URL matches row 2 → divergent
    const plan = planListing(row, [{ order: 3, sourceUrl: 'https://cdn.example/u.jpg', mediaKey: 'MK-K' }]);
    expect(plan.conflict!.join(' ')).toContain('DIFFERENT rows');
  });
  it('dry-run totals EXCLUDE conflict listings and report them separately', async () => {
    const cot = mockCotality({
      pagesPerListing: {
        // #575: same-Order/distinct-MediaKey is no longer a conflict (distinct
        // MediaKeys now yield distinct R2 keys), so the conflict exercised here
        // is the fail-closed missing-MediaKey case.
        RLSCONFLICT: [{ rows: [cPhoto(1), cPhoto(3, { mediaKey: undefined, mediaUrl: 'https://cdn.example/x.jpg' })] }],
        RLSOK: [{ rows: [cPhoto(2)] }],
      },
    });
    const rows = [dryRow({ listing_id: 'RLSCONFLICT' }), dryRow({ listing_id: 'RLSOK' })];
    const res = await runDryRun({ candidates: pagedReader(rows).reader, cotality: cot.reader, identity: DRY_IDENTITY, budgets: tightBudgets() });
    expect(res.conflictListings).toBe(1);
    expect(res.totals.inserts).toBe(1); // only RLSOK
    expect(res.incompleteReasons.join(' ')).toContain('CONFLICT');
  });
});

// ─── ROUND 3: URL normalization preserves path case ────────────────────────

describe('ROUND 3 — URL normalization preserves pathname case', () => {
  it('/Photo/A.jpg and /photo/a.jpg are DIFFERENT media objects', () => {
    expect(normalizeSourceUrl('https://cdn.example/Photo/A.jpg')).not.toBe(normalizeSourceUrl('https://cdn.example/photo/a.jpg'));
  });
  it('scheme+host are normalized (case-insensitive), query/fragment dropped', () => {
    expect(normalizeSourceUrl('HTTPS://CDN.Example/Photo/A.jpg?v=1#frag')).toBe('https://cdn.example/Photo/A.jpg');
  });
});

// ─── ROUND 3: retryable UNKNOWN across runs + scan/coverage split ──────────

describe('ROUND 3 — transient UNKNOWN is retried on resume and REPLACED', () => {
  it('audit: U becomes B_NEW on resume; tally/inventory/processed reconcile; no duplicates', async () => {
    const rows = [auditRow({ listing_id: 'RLSFAIL' })];
    const failing = mockCotality({ propertyError: 'transient 503' });
    const run1 = await runAudit({ listings: pagedReader(rows).reader, cotality: failing.reader, identity: TEST_IDENTITY, budgets: tightBudgets() });
    expect(run1.inventory[0].bucket).toBe('U');
    expect(run1.checkpoint.retryableUnknown).toHaveLength(1);
    expect(run1.scanComplete).toBe(true);
    expect(run1.coverageComplete).toBe(false);

    const working = mockCotality({ pagesPerListing: { RLSFAIL: [{ rows: [cPhoto(1), cPhoto(2)] }] } });
    const paged = pagedReader(rows);
    const run2 = await runAudit({ listings: paged.reader, cotality: working.reader, identity: TEST_IDENTITY, budgets: tightBudgets(), checkpoint: run1.checkpoint });
    expect(paged.byIdCalls[0]).toEqual(['RLSFAIL']); // queue processed FIRST via targeted fetch
    const rec = run2.inventory.find((r: { listingId: string }) => r.listingId === 'RLSFAIL');
    expect(rec.bucket).toBe('B_NEW'); // U REPLACED, not duplicated
    expect(run2.tally.U).toBe(0);
    expect(run2.tally.B_NEW).toBe(1);
    expect(run2.processed).toBe(1);
    expect(run2.inventory).toHaveLength(1);
    const tallySum = Object.values(run2.tally as Record<string, number>).reduce((s, n) => s + n, 0);
    expect(tallySum).toBe(run2.processed);
    expect(run2.checkpoint.retryableUnknown).toHaveLength(0);
    expect(run2.coverageComplete).toBe(true);
    expect(run2.runCounters.unknownReplaced).toBe(1);
  });

  it('audit: unknown-retries are BOUNDED per listing — exhaustion becomes permanent UNKNOWN', async () => {
    const rows = [auditRow({ listing_id: 'RLSFAIL' })];
    const failing = () => mockCotality({ propertyError: 'still down' });
    const idTwo0 = { ...TEST_IDENTITY, maxUnknownRetries: 2 };
    let cp = (await runAudit({ listings: pagedReader(rows).reader, cotality: failing().reader, identity: idTwo0, budgets: tightBudgets({ maxUnknownRetriesPerListing: 2 }) })).checkpoint;
    const run2 = await runAudit({ listings: pagedReader(rows).reader, cotality: failing().reader, identity: idTwo0, budgets: tightBudgets({ maxUnknownRetriesPerListing: 2 }), checkpoint: cp });
    expect(run2.checkpoint.retryableUnknown).toHaveLength(0); // exhausted → off the retry queue
    expect(run2.checkpoint.permanentUnknown).toHaveLength(1); // ...and onto permanentUnknown
    expect(run2.coverageComplete).toBe(false); // permanentUnknown blocks coverage
    expect(run2.inventory[0].bucket).toBe('U'); // stays honest U
  });

  it('dry-run: a transient-unknown listing is re-probed on resume and its plan is ADDED', async () => {
    const rows = [dryRow({ listing_id: 'RLSFAIL' })];
    const failing = mockCotality({ propertyError: 'transient' });
    const run1 = await runDryRun({ candidates: pagedReader(rows).reader, cotality: failing.reader, identity: DRY_IDENTITY, budgets: tightBudgets() });
    expect(run1.plans).toHaveLength(0);
    expect(run1.checkpoint.retryableUnknown).toHaveLength(1);
    expect(run1.coverageComplete).toBe(false);

    const working = mockCotality({ pagesPerListing: { RLSFAIL: [{ rows: [cPhoto(1)] }] } });
    const run2 = await runDryRun({ candidates: pagedReader(rows).reader, cotality: working.reader, identity: DRY_IDENTITY, budgets: tightBudgets(), checkpoint: run1.checkpoint });
    expect(run2.plans.map((p: { listingId: string }) => p.listingId)).toEqual(['RLSFAIL']);
    expect(run2.checkpoint.retryableUnknown).toHaveLength(0);
    expect(run2.coverageComplete).toBe(true);
  });

  it('Neon-only: scanComplete does NOT imply coverageComplete', async () => {
    const rows = [auditRow({ listing_id: 'RLSEMPTY' })]; // DB-empty third-party → U without probe
    const res = await runAudit({ listings: pagedReader(rows).reader, identity: NEON_ONLY_IDENTITY, budgets: tightBudgets() });
    expect(res.scanComplete).toBe(true);
    expect(res.coverageComplete).toBe(false);
    expect(res.incompleteReasons.join(' ')).toContain('coverage NOT verified');
    expect(res.inventory[0].bucket).toBe('U');
  });
});

// ─── retained round-2 core proofs (per-run budgets, pending, accounting) ───

describe('per-run budgets and pending rows (round-2 core, still proven)', () => {
  const six = ['RLSA', 'RLSB', 'RLSC', 'RLSD', 'RLSE', 'RLSF'].map((id) => auditRow({ listing_id: id, listing_media: [photoRow(1)] }));

  it('resume with the SAME --max-listings continues; inventory reconciles; no duplicates', async () => {
    const b = tightBudgets({ maxListings: 4 });
    const run1 = await runAudit({ listings: pagedReader(six).reader, identity: TEST_IDENTITY, budgets: b });
    expect(run1.processed).toBe(4);
    expect(run1.scanComplete).toBe(false);
    const second = pagedReader(six);
    const run2 = await runAudit({ listings: second.reader, identity: TEST_IDENTITY, budgets: b, checkpoint: run1.checkpoint });
    expect(run2.processed).toBe(6);
    expect(run2.coverageComplete).toBe(true);
    expect(second.calls[0].cursor).toBe('RLSD');
    expect(run2.inventory).toHaveLength(6);
    expect(new Set(run2.inventory.map((r: { listingId: string }) => r.listingId)).size).toBe(6);
  });

  it('budget-deferred rows stay PENDING (cursor never passes them) and confirm on resume with a fresh cap', async () => {
    const empty = ['RLS1', 'RLS2', 'RLS3'].map((id) => auditRow({ listing_id: id }));
    const b = tightBudgets({ maxCotalityRequests: 4, pageSize: 3 });
    const cot1 = mockCotality({ pagesPerListing: { RLS1: [{ rows: [cPhoto(1)] }], RLS2: [{ rows: [] }] } });
    const run1 = await runAudit({ listings: pagedReader(empty).reader, cotality: cot1.reader, identity: TEST_IDENTITY, budgets: b });
    expect(run1.processed).toBe(2);
    expect(run1.checkpoint.cursor).toBe('RLS2');
    expect(run1.checkpoint.pendingFrom).toBe('RLS3');
    expect(run1.tally.U).toBe(0);
    const cot2 = mockCotality({ pagesPerListing: { RLS3: [{ rows: [cPhoto(1)] }] } });
    const run2 = await runAudit({ listings: pagedReader(empty).reader, cotality: cot2.reader, identity: TEST_IDENTITY, budgets: b, checkpoint: run1.checkpoint });
    expect(run2.processed).toBe(3);
    expect(run2.inventory.find((r: { listingId: string }) => r.listingId === 'RLS3').bucket).toBe('B_NEW');
    expect(run2.coverageComplete).toBe(true);
  });

  it('every HTTP attempt including retries consumes the cap (one accounting path)', async () => {
    const acct = acctOf(3);
    let tries = 0;
    const ok = await attemptWithAccounting(async () => { tries += 1; if (tries < 3) throw new Error('x'); return 'ok'; }, acct, 5);
    expect(ok).toBe('ok');
    expect(acct.attempts).toBe(3);
    expect(acct.retries).toBe(2);
    await expect(attemptWithAccounting(async () => 'never', acct, 5)).rejects.toThrow(CapStopError);
    expect(acct.attempts).toBe(3);
  });
});

// ─── Cotality probe fundamentals (retained) ─────────────────────────────────

describe('Cotality probe — keying, traversal, strict classification (retained)', () => {
  it('Property ListingKey keys Media; complete nextLink traversal sums; incomplete is UNKNOWN', async () => {
    const complete = mockCotality({ pages: [{ rows: [cPhoto(1), cPhoto(2)], nextLink: 'mock://p1' }, { rows: [cPhoto(3)] }] });
    const okRes = await probeListingMedia(complete.reader, 'RLS20103891', tightBudgets(), acctOf());
    expect(complete.log[0]).toBe('property:RLS20103891');
    expect(complete.log[1]).toBe('firstUrl:KEY-RLS20103891');
    expect(okRes).toMatchObject({ status: 'confirmed', photoCount: 3 });

    const broken = mockCotality({ pages: [{ rows: [cPhoto(1)], nextLink: 'mock://p1' }], pageErrorAt: 1 });
    expect((await probeListingMedia(broken.reader, 'RLSX', tightBudgets(), acctOf())).status).toBe('unknown');
  });
  it('malformed provider Order is UNKNOWN; strict classification excludes absent/floorplan/video', async () => {
    for (const badOrder of [undefined, 'seven', 1.5]) {
      const { reader } = mockCotality({ pages: [{ rows: [cPhoto(1, { order: badOrder })] }] });
      expect((await probeListingMedia(reader, 'RLSX', tightBudgets(), acctOf())).status).toBe('unknown');
    }
    expect(classifyCotalityRowStrict({ mediaCategory: null, mediaType: null })).toBe('unknown');
    const { reader } = mockCotality({ pages: [{ rows: [cPhoto(1), cPhoto(2, { mediaCategory: 'FloorPlan' }), cPhoto(3, { mediaCategory: null, mediaType: null })] }] });
    expect((await probeListingMedia(reader, 'RLSX', tightBudgets(), acctOf()) as { photoCount: number }).photoCount).toBe(1);
  });
  it('Mallan-owned listings make ZERO Cotality calls and classify E (never U/D)', async () => {
    expect(needsCotalityProbe(auditRow({ listing_id: 'SL-0009' }))).toBe(false);
    const rows = [auditRow({ listing_id: 'SL-0009' }), auditRow({ listing_id: 'C-1', rls_eligible: false })];
    const cot = mockCotality({ pages: [{ rows: [cPhoto(1)] }] });
    const res = await runAudit({ listings: pagedReader(rows).reader, cotality: cot.reader, identity: TEST_IDENTITY, budgets: tightBudgets() });
    expect(cot.log).toHaveLength(0);
    expect(res.inventory.map((r: { bucket: string }) => r.bucket)).toEqual(['E', 'E']);
    expect(res.coverageComplete).toBe(true);
  });
  it('inventory ownership equals the real canonical helper', () => {
    for (const { id, rls } of [{ id: 'SL-0004', rls: null }, { id: 'sl-0004', rls: null }, { id: 'RLS1', rls: true }, { id: 'C-1', rls: false }]) {
      const rec = buildInventoryRow(auditRow({ listing_id: id, rls_eligible: rls }), { status: 'unknown', reason: 't' });
      expect(rec.ownership).toBe(isMallanExclusiveListing({ listing_id: id, rls_eligible: rls }) ? 'mallan-owned' : 'third-party');
    }
  });
});

// ─── planner fundamentals (retained) ────────────────────────────────────────

describe('dry-run planner — order fidelity + update detection (retained)', () => {
  it('provider Order verbatim incl. negative; full action taxonomy; missing media_key is an update', () => {
    const plan = planListing(dryRow(), [
      { order: 7, sourceUrl: 'https://cdn.example/a.jpg', mediaKey: 'MK-A' },
      { order: -1, sourceUrl: 'https://cdn.example/b.jpg', mediaKey: 'MK-B' },
    ]);
    expect(plan.items.map((i: { order: number }) => i.order)).toEqual([-1, 7]); // photo-first: ascending order, no preferred
    expect(plan.items[0].r2Key).toBe(buildMediaR2Key(plan.listingId, 'Photo', 'MK-B')); // #575: identity, not the -1 ordinal

    const row = { id: '1', status: 'active', media_key: null, media_url_original: 'https://cdn.example/x.jpg', media_url_cached: null, order: 1, media_type: 'Photo', preferred_photo_yn: false };
    expect(diffAuthorizedFields(row, { order: 1, sourceUrl: 'https://cdn.example/x.jpg', mediaKey: 'MK-REAL' })).toContain('media_key');
    expect(diffAuthorizedFields({ ...row, media_key: 'MK', media_type: '' }, { order: 1, sourceUrl: 'https://cdn.example/x.jpg', mediaKey: 'MK' })).toContain('media_type');
    expect(diffAuthorizedFields({ ...row, media_key: 'MK' }, { order: 1, sourceUrl: 'https://cdn.example/x.jpg', mediaKey: 'MK', preferredPhotoYn: true })).toContain('preferred_photo_yn');
  });
  it('RLS20103891 stays U unless its own completed probe runs', async () => {
    const row = auditRow({ listing_id: 'RLS20103891' });
    const noProbe = await runAudit({ listings: pagedReader([row]).reader, identity: NEON_ONLY_IDENTITY, budgets: tightBudgets() });
    expect(noProbe.inventory[0]).toMatchObject({ listingId: 'RLS20103891', bucket: 'U' });
    const cot = mockCotality({ pages: [{ rows: [cPhoto(1)] }] });
    const probed = await runAudit({ listings: pagedReader([row]).reader, cotality: cot.reader, identity: TEST_IDENTITY, budgets: tightBudgets() });
    expect(probed.inventory[0].bucket).toBe('B_NEW');
  });
});

// ─── ROUND 4: explicit conservative photo classification ───────────────────

describe('ROUND 4 — classifyCotalityMedia never defaults unknown to Photo', () => {
  it('the exact review examples classify correctly; NOTHING falls through to Photo', () => {
    expect(classifyCotalityMedia('Photo', null)).toBe('Photo');
    expect(classifyCotalityMedia('FloorPlan', null)).toBe('FloorPlan');
    expect(classifyCotalityMedia('Document', null)).toBe('Document');
    expect(classifyCotalityMedia('Disclosure', null)).toBe('Document');
    expect(classifyCotalityMedia('Map', null)).toBe('Document');
    expect(classifyCotalityMedia('Survey', null)).toBe('Document');
    expect(classifyCotalityMedia('Video', null)).toBe('Video');
    expect(classifyCotalityMedia('BrandedVirtualTour', null)).toBe('VirtualTour');
    expect(classifyCotalityMedia('UnbrandedVirtualTour', null)).toBe('VirtualTour');
    expect(classifyCotalityMedia('Other', null)).toBe('Other');
    expect(classifyCotalityMedia('AgentPhoto', null)).not.toBe('Photo');
    expect(classifyCotalityMedia('OfficePhoto', null)).not.toBe('Photo');
    expect(classifyCotalityMedia('SomethingUnfamiliar', null)).toBe('unknown');
    expect(classifyCotalityMedia(null, 'Jpeg')).toBe('Photo');
    expect(classifyCotalityMedia(null, 'png')).toBe('Photo');
    expect(classifyCotalityMedia(null, 'Pdf')).toBe('Document');
    expect(classifyCotalityMedia(null, 'docx')).toBe('Document');
    expect(classifyCotalityMedia(null, 'Mp4')).toBe('Video');
    expect(classifyCotalityMedia(null, 'weirdtype')).toBe('unknown');
    expect(classifyCotalityMedia(null, null)).toBe('unknown');
    expect(classifyCotalityRowStrict({ mediaCategory: 'Document', mediaType: 'Pdf' })).toBe('Document');
  });
  it('the probe counts a Document/Disclosure/pdf row as NON-photo (no false Bucket B)', async () => {
    const { reader } = mockCotality({ pages: [{ rows: [
      cPhoto(1, { mediaCategory: 'Document', mediaType: 'Pdf' }),
      cPhoto(2, { mediaCategory: 'Disclosure', mediaType: 'Pdf' }),
      cPhoto(3, { mediaCategory: null, mediaType: 'docx' }),
      cPhoto(4),
    ] }] });
    const res = await probeListingMedia(reader, 'RLSX', tightBudgets(), acctOf());
    expect(res).toMatchObject({ status: 'confirmed', photoCount: 1 });
  });
});

describe('ROUND 4 — a dry-run with conflicts is NOT planComplete', () => {
  // #575: a same-Order pair is no longer a conflict (distinct MediaKeys now
  // yield distinct R2 keys). The conflict exercised here is the fail-closed
  // missing-MediaKey case, which is a real, still-reachable conflict.
  it('planComplete is false when a provider photo has no MediaKey', async () => {
    const cot = mockCotality({ pagesPerListing: {
      RLSC: [{ rows: [cPhoto(1), cPhoto(2, { mediaKey: undefined, mediaUrl: 'https://cdn.example/z.jpg' })] }],
    } });
    const res = await runDryRun({ candidates: pagedReader([dryRow({ listing_id: 'RLSC' })]).reader, cotality: cot.reader, identity: DRY_IDENTITY, budgets: tightBudgets() });
    expect(res.scanComplete).toBe(true);
    expect(res.coverageComplete).toBe(true);
    expect(res.planComplete).toBe(false);
    expect(res.conflictListings).toBe(1);
  });
  it('a clean dry-run is planComplete', async () => {
    const cot = mockCotality({ pagesPerListing: { RLSOK: [{ rows: [cPhoto(1)] }] } });
    const res = await runDryRun({ candidates: pagedReader([dryRow({ listing_id: 'RLSOK' })]).reader, cotality: cot.reader, identity: DRY_IDENTITY, budgets: tightBudgets() });
    expect(res.planComplete).toBe(true);
  });
});

describe('ROUND 4 — retry queue re-evaluates Neon state before probing', () => {
  const transitions: Array<[string, Record<string, unknown>]> = [
    ['gained active relational media', { listing_media: [photoRow(1)] }],
    ['gained valid legacy media', { media: [{ url: 'https://x/a.jpg', mediaType: 'Photo', order: 0 }] }],
    ['became hidden', { idx_display_yn: false }],
    ['became Mallan-owned', { rls_eligible: false }],
  ];
  for (const [label, patch] of transitions) {
    it('audit: a queued listing that ' + label + ' is re-resolved with ZERO Cotality calls', async () => {
      const failing = mockCotality({ propertyError: 'transient' });
      const run1 = await runAudit({ listings: pagedReader([auditRow({ listing_id: 'RLSQ' })]).reader, cotality: failing.reader, identity: TEST_IDENTITY, budgets: tightBudgets() });
      expect(run1.checkpoint.retryableUnknown).toHaveLength(1);
      const changed = mockCotality({ propertyError: 'must NOT be called' });
      const run2 = await runAudit({ listings: pagedReader([auditRow({ listing_id: 'RLSQ', ...patch })]).reader, cotality: changed.reader, identity: TEST_IDENTITY, budgets: tightBudgets(), checkpoint: run1.checkpoint });
      expect(changed.log).toHaveLength(0);
      expect(run2.checkpoint.retryableUnknown).toHaveLength(0);
      expect(run2.inventory.find((r: { listingId: string }) => r.listingId === 'RLSQ').bucket).not.toBe('U');
    });
  }
  it('audit: a queued listing MISSING from Neon is dropped (source-missing), not queued forever', async () => {
    const failing = mockCotality({ propertyError: 'transient' });
    const run1 = await runAudit({ listings: pagedReader([auditRow({ listing_id: 'RLSGONE' })]).reader, cotality: failing.reader, identity: TEST_IDENTITY, budgets: tightBudgets() });
    expect(run1.checkpoint.retryableUnknown).toHaveLength(1);
    const empty = mockCotality({ propertyError: 'must not be called' });
    const run2 = await runAudit({ listings: pagedReader([]).reader, cotality: empty.reader, identity: TEST_IDENTITY, budgets: tightBudgets(), checkpoint: run1.checkpoint });
    expect(empty.log).toHaveLength(0);
    expect(run2.checkpoint.retryableUnknown).toHaveLength(0);
    expect(run2.runCounters.sourceMissing).toBe(1);
    expect(run2.inventory.find((r: { listingId: string }) => r.listingId === 'RLSGONE')).toBeUndefined();
    expect(run2.processed).toBe(run2.inventory.length);
  });
  it('validateRetryQueue rejects duplicates, bad attempts, and non-U records', () => {
    const uRec = { listingId: 'A', bucket: 'U', cotality: { status: 'unknown', reason: 'x' } };
    expect(() => validateRetryQueue([{ listingId: 'A', attempts: 1 }, { listingId: 'A', attempts: 1 }], [uRec])).toThrow(/duplicate/);
    expect(() => validateRetryQueue([{ listingId: 'A', attempts: 0 }], [uRec])).toThrow(/attempts/);
    expect(() => validateRetryQueue([{ listingId: 'A', attempts: 1 }], [{ ...uRec, bucket: 'B_NEW' }])).toThrow(/matching U/);
  });
});

describe('ROUND 4 — authenticated-request boundary; base + redirects fail closed', () => {
  it('validateNextLink guards every request; redirect:error; base asserted (source pins)', () => {
    const cli = read('scripts/audit/media-coverage-audit.cli.ts');
    expect(cli).toContain('const guard = validateNextLink(url, BASE);');
    expect(cli).toContain('refusing authenticated request to an unsafe URL');
    expect(cli).toContain("redirect: 'error'");
    expect(cli).toContain('assertValidBase(BASE)');
  });
  it('assertValidBase rejects http, credentials; accepts clean https (spawned tsx)', () => {
    runTsx([
      "process.env.TRESTLE_API_URL = 'http://api.cotality.com/trestle';",
      "process.env.IDX_CLIENT_ID = 'cid';",
      "const m = await import('./scripts/audit/media-coverage-audit.cli');",
      "try { m.buildCotalityReader({ timeoutMs: 100, maxRetries: 0 }); process.exit(9); }",
      "catch (e) { process.exit(String(e.message).includes('https') ? 0 : 8); }",
    ], 0);
    runTsx([
      "process.env.TRESTLE_API_URL = 'https://u:p@api.cotality.com/trestle';",
      "const m = await import('./scripts/audit/media-coverage-audit.cli');",
      "try { m.buildCotalityReader({ timeoutMs: 100, maxRetries: 0 }); process.exit(9); }",
      "catch (e) { process.exit(String(e.message).includes('credentials') ? 0 : 8); }",
    ], 0);
    runTsx([
      "process.env.TRESTLE_API_URL = 'https://api.cotality.com/trestle';",
      "const m = await import('./scripts/audit/media-coverage-audit.cli');",
      "m.buildCotalityReader({ timeoutMs: 100, maxRetries: 0 }); process.exit(0);",
    ], 0);
  }, 200_000);
  it('identity fails closed when Cotality client id is missing in cotality mode (spawned tsx)', () => {
    runTsx([
      "delete process.env.IDX_CLIENT_ID; delete process.env.IDX_API_KEY;",
      "const m = await import('./scripts/audit/media-coverage-audit.cli');",
      "try { m.buildIdentity('audit', true, 'https://api.cotality.com/trestle', null); process.exit(9); }",
      "catch (e) { process.exit(String(e.message).includes('IDX_CLIENT_ID') ? 0 : 8); }",
    ], 0);
  }, 150_000);
});

describe('ROUND 4 — checkpoint protection and exposed bounds', () => {
  const cliImport = "const { main } = await import('./scripts/audit/media-coverage-audit.cli');";
  it('an existing --checkpoint WITHOUT --resume is refused (never overwritten)', () => {
    const cpFile = path.join(ROOT, '.tmp-525-existing-' + Date.now() + '.json');
    fs.writeFileSync(cpFile, '{}', 'utf8');
    try {
      runTsx([
        'process.argv = [process.argv[0], process.argv[1], "--checkpoint", ' + JSON.stringify(cpFile) + '];',
        cliImport, 'await main();', 'process.exit(0);',
      ], 1);
      expect(fs.readFileSync(cpFile, 'utf8')).toBe('{}');
    } finally {
      fs.unlinkSync(cpFile);
    }
  }, 150_000);
  it('source pins: --max-unknown-retries validated; --retries 0 allowed; dry-run sequential (no --concurrency)', () => {
    const auditCli = read('scripts/audit/media-coverage-audit.cli.ts');
    expect(auditCli).toContain("parseBound(args, '--max-unknown-retries'");
    expect(auditCli).toContain("parseBound(args, '--retries', 1, 0)");
    expect(auditCli).toContain('acquireCheckpointLock');
    expect(auditCli).toContain("openSync(lockPath, 'wx')");
    expect(auditCli).toContain('${path}.${process.pid}');
    const dryCli = read('scripts/backfill/bucket-b-media-dry-run.cli.ts');
    expect(dryCli).toContain("parseBound(args, '--max-unknown-retries'");
    expect(dryCli).not.toContain("'--concurrency'");
    expect(dryCli).toContain('sequential');
  });
  it('the dry-run CLI rejects --concurrency as an unknown flag (spawned tsx)', () => {
    runTsx([
      'process.argv = [process.argv[0], process.argv[1], "--concurrency", "4"];',
      "const { main } = await import('./scripts/backfill/bucket-b-media-dry-run.cli');",
      'await main();', 'process.exit(0);',
    ], 1);
  }, 150_000);
});

// ─── ROUND 5: exhaustion persists as permanentUnknown; never planComplete ──

describe('ROUND 5 — retry exhaustion can never exit successfully', () => {
  it('dry-run: an exhausted listing lands in permanentUnknown and blocks planComplete', async () => {
    const rows = [dryRow({ listing_id: 'RLSX' })];
    const idTwo = { ...DRY_IDENTITY, maxUnknownRetries: 2 };
    const b = { ...tightBudgets({ maxUnknownRetriesPerListing: 2 }) };
    const cp1 = (await runDryRun({ candidates: pagedReader(rows).reader, cotality: mockCotality({ propertyError: 'down' }).reader, identity: idTwo, budgets: b })).checkpoint;
    const res = await runDryRun({ candidates: pagedReader(rows).reader, cotality: mockCotality({ propertyError: 'still down' }).reader, identity: idTwo, budgets: b, checkpoint: cp1 });
    expect(res.checkpoint.retryableUnknown).toHaveLength(0);
    expect(res.checkpoint.permanentUnknown).toHaveLength(1);
    expect(res.permanentUnknownCount).toBe(1);
    expect(res.coverageComplete).toBe(false);
    expect(res.planComplete).toBe(false); // never a clean plan while permanentUnknown non-empty
  });
  it('a run is never "incomplete" and planComplete at once (source-missing is a WARNING, not a reason)', async () => {
    // Exhaust one listing (blocks) AND make a second source-missing (warning).
    const rows = [dryRow({ listing_id: 'RLSA' })];
    const idTwo = { ...DRY_IDENTITY, maxUnknownRetries: 2 };
    const b = tightBudgets({ maxUnknownRetriesPerListing: 2 });
    let cp = (await runDryRun({ candidates: pagedReader(rows).reader, cotality: mockCotality({ propertyError: 'x' }).reader, identity: idTwo, budgets: b })).checkpoint;
    // Add a queued listing that will be source-missing on resume:
    cp.retryableUnknown.push({ listingId: 'RLSGONE', attempts: 1, lastReason: 'x' });
    const res = await runDryRun({ candidates: pagedReader([dryRow({ listing_id: 'RLSA' })]).reader, cotality: mockCotality({ propertyError: 'still' }).reader, identity: idTwo, budgets: b, checkpoint: cp });
    expect(res.warnings.some((w: string) => w.includes('source-missing'))).toBe(true);
    expect(res.incompleteReasons.some((r: string) => r.includes('source-missing'))).toBe(false);
    expect(res.planComplete).toBe(false); // still blocked by RLSA exhaustion
  });
});

// ─── ROUND 5: bounded retry-queue Neon reading ─────────────────────────────

describe('ROUND 5 — retry-queue reading respects maxListings', () => {
  it('audit: a queue of 10 with maxListings=2 examines at most 2, leaves 8 queued, resumes cleanly', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `RLS${String(i).padStart(2, '0')}`);
    const rows = ids.map((id) => auditRow({ listing_id: id }));
    const idOne = { ...TEST_IDENTITY, maxUnknownRetries: 3 };
    // seed a checkpoint whose retry queue holds all 10 (all currently failing)
    const seed = { ...emptyCheckpoint(idOne),
      cursor: 'RLS99', processed: 10,
      inventory: ids.map((id) => ({ listingId: id, displayable: true, ownership: 'third-party', activeUsablePhotoCount: 0, allStatusRowCount: 0, legacyUsablePhotoCount: 0, cotality: { status: 'unknown', reason: 'x' }, bucket: 'U' })),
      tally: { A: 0, B_NEW: 0, B_INACTIVE: 0, C: 0, D: 0, E: 0, F: 0, U: 10 },
      retryableUnknown: ids.map((id) => ({ listingId: id, attempts: 1, lastReason: 'x' })),
    };
    const b = tightBudgets({ maxListings: 2, pageSize: 5 });
    const good = mockCotality({ pages: ids.map(() => ({ rows: [cPhoto(1)] })) });
    const paged = pagedReader(rows);
    const run1 = await runAudit({ listings: paged.reader, cotality: good.reader, identity: idOne, budgets: b, checkpoint: seed });
    // examined at most 2 retry ids → at most 2 targeted single-id reads
    expect(paged.byIdCalls.length).toBeLessThanOrEqual(2);
    expect(paged.byIdCalls.flat().length).toBeLessThanOrEqual(2);
    expect(run1.checkpoint.retryableUnknown.length).toBe(8); // 8 remain
    expect(run1.runCounters.listingsFinalized).toBeLessThanOrEqual(2);
    // resume finishes the rest without duplicates
    const run2 = await runAudit({ listings: pagedReader(rows).reader, cotality: mockCotality({ pages: ids.map(() => ({ rows: [cPhoto(1)] })) }).reader, identity: idOne, budgets: tightBudgets({ maxListings: 100 }), checkpoint: run1.checkpoint });
    expect(run2.checkpoint.retryableUnknown).toHaveLength(0);
    expect(new Set(run2.inventory.map((r: { listingId: string }) => r.listingId)).size).toBe(10);
  });
});

// ─── ROUND 5: approved-endpoint allowlist ──────────────────────────────────

describe('ROUND 5 — only an approved Cotality endpoint can get the credentials', () => {
  it('an arbitrary HTTPS host is rejected BEFORE token acquisition (spawned tsx)', () => {
    runTsx([
      "process.env.TRESTLE_API_URL = 'https://attacker.example/trestle';",
      "process.env.IDX_CLIENT_ID = 'cid';",
      "const m = await import('./scripts/audit/media-coverage-audit.cli');",
      "try { m.assertValidBase('https://attacker.example/trestle'); process.exit(9); }",
      "catch (e) { process.exit(String(e.message).includes('approved endpoint allowlist') ? 0 : 8); }",
    ], 0);
  }, 150_000);
  it('the correct host with a wrong path, and a suffix lookalike, are rejected; the approved endpoint passes', () => {
    runTsx([
      "process.env.IDX_CLIENT_ID = 'cid';",
      "const m = await import('./scripts/audit/media-coverage-audit.cli');",
      "let bad = 0;",
      "for (const u of ['https://api.cotality.com/wrongpath','https://api.cotality.com.evil.test/trestle','https://api.cotality.com:8443/trestle']) { try { m.assertValidBase(u); } catch { bad += 1; } }",
      "try { m.assertValidBase('https://api.cotality.com/trestle'); } catch { process.exit(7); }",
      "process.exit(bad === 3 ? 0 : 8);",
    ], 0);
  }, 150_000);
  it('buildIdentity rejects an unapproved base in cotality mode (spawned tsx)', () => {
    runTsx([
      "process.env.TRESTLE_API_URL = 'https://attacker.example/trestle';",
      "process.env.IDX_CLIENT_ID = 'cid';",
      "const m = await import('./scripts/audit/media-coverage-audit.cli');",
      "try { m.buildIdentity('audit', true, 'https://attacker.example/trestle', null, 3); process.exit(9); }",
      "catch (e) { process.exit(String(e.message).includes('approved endpoint allowlist') ? 0 : 8); }",
    ], 0);
  }, 150_000);
});

// ─── ROUND 5: max-unknown-retries self-consistency ─────────────────────────

describe('ROUND 5 — the unknown-retry policy is self-consistent', () => {
  it('the largest allowed value validates; one above the max is rejected (source pins)', () => {
    const cli = read('scripts/audit/media-coverage-audit.cli.ts');
    expect(cli).toContain('MAX_UNKNOWN_RETRIES');
    expect(cli).toContain('exceeds the maximum');
    expect(MAX_UNKNOWN_RETRIES).toBe(100);
  });
  it('spawned CLI: --max-unknown-retries 200 is rejected (never produces a checkpoint it would reject)', () => {
    runTsx([
      "process.argv = [process.argv[0], process.argv[1], '--max-unknown-retries', '200'];",
      "const { main } = await import('./scripts/audit/media-coverage-audit.cli');",
      'await main();', 'process.exit(0);',
    ], 1);
  }, 150_000);
  it('a checkpoint with a DIFFERENT retry policy cannot resume (identity mismatch)', () => {
    const a = { ...TEST_IDENTITY, maxUnknownRetries: 3 };
    const b = { ...TEST_IDENTITY, maxUnknownRetries: 5 };
    expect(identitiesMatch(a, b).join(' ')).toContain('maxUnknownRetries');
    expect(() => validateCheckpoint({ ...emptyCheckpoint(a) }, b)).toThrow(/maxUnknownRetries/);
  });
});

// ─── ROUND 5: photo-first ordering ─────────────────────────────────────────

describe('ROUND 5 — planned media is photo/hero first', () => {
  it('the PreferredPhotoYN hero leads, then ascending provider Order', () => {
    const plan = planListing(dryRow(), [
      { order: 5, sourceUrl: 'https://cdn.example/e.jpg', mediaKey: 'MK-5', preferredPhotoYn: false },
      { order: 9, sourceUrl: 'https://cdn.example/h.jpg', mediaKey: 'MK-9', preferredPhotoYn: true },
      { order: 2, sourceUrl: 'https://cdn.example/b.jpg', mediaKey: 'MK-2', preferredPhotoYn: false },
    ]);
    expect(plan.items[0].preferredPhotoYn).toBe(true);   // hero first
    expect(plan.items[0].order).toBe(9);
    expect(plan.items.slice(1).map((i: { order: number }) => i.order)).toEqual([2, 5]); // then ascending
  });
});

// ─── ROUND 5 (rev): bounded permanent-unknown RECHECK (real framework/CLI) ──
//
// permanentUnknown is re-evaluated ONLY via the explicit --recheck-permanent
// mode (deps.recheckPermanent) — never by hand-editing the checkpoint. The
// recheck does a fresh Neon read first, re-probes only when still needed, and
// resolves/annotates in place; it NEVER moves an entry into retryableUnknown.

describe('ROUND 5 (rev) — permanent-unknown recheck is a real bounded mode', () => {
  const exhaustAudit = async (id2: Record<string, unknown>, b: Record<string, unknown>, rows: Array<Record<string, unknown>>) => {
    let cp = (await runAudit({ listings: pagedReader(rows).reader, cotality: mockCotality({ propertyError: 'down' }).reader, identity: id2, budgets: b })).checkpoint;
    cp = (await runAudit({ listings: pagedReader(rows).reader, cotality: mockCotality({ propertyError: 'still' }).reader, identity: id2, budgets: b, checkpoint: cp })).checkpoint;
    return cp;
  };
  const exhaustDryRun = async (id2: Record<string, unknown>, b: Record<string, unknown>, rows: Array<Record<string, unknown>>) => {
    let cp = (await runDryRun({ candidates: pagedReader(rows).reader, cotality: mockCotality({ propertyError: 'down' }).reader, identity: id2, budgets: b })).checkpoint;
    cp = (await runDryRun({ candidates: pagedReader(rows).reader, cotality: mockCotality({ propertyError: 'still' }).reader, identity: id2, budgets: b, checkpoint: cp })).checkpoint;
    return cp;
  };
  const id2 = { ...TEST_IDENTITY, maxUnknownRetries: 2 };
  const dId2 = { ...DRY_IDENTITY, maxUnknownRetries: 2 };
  const b = tightBudgets({ maxUnknownRetriesPerListing: 2 });

  it('audit: WITHOUT the flag a permanent listing is never auto-probed (still blocking)', async () => {
    const rows = [auditRow({ listing_id: 'RLSX' })];
    const cp = await exhaustAudit(id2, b, rows);
    expect(cp.permanentUnknown).toHaveLength(1);
    const cot = mockCotality({ pagesPerListing: { RLSX: [{ rows: [cPhoto(1)] }] } });
    const run = await runAudit({ listings: pagedReader(rows).reader, cotality: cot.reader, identity: id2, budgets: b, checkpoint: cp }); // no recheckPermanent
    expect(cot.log).toHaveLength(0); // NOT auto-probed
    expect(run.checkpoint.permanentUnknown).toHaveLength(1);
    expect(run.coverageComplete).toBe(false);
  });

  it('audit: --recheck-permanent re-probes and RESOLVES a now-available listing', async () => {
    const rows = [auditRow({ listing_id: 'RLSX' })];
    const cp = await exhaustAudit(id2, b, rows);
    const good = mockCotality({ pagesPerListing: { RLSX: [{ rows: [cPhoto(1)] }] } });
    const run = await runAudit({ listings: pagedReader(rows).reader, cotality: good.reader, identity: id2, budgets: b, checkpoint: cp, recheckPermanent: true });
    expect(good.log.length).toBeGreaterThan(0);        // it WAS re-probed
    expect(run.checkpoint.permanentUnknown).toHaveLength(0);
    expect(run.checkpoint.retryableUnknown).toHaveLength(0); // NEVER duplicated into retryable
    expect(run.inventory.find((r: { listingId: string }) => r.listingId === 'RLSX').bucket).toBe('B_NEW');
    expect(run.coverageComplete).toBe(true);
  });

  it('audit: --recheck-permanent resolves via Neon (gained media) with ZERO Cotality', async () => {
    const cp = await exhaustAudit(id2, b, [auditRow({ listing_id: 'RLSX' })]);
    const cot = mockCotality({ propertyError: 'must NOT be called' });
    const run = await runAudit({ listings: pagedReader([auditRow({ listing_id: 'RLSX', listing_media: [photoRow(1)] })]).reader, cotality: cot.reader, identity: id2, budgets: b, checkpoint: cp, recheckPermanent: true });
    expect(cot.log).toHaveLength(0);
    expect(run.checkpoint.permanentUnknown).toHaveLength(0);
    expect(run.inventory.find((r: { listingId: string }) => r.listingId === 'RLSX').bucket).not.toBe('U');
  });

  it('audit: a still-failing --recheck-permanent keeps it PERMANENT (updated reason), never retryable', async () => {
    const rows = [auditRow({ listing_id: 'RLSX' })];
    const cp = await exhaustAudit(id2, b, rows);
    const run = await runAudit({ listings: pagedReader(rows).reader, cotality: mockCotality({ propertyError: 'STILL down' }).reader, identity: id2, budgets: b, checkpoint: cp, recheckPermanent: true });
    expect(run.checkpoint.retryableUnknown).toHaveLength(0);   // never duplicated into retryable
    expect(run.checkpoint.permanentUnknown).toHaveLength(1);
    expect(run.checkpoint.permanentUnknown[0].lastReason).toContain('recheck');
    expect(run.coverageComplete).toBe(false);
  });

  it('dry-run: --recheck-permanent re-probes and ADDS the plan for a now-available listing', async () => {
    const rows = [dryRow({ listing_id: 'RLSX' })];
    const cp = await exhaustDryRun(dId2, b, rows);
    expect(cp.permanentUnknown).toHaveLength(1);
    const good = mockCotality({ pagesPerListing: { RLSX: [{ rows: [cPhoto(1)] }] } });
    const run = await runDryRun({ candidates: pagedReader(rows).reader, cotality: good.reader, identity: dId2, budgets: b, checkpoint: cp, recheckPermanent: true });
    expect(run.checkpoint.permanentUnknown).toHaveLength(0);
    expect(run.checkpoint.retryableUnknown).toHaveLength(0);
    expect(run.plans.map((p: { listingId: string }) => p.listingId)).toEqual(['RLSX']);
    expect(run.planComplete).toBe(true);
  });

  it('both CLIs register --recheck-permanent; the audit CLI requires --with-cotality (source + spawned tsx)', () => {
    expect(read('scripts/audit/media-coverage-audit.cli.ts')).toContain("'--recheck-permanent'");
    expect(read('scripts/backfill/bucket-b-media-dry-run.cli.ts')).toContain("'--recheck-permanent'");
    runTsx([
      "process.argv = [process.argv[0], process.argv[1], '--recheck-permanent'];",
      "const { main } = await import('./scripts/audit/media-coverage-audit.cli');",
      'await main();', 'process.exit(0);',
    ], 1);
  }, 150_000);
});

// ─── ROUND 5 (rev): probe/request-cap STOP consumes the listing budget ─────
//
// Once a retry row is fetched it is EXAMINED and consumes one maxListings unit
// (never refunded). When the probe cap is already spent the phase stops BEFORE
// the next read; when a probe defers on the request cap the phase stops after
// that one fetch. Either way the current entry + untouched tail stay queued and
// no further retry ids are read. Proven for BOTH audit and dry-run.

describe('ROUND 5 (rev) — retry-phase probe/request-cap stops are bounded', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `RLS${String(i).padStart(2, '0')}`);
  const uInv = ids.map((id) => ({ listingId: id, displayable: true, ownership: 'third-party', activeUsablePhotoCount: 0, allStatusRowCount: 0, legacyUsablePhotoCount: 0, cotality: { status: 'unknown', reason: 'x' }, bucket: 'U' }));
  const uTally = { A: 0, B_NEW: 0, B_INACTIVE: 0, C: 0, D: 0, E: 0, F: 0, U: 10 };
  const id1 = { ...TEST_IDENTITY, maxUnknownRetries: 3 };
  const dId1 = { ...DRY_IDENTITY, maxUnknownRetries: 3 };
  const auditSeed = () => ({ ...emptyCheckpoint(id1), cursor: 'RLS99', processed: 10, inventory: uInv.map((r) => ({ ...r })), tally: { ...uTally }, retryableUnknown: ids.map((id) => ({ listingId: id, attempts: 1, lastReason: 'x' })) });
  const drySeed = () => ({ ...emptyDryRunCheckpoint(dId1), cursor: 'RLS99', processed: 10, plans: [], retryableUnknown: ids.map((id) => ({ listingId: id, attempts: 1, lastReason: 'x' })) });

  it('audit B — maxCotalityProbes=1: exactly one read, stop immediately, 9-entry tail queued', async () => {
    const paged = pagedReader(ids.map((id) => auditRow({ listing_id: id })));
    const run = await runAudit({ listings: paged.reader, cotality: mockCotality({ pages: ids.map(() => ({ rows: [cPhoto(1)] })) }).reader, identity: id1, budgets: tightBudgets({ maxCotalityProbes: 1 }), checkpoint: auditSeed() });
    expect(paged.byIdCalls.flat()).toEqual(['RLS00']);         // only the first is read
    expect(run.runCounters.probesAttempted).toBe(1);
    expect(run.checkpoint.retryableUnknown.length).toBe(9);    // untouched tail
  });
  it('audit C — request cap defers the first probe: one read, full 10-entry queue resumable', async () => {
    const paged = pagedReader(ids.map((id) => auditRow({ listing_id: id })));
    const run = await runAudit({ listings: paged.reader, cotality: mockCotality().reader, identity: id1, budgets: tightBudgets({ maxCotalityRequests: 0 }), checkpoint: auditSeed() });
    expect(paged.byIdCalls.flat()).toEqual(['RLS00']);         // only that listing fetched/examined
    expect(run.runCounters.listingsFinalized).toBe(1);         // examined → consumed, not refunded
    expect(run.checkpoint.retryableUnknown.length).toBe(10);   // current entry + full tail
  });
  it('dry-run B — maxCotalityProbes=1: exactly one read, 9-entry tail queued', async () => {
    const paged = pagedReader(ids.map((id) => dryRow({ listing_id: id })));
    const run = await runDryRun({ candidates: paged.reader, cotality: mockCotality({ pages: ids.map(() => ({ rows: [cPhoto(1)] })) }).reader, identity: dId1, budgets: tightBudgets({ maxCotalityProbes: 1 }), checkpoint: drySeed() });
    expect(paged.byIdCalls.flat()).toEqual(['RLS00']);
    expect(run.runCounters.probesAttempted).toBe(1);
    expect(run.checkpoint.retryableUnknown.length).toBe(9);
  });
  it('dry-run C — request cap defers the first probe: one read, full 10-entry queue resumable', async () => {
    const paged = pagedReader(ids.map((id) => dryRow({ listing_id: id })));
    const run = await runDryRun({ candidates: paged.reader, cotality: mockCotality().reader, identity: dId1, budgets: tightBudgets({ maxCotalityRequests: 0 }), checkpoint: drySeed() });
    expect(paged.byIdCalls.flat()).toEqual(['RLS00']);
    expect(run.runCounters.listingsFinalized).toBe(1);
    expect(run.checkpoint.retryableUnknown.length).toBe(10);
  });
});

// ─── ROUND 5 (rev): ONE retry policy enforced at the logic boundary ────────

describe('ROUND 5 (rev) — one retry policy at the logic boundary', () => {
  it('a direct caller with identity policy 3 and budget policy 5 is REFUSED (audit + dry-run)', async () => {
    await expect(runAudit({ listings: pagedReader([]).reader, identity: { ...TEST_IDENTITY, maxUnknownRetries: 3 }, budgets: tightBudgets({ maxUnknownRetriesPerListing: 5 }) }))
      .rejects.toThrow(/retry policy mismatch/);
    await expect(runDryRun({ candidates: pagedReader([]).reader, cotality: mockCotality().reader, identity: { ...DRY_IDENTITY, maxUnknownRetries: 3 }, budgets: tightBudgets({ maxUnknownRetriesPerListing: 5 }) }))
      .rejects.toThrow(/retry policy mismatch/);
  });
  it('an out-of-range policy (0 or > MAX_UNKNOWN_RETRIES) is refused before any read', async () => {
    await expect(runAudit({ listings: pagedReader([]).reader, identity: { ...TEST_IDENTITY, maxUnknownRetries: 0 }, budgets: tightBudgets({ maxUnknownRetriesPerListing: 0 }) }))
      .rejects.toThrow(/integer in \[1/);
    await expect(runAudit({ listings: pagedReader([]).reader, identity: { ...TEST_IDENTITY, maxUnknownRetries: MAX_UNKNOWN_RETRIES + 1 }, budgets: tightBudgets({ maxUnknownRetriesPerListing: MAX_UNKNOWN_RETRIES + 1 }) }))
      .rejects.toThrow(/integer in \[1/);
  });
  it('the shared MAX_UNKNOWN_RETRIES ceiling replaces the hardcoded 100 (source pins)', () => {
    const audit = read('scripts/audit/media-coverage-audit.ts');
    expect(audit).not.toContain('e.attempts > 100');
    expect(audit).toContain('assertRetryPolicy(budgets, deps.identity)');
    expect(read('scripts/backfill/bucket-b-media-dry-run.ts')).toContain('assertRetryPolicy(budgets, deps.identity)');
  });
});
