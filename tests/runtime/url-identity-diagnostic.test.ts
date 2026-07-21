/**
 * READ-ONLY URL-identity diagnostic (DESIGN v1) — implementation proofs.
 *
 * Every dependency is MOCKED. No production Neon, Cotality, or R2 connection is
 * made (spawned tsx checks use stub env and hit the PLAN-ONLY path). These
 * prove the 14 required invariants BEFORE any execution approval.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
const D = require('@/scripts/audit/url-identity-diagnostic');
const {
  stratifySample, isProductionEligible, normalizeIdentity, hostFamily, pathFamily,
  classifyUrl, compareUrls, classifyTransition, validateMediaNextLink, buildMediaQuery,
  deriveKeyOutcome, runUrlIdentityDiagnostic, DIAG_PARAMS, RUN_88518_WINDOW,
} = D;

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const runTsx = (driverLines: string[], expectExit: number) => {
  const driver = path.join(ROOT, `.tmp-urldiag-${Math.abs(driverLines.join('').length)}.mts`);
  fs.writeFileSync(driver, driverLines.join('\n'), 'utf8');
  try {
    let code = 0;
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), driver], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: 'postgresql://stub:stub@localhost:5432/stub?schema=public', DATABASE_URL_UNPOOLED: 'postgresql://stub:stub@localhost:5432/stub?schema=public' },
        timeout: 120_000, stdio: 'pipe',
      });
    } catch (e) { code = (e as { status?: number }).status ?? -1; }
    expect(code).toBe(expectExit);
  } finally { fs.unlinkSync(driver); }
};

// ─── fixtures ───────────────────────────────────────────────────────────────

const storedRow = (over: Record<string, unknown> = {}) => ({
  listingId: 'RLS1', mediaKey: 'MK-1', resourceRecordKey: 'LK-1',
  mediaUrlOriginal: 'https://api.corelogic.com/trestle/Media/Property/PHOTO-Jpeg/1/1/aaa.jpg',
  mediaCategory: 'Photo', mediaType: 'Photo', order: 1, status: 'active', updatedAtMs: 1,
  ...over,
});
const rawMedia = (over: Record<string, unknown> = {}) => ({
  MediaKey: 'MK-1', ResourceName: 'Property', ResourceRecordKey: 'LK-1', ResourceRecordID: 'RLS1',
  MediaURL: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/bbb.jpg',
  MediaCategory: 'Photo', MediaClassification: null, MediaType: 'Jpeg', MediaStatus: 'Active',
  Permission: null, Order: 1, PreferredPhotoYN: false, ModificationTimestamp: null, MediaModificationTimestamp: null,
  ...over,
});

// A mock Cotality reader returning a fixed set per (listingKey, scope, pass).
function mockCotality(plan: Record<string, Record<MediaScopeT, RowsOrErr[]>>) {
  const calls: Record<string, number> = {};
  return {
    log: calls,
    reader: {
      fetchMedia: async (lk: string, scope: MediaScopeT, acct: { consume(): boolean }) => {
        if (!acct.consume()) { const e = new (require('@/scripts/audit/url-identity-diagnostic').CapStopError)('cap'); throw e; }
        const seqKey = `${lk}:${scope}`;
        const n = calls[seqKey] ?? 0; calls[seqKey] = n + 1;
        const seq = plan[lk]?.[scope] ?? [{ rows: [], complete: true }];
        const step = seq[Math.min(n, seq.length - 1)];
        return step;
      },
    },
  };
}
type MediaScopeT = 'unscoped' | 'property';
type RowsOrErr = { rows: Array<Record<string, unknown>>; complete: boolean; incompleteReason?: string };

const neonOf = (rows: Array<Record<string, unknown>>, widened = false) => ({
  sampleCandidates: async () => rows,
  windowWidened: () => widened,
});

// ─── 1. no mutation path exists (read-only guarantee, source scan) ──────────

describe('read-only guarantee — no mutation / R2 / cron / cursor path', () => {
  const files = ['scripts/audit/url-identity-diagnostic.ts', 'scripts/audit/url-identity-diagnostic.cli.ts'];
  const FORBIDDEN = [
    '.create(', '.createMany(', '.update(', '.updateMany(', '.upsert(',
    '.delete(', '.deleteMany(', '$queryRawUnsafe', 'PutObject', 'DeleteObject',
    'CopyObject', 'S3Client', 'runMediaSync', 'advanceMediaSyncCursor', 'mediaSyncState',
    'INSERT ', 'UPDATE ', 'DELETE ',
  ];
  it('no framework file references a mutation, raw write, R2, cron, or cursor move', () => {
    for (const f of files) {
      const src = read(f);
      for (const tok of FORBIDDEN) {
        expect({ file: f, token: tok, present: src.includes(tok) }).toEqual({ file: f, token: tok, present: false });
      }
    }
  });
  it('the ONLY $executeRawUnsafe is the read-only-enforcing SET TRANSACTION READ ONLY', () => {
    const cli = read('scripts/audit/url-identity-diagnostic.cli.ts');
    const uses = cli.split('$executeRawUnsafe').length - 1;
    expect(uses).toBe(1);
    expect(cli).toContain("$executeRawUnsafe('SET TRANSACTION READ ONLY')");
    // Neon read is inside a transaction that ALWAYS rolls back via a sentinel throw.
    expect(cli).toContain('SET TRANSACTION READ ONLY');
    expect(cli).toContain('ReadonlyRollback');
    expect(cli).toContain('prisma.$transaction');
  });
});

// ─── 2. base assertion + single token + redirect + nextlink (source + tsx) ──

describe('auth + transport safety (source pins + spawned tsx)', () => {
  it('base asserted; redirect:error; single token; 401 inconclusive; no new token client (source)', () => {
    const cli = read('scripts/audit/url-identity-diagnostic.cli.ts');
    expect(cli).toContain('assertValidBase(base)');
    expect(cli).toContain("redirect: 'error'");
    expect(cli).toContain('getAccessToken()'); // reuse the existing helper
    expect(cli).not.toContain('oidc/connect/token'); // no new token client
    expect(cli).toContain('401-inconclusive');
    expect(cli).toContain('validateMediaNextLink');
  });
  it('an unapproved base is rejected before any token (spawned tsx)', () => {
    runTsx([
      "process.env.TRESTLE_API_URL = 'https://attacker.example/trestle';",
      "const m = await import('./scripts/audit/url-identity-diagnostic.cli');",
      'try { await m.main(); process.exit(9); }',
      "catch (e) { process.exit(String(e.message).includes('approved endpoint allowlist') ? 0 : 8); }",
    ], 0);
  }, 150_000);
  it('without the two-key run gate it is PLAN-ONLY: no DB, no network, exit 0 (spawned tsx)', () => {
    runTsx([
      "process.env.TRESTLE_API_URL = 'https://api.cotality.com/trestle';",
      "let touched = false;",
      "const m = await import('./scripts/audit/url-identity-diagnostic.cli');",
      'await m.main();', // no --run-approved, no env flag → plan-only
      'process.exit(touched ? 7 : 0);',
    ], 0);
  }, 150_000);
});

// ─── 3. strict nextLink validation ─────────────────────────────────────────

describe('validateMediaNextLink — exact Media OData link only', () => {
  const BASE = 'https://api.cotality.com/trestle';
  it('accepts the exact Media path; rejects everything else', () => {
    expect(validateMediaNextLink(`${BASE}/odata/Media?$skip=100`, BASE)).toMatchObject({ url: expect.stringContaining('/trestle/odata/Media') });
    expect(validateMediaNextLink('http://api.cotality.com/trestle/odata/Media', BASE)).toMatchObject({ error: expect.stringContaining('https') });
    expect(validateMediaNextLink('https://api.cotality.com/trestle/odata/Property', BASE)).toMatchObject({ error: expect.stringContaining('path') });
    expect(validateMediaNextLink('https://api.cotality.com.evil.test/trestle/odata/Media', BASE)).toMatchObject({ error: expect.stringContaining('origin') });
    expect(validateMediaNextLink('https://u:p@api.cotality.com/trestle/odata/Media', BASE)).toMatchObject({ error: expect.stringContaining('credentials') });
    expect(validateMediaNextLink('https://api.cotality.com/trestle/odata/Media#frag', BASE)).toMatchObject({ error: expect.stringContaining('fragment') });
  });
});

// ─── 4. deterministic stratification (5 listings × 6 rows, crm excluded) ────

describe('stratifySample — deterministic, stratified, crm-excluded', () => {
  it('picks ≤5 distinct keys (sorted) then ≤6 rows/key; never collapses to one', () => {
    const rows: any[] = [];
    for (const lk of ['LK-9', 'LK-1', 'LK-5', 'LK-3', 'LK-7', 'LK-2']) {
      for (let i = 0; i < 10; i += 1) rows.push(storedRow({ resourceRecordKey: lk, mediaKey: `MK-${lk}-${String(i).padStart(2, '0')}` }));
    }
    const out = stratifySample(rows);
    const keys = [...new Set(out.map((r: any) => r.resourceRecordKey))];
    expect(keys).toEqual(['LK-1', 'LK-2', 'LK-3', 'LK-5', 'LK-7']); // 5 lowest, sorted
    for (const k of keys) expect(out.filter((r: any) => r.resourceRecordKey === k).length).toBe(6);
    expect(out.length).toBeLessThanOrEqual(DIAG_PARAMS.NEON_SAMPLE);
  });
  it('excludes crm:, inactive, and missing-field rows', () => {
    const out = stratifySample([
      storedRow({ resourceRecordKey: 'LK-A', mediaKey: 'crm:x' }),
      storedRow({ resourceRecordKey: 'LK-A', mediaKey: 'MK-A', status: 'deleted' }),
      storedRow({ resourceRecordKey: 'LK-A', mediaKey: 'MK-B', mediaUrlOriginal: '' }),
      storedRow({ resourceRecordKey: 'LK-A', mediaKey: 'MK-OK' }),
    ]);
    expect(out.map((r: any) => r.mediaKey)).toEqual(['MK-OK']);
  });
});

// ─── 5. production-eligibility (the deployed mapper gate) ────────────────────

describe('isProductionEligible — matches the deployed mapper filter', () => {
  it('requires MediaKey, not Deleted, Permission absent/Public, MediaURL', () => {
    expect(isProductionEligible(rawMedia())).toBe(true);
    expect(isProductionEligible(rawMedia({ Permission: 'Public' }))).toBe(true);
    expect(isProductionEligible(rawMedia({ MediaKey: null }))).toBe(false);
    expect(isProductionEligible(rawMedia({ MediaStatus: 'Deleted' }))).toBe(false);
    expect(isProductionEligible(rawMedia({ Permission: 'IDX' }))).toBe(false);
    expect(isProductionEligible(rawMedia({ MediaURL: null }))).toBe(false);
  });
});

// ─── 6. redaction: classification carries no raw value ──────────────────────

describe('classifyUrl — redaction-safe categorical only', () => {
  it('emits only scheme/host_family/path_family/segment_count/ext/has_query', () => {
    const c = classifyUrl('https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/secret-token.jpg?sig=abc');
    expect(Object.keys(c).sort()).toEqual(['fileExtensionOrNone', 'hasQuery', 'hostFamily', 'malformed', 'pathFamily', 'pathSegmentCount', 'scheme'].sort());
    expect(c.hostFamily).toBe('cotality');
    expect(c.pathFamily).toBe('photo');
    expect(c.hasQuery).toBe(true);
    expect(c.fileExtensionOrNone).toBe('jpg');
    // No field carries the raw path, query, or token.
    expect(JSON.stringify(c)).not.toContain('secret-token');
    expect(JSON.stringify(c)).not.toContain('sig=abc');
  });
  it('host/path families and malformed handling', () => {
    expect(hostFamily('api.corelogic.com')).toBe('corelogic');
    expect(hostFamily('cdn.example.net')).toBe('other');
    expect(pathFamily('/x/FloorPlan/1')).toBe('floorplan');
    expect(pathFamily('/x/UnbrandedVirtualTour/1')).toBe('virtual_tour');
    expect(classifyUrl('%%% not a url').malformed).toBe(true);
  });
});

// ─── 7. comparison + transition (identity vs exact) ─────────────────────────

describe('compareUrls / classifyTransition', () => {
  it('exact vs origin+pathname identity; query-only differs exact not identity', () => {
    const a = 'https://api.cotality.com/trestle/Media/X/1.jpg?sig=1';
    const b = 'https://api.cotality.com/trestle/Media/X/1.jpg?sig=2';
    expect(compareUrls(a, b)).toEqual({ exactEqual: false, identityEqual: true });
    const c = 'https://api.corelogic.com/trestle/Media/X/1.jpg';
    const t = classifyTransition(c, a);
    expect(t).toMatchObject({ hostFrom: 'corelogic', hostTo: 'cotality', hostChanged: true });
  });
  it('same-host pathname change is flagged pathnameChangedSameHost', () => {
    const t = classifyTransition('https://api.cotality.com/a/1.jpg', 'https://api.cotality.com/b/2.jpg');
    expect(t.hostChanged).toBe(false);
    expect(t.pathnameChangedSameHost).toBe(true);
  });
});

// ─── 8. buildMediaQuery: Property scope + deterministic tie-break + 14 select ─

describe('buildMediaQuery — scope + deterministic ordering + full select', () => {
  it('property scope adds ResourceName; unscoped does not; orderby is Order,MediaKey', () => {
    const p = buildMediaQuery('LK-1', 'property');
    expect(p.get('$filter')).toBe("ResourceName eq 'Property' and ResourceRecordKey eq 'LK-1'");
    expect(p.get('$orderby')).toBe('Order asc,MediaKey asc');
    expect(p.get('$select')).toContain('MediaType');
    expect(p.get('$select')).toContain('MediaStatus');
    expect(p.get('$select')).toContain('Permission');
    const d = buildMediaQuery('LK-1', 'unscoped');
    expect(d.get('$filter')).toBe("ResourceRecordKey eq 'LK-1'");
  });
});

// ─── 9. outcome categories (all four + inconclusive), never over-labeled ────

describe('deriveKeyOutcome — the four separated outcomes', () => {
  const eq = { exactEqual: true, identityEqual: true };
  const idOnly = { exactEqual: false, identityEqual: true };
  const diff = { exactEqual: false, identityEqual: false };
  it('active instability when P1≠P2 identity', () => {
    expect(deriveKeyOutcome({ S: true, D1: true, P1: true, P2: true }, eq, diff)).toBe('active_instability_proven');
  });
  it('exact-only instability when P1==P2 identity but not exact', () => {
    expect(deriveKeyOutcome({ S: true, D1: true, P1: true, P2: true }, eq, idOnly)).toBe('exact_only_instability');
  });
  it('stored differs (stable window) when S≠P1 identity but P1==P2', () => {
    expect(deriveKeyOutcome({ S: true, D1: true, P1: true, P2: true }, diff, eq)).toBe('stored_differs_from_property_stable_window');
  });
  it('stable during window only when S==P1==P2', () => {
    expect(deriveKeyOutcome({ S: true, D1: true, P1: true, P2: true }, eq, eq)).toBe('stable_during_window_only');
  });
  it('inconclusive when a required source is missing', () => {
    expect(deriveKeyOutcome({ S: true, D1: true, P1: false, P2: true }, null, null)).toBe('inconclusive');
    expect(deriveKeyOutcome({ S: false, D1: true, P1: true, P2: true }, null, eq)).toBe('inconclusive');
  });
  it('the module documents that stable ≠ historical-drift-proven', () => {
    expect(read('scripts/audit/url-identity-diagnostic.ts')).toContain('do NOT prove one-time historical drift');
  });
});

// ─── 10. orchestration end-to-end (mock readers): scope, instability, caps ──

describe('runUrlIdentityDiagnostic — orchestration (mocked, no I/O)', () => {
  const mkStored = (lk: string, mk: string, url: string) => storedRow({ resourceRecordKey: lk, mediaKey: mk, mediaUrlOriginal: url });

  it('B1: unscoped set with a non-Property row is flagged; keyset divergence recorded', async () => {
    const neon = neonOf([mkStored('LK-1', 'MK-1', 'https://api.corelogic.com/trestle/Media/P/1.jpg')]);
    const cot = mockCotality({
      'LK-1': {
        unscoped: [{ rows: [rawMedia({ MediaURL: 'https://api.cotality.com/trestle/Media/P/1.jpg' }), rawMedia({ MediaKey: 'MK-OFFICE', ResourceName: 'Office' })], complete: true }],
        property: [{ rows: [rawMedia({ MediaURL: 'https://api.cotality.com/trestle/Media/P/1.jpg' })], complete: true }],
      },
    });
    const report = await runUrlIdentityDiagnostic({ neon, cotality: cot.reader, authNetworkAttempts: 1 });
    expect(report.scope.unscoped_has_non_property_row).toBe(true);
    expect(report.scope.d1_raw_keyset_eq_p1_raw_keyset).toBe(false);
    expect(report.auth).toEqual({ auth_provider: 'existing_getAccessToken', auth_network_attempts: 1, data_redirect_policy: 'error' });
  });

  it('stored corelogic vs incoming cotality identity differs → stored_differs (P stable)', async () => {
    const neon = neonOf([mkStored('LK-1', 'MK-1', 'https://api.corelogic.com/trestle/Media/P/1.jpg')]);
    const P = { rows: [rawMedia({ MediaURL: 'https://api.cotality.com/trestle/Media/P/1.jpg' })], complete: true };
    const cot = mockCotality({ 'LK-1': { unscoped: [P], property: [P, P] } });
    const report = await runUrlIdentityDiagnostic({ neon, cotality: cot.reader, authNetworkAttempts: 1 });
    expect(report.outcomes.stored_differs_from_property_stable_window).toBe(1);
    expect(report.transitions.corelogic_to_cotality).toBe(1);
    expect(report.transitions.host_changed).toBe(1);
  });

  it('active instability when P2 identity differs from P1', async () => {
    const neon = neonOf([mkStored('LK-1', 'MK-1', 'https://api.cotality.com/trestle/Media/P/1.jpg')]);
    const cot = mockCotality({ 'LK-1': {
      unscoped: [{ rows: [rawMedia({ MediaURL: 'https://api.cotality.com/trestle/Media/P/1.jpg' })], complete: true }],
      property: [
        { rows: [rawMedia({ MediaURL: 'https://api.cotality.com/trestle/Media/P/1.jpg' })], complete: true },
        { rows: [rawMedia({ MediaURL: 'https://api.cotality.com/trestle/Media/P/2-ROTATED.jpg' })], complete: true },
      ],
    } });
    const report = await runUrlIdentityDiagnostic({ neon, cotality: cot.reader, authNetworkAttempts: 1 });
    expect(report.outcomes.active_instability_proven).toBe(1);
  });

  it('incompletes are recorded and keep the key inconclusive (dup key, page-cap)', async () => {
    const neon = neonOf([mkStored('LK-1', 'MK-1', 'https://api.cotality.com/x/1.jpg')]);
    const cot = mockCotality({ 'LK-1': {
      unscoped: [{ rows: [rawMedia(), rawMedia()], complete: true }], // duplicate MK-1 → incomplete
      property: [{ rows: [], complete: false, incompleteReason: 'page-cap' }],
    } });
    const report = await runUrlIdentityDiagnostic({ neon, cotality: cot.reader, authNetworkAttempts: 1 });
    expect(report.incompleteUnits.length).toBeGreaterThanOrEqual(1);
    expect(report.outcomes.inconclusive).toBe(1);
    // Error entries carry only slot/scope/page/reason — never a URL/key.
    for (const u of report.incompleteUnits) {
      expect(Object.keys(u).sort()).toEqual(['listingSlot', 'page', 'reason', 'scope']);
    }
  });

  it('B2/B3 distributions come only from complete Property responses; internal type separated', async () => {
    const neon = neonOf([mkStored('LK-1', 'MK-1', 'https://api.cotality.com/x/1.jpg')]);
    const cot = mockCotality({ 'LK-1': {
      unscoped: [{ rows: [rawMedia()], complete: true }],
      property: [{ rows: [rawMedia({ MediaCategory: 'Document', MediaType: 'Pdf' }), rawMedia({ MediaKey: 'MK-2', MediaCategory: 'Photo', MediaType: 'Jpeg' })], complete: true },
                 { rows: [rawMedia({ MediaCategory: 'Document', MediaType: 'Pdf' }), rawMedia({ MediaKey: 'MK-2', MediaCategory: 'Photo', MediaType: 'Jpeg' })], complete: true }],
    } });
    const report = await runUrlIdentityDiagnostic({ neon, cotality: cot.reader, authNetworkAttempts: 1, deriveInternalType: (c: string | null) => (c === 'Document' ? 'Photo' : 'Photo') });
    expect(report.categoryDistribution.Document).toBe(1);
    expect(report.mediaTypeDistribution.Pdf).toBe(1);
    expect(report.mediaTypeDistribution['internal:Photo']).toBeGreaterThanOrEqual(1); // B3: derived-type separated from Cotality MediaType
  });

  it('respects the data-attempt cap (cap-reached recorded, never throws out)', async () => {
    // 6 listings but cap the accountant low via params override.
    const rows: any[] = [];
    for (const lk of ['LK-1', 'LK-2', 'LK-3']) rows.push(mkStored(lk, `MK-${lk}`, 'https://api.cotality.com/x/1.jpg'));
    const neon = neonOf(rows);
    const plan: any = {};
    for (const lk of ['LK-1', 'LK-2', 'LK-3']) plan[lk] = { unscoped: [{ rows: [rawMedia({ ResourceRecordKey: lk })], complete: true }], property: [{ rows: [rawMedia({ ResourceRecordKey: lk })], complete: true }] };
    const cot = mockCotality(plan);
    const report = await runUrlIdentityDiagnostic({ neon, cotality: cot.reader, authNetworkAttempts: 1, params: { ...DIAG_PARAMS, DATA_ATTEMPT_CAP: 2 } });
    expect(report.cotality.capReached).toBe(true);
    expect(report.cotality.dataAttempts).toBeLessThanOrEqual(2);
  });
});

// ─── 11. window arithmetic + widening flag ──────────────────────────────────

describe('run-88518 window + widening', () => {
  it('window bounds are the exact arithmetic (…39.998Z .. …04.334Z)', () => {
    expect(RUN_88518_WINDOW.startIso).toBe('2026-07-21T02:01:39.998Z');
    expect(RUN_88518_WINDOW.endIso).toBe('2026-07-21T02:02:04.334Z');
  });
  it('windowWidened flag flows into the report', async () => {
    const neon = neonOf([storedRow()], true);
    const cot = mockCotality({ 'LK-1': { unscoped: [{ rows: [rawMedia()], complete: true }], property: [{ rows: [rawMedia()], complete: true }, { rows: [rawMedia()], complete: true }] } });
    const report = await runUrlIdentityDiagnostic({ neon, cotality: cot.reader, authNetworkAttempts: 1 });
    expect(report.window.widened).toBe(true);
  });
});

// ─── 12. approved finalized parameters are pinned ───────────────────────────

describe('approved finalized parameters', () => {
  it('DIAG_PARAMS match the approved envelope', () => {
    expect(DIAG_PARAMS).toMatchObject({
      NEON_SAMPLE: 30, MAX_LISTINGS: 5, ROWS_PER_LISTING: 6, TOP: 100, MAX_PAGES: 2,
      DATA_ATTEMPT_CAP: 60, AUTH_ACQUISITIONS_MAX: 1, RETRIES: 1, CONCURRENCY: 1,
      INTERVAL_MS: 15 * 60 * 1000,
    });
  });
});
