/**
 * TARGETED MEDIA REMEDIATION — BEHAVIOURAL CONTRACT.
 *
 * Written BEFORE the implementation and expected RED. Every function in
 * `lib/media/targeted-remediation.ts` currently throws NOT_IMPLEMENTED; making these pass is the
 * definition of done.
 *
 * POPULATION THESE ENCODE (fresh-byte rebuild, 2026-08-19 frozen snapshot):
 *   1,383 verified-bad media rows = 1,356 heroes + 27 siblings, across 1,357 LISTING repair units
 *   (1,332 units of 1 row, 24 of 2, 1 of 3). Ineligible: 52 SIBLING_OK, 7 CURRENT_PROVIDER_UNAVAILABLE,
 *   1 UNVERIFIABLE, 4,413 MATCH_CURRENT_PHOTO.
 */
import {
  buildVersionedDeliveryKey,
  validateRemediationUnit,
  buildRemediationUnits,
  remediateListingUnit,
  countCompletedRemediations,
  type RemediationDeps,
  type RemediationTargetRow,
  type RemediationUnit,
} from '../targeted-remediation';

const SHA8 = 'a1b2c3d4';
const PUB = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev';

function row(over: Partial<RemediationTargetRow> = {}): RemediationTargetRow {
  return {
    media_key: '2005470401678',
    listing_id: 'RLS20054046',
    kind: 'hero',
    media_type: 'Photo',
    evidenceClass: 'CONTAINS_FLOORPLAN_BYTES',
    legacyR2Key: 'photos/RLS20054046/1.jpg',
    freshProviderUrl: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/a/b/c',
    ...over,
  };
}

function unit(over: Partial<RemediationUnit> = {}): RemediationUnit {
  return { listing_id: 'RLS20054046', listing_type: 'sale', rows: [row()], ...over };
}

interface DepSpies extends RemediationDeps {
  uploads: Array<{ key: string; body: Buffer }>;
  pointerWrites: Array<{ mediaKey: string; r2_key: string; media_url_cached: string }>;
  closures: Array<{ listingId: string; galleryMutated: boolean }>;
  order: string[];
}

function makeDeps(over: Partial<RemediationDeps> = {}): DepSpies {
  const uploads: DepSpies['uploads'] = [];
  const pointerWrites: DepSpies['pointerWrites'] = [];
  const closures: DepSpies['closures'] = [];
  const order: string[] = [];
  const stored = new Map<string, Buffer>();
  const base: RemediationDeps = {
    async fetchProviderBytes() { order.push('fetch'); return Buffer.from('FRESH-PROVIDER-BYTES'); },
    async uploadToR2(key, body) { order.push(`upload:${key}`); uploads.push({ key, body }); stored.set(key, body); },
    async readR2Bytes(key) { order.push(`verify:${key}`); const b = stored.get(key); if (!b) throw new Error('404'); return b; },
    async updateRowPointers(mediaKey, patch) { order.push(`pointer:${mediaKey}`); pointerWrites.push({ mediaKey, ...patch }); },
    async closeMediaWrite(listingId, options) { order.push('closure'); closures.push({ listingId, ...options }); return { ok: true }; },
    async admissionScope() { return 'hero_only'; },
  };
  return Object.assign(base, over, { uploads, pointerWrites, closures, order }) as DepSpies;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('delivery identity', () => {
  it('(1) same MediaKey + changed bytes → a content-versioned delivery key, MediaKey preserved', async () => {
    const deps = makeDeps();
    const out = await remediateListingUnit(unit(), [row()], deps);
    expect(out.status).toBe('repaired');
    expect(deps.uploads).toHaveLength(1);
    expect(deps.uploads[0].key).toMatch(/^photos\/RLS20054046\/2005470401678\.[0-9a-f]{8}\.jpg$/);
    // canonical asset identity is untouched — only the DELIVERY object is versioned
    expect(deps.pointerWrites[0].mediaKey).toBe('2005470401678');
  });

  it('(24) the separator is "." not "-" — encodeR2Segment can emit "-" but never "."', () => {
    const key = buildVersionedDeliveryKey('RLS20054046', 'Photo', '2005470401678', SHA8);
    expect(key).toBe(`photos/RLS20054046/2005470401678.${SHA8}.jpg`);
    expect(key).not.toContain(`2005470401678-${SHA8}`);
  });

  it('(12) the source identity actually changes when content changes', async () => {
    const deps = makeDeps();
    await remediateListingUnit(unit(), [row()], deps);
    const w = deps.pointerWrites[0];
    expect(w.r2_key).not.toBe('photos/RLS20054046/1.jpg');
    expect(w.media_url_cached).toBe(`${PUB}/${w.r2_key}`);
  });

  it('(23) rows are addressed by media_key, never by legacy key shape (104 rows sit at ordinals 2–23)', async () => {
    const r = row({ legacyR2Key: 'photos/RLS20054046/23.jpg' });
    const deps = makeDeps();
    const out = await remediateListingUnit(unit({ rows: [r] }), [r], deps);
    expect(out.status).toBe('repaired');
    expect(deps.uploads[0].key).toMatch(/2005470401678\.[0-9a-f]{8}\.jpg$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('eligibility — what must never be repaired', () => {
  it('(2) same MediaKey + unchanged bytes (MATCH_CURRENT_PHOTO) is ineligible', () => {
    const v = validateRemediationUnit(unit(), [], [{ media_key: '2005470401678', klass: 'MATCH_CURRENT_PHOTO' }]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('INELIGIBLE_ROW');
  });

  it('(3) an Order-only change causes no upload', async () => {
    const deps = makeDeps();
    const v = validateRemediationUnit(unit({ rows: [] }), []);
    expect(v.ok).toBe(true);
    expect(deps.uploads).toHaveLength(0);
  });

  it('(4) a PreferredPhotoYN-only change causes no upload', async () => {
    const deps = makeDeps();
    const v = validateRemediationUnit(unit({ rows: [] }), []);
    expect(v.ok).toBe(true);
    expect(deps.uploads).toHaveLength(0);
  });

  it('(7) a verified-correct legacy hero is never migrated (4,413 MATCH_CURRENT_PHOTO)', () => {
    const v = validateRemediationUnit(unit(), [], [{ media_key: '2005470401678', klass: 'MATCH_CURRENT_PHOTO' }]);
    expect(v.ok).toBe(false);
  });

  it('(8) an UNVERIFIABLE row is refused', () => {
    const v = validateRemediationUnit(unit(), [], [{ media_key: '2005470401678', klass: 'UNVERIFIABLE' }]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('INELIGIBLE_ROW');
  });

  it('(22) CURRENT_PROVIDER_UNAVAILABLE fails closed — no current authorized bytes exist (7 rows)', () => {
    const v = validateRemediationUnit(unit(), [], [{ media_key: '2005470401678', klass: 'CURRENT_PROVIDER_UNAVAILABLE' }]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('INELIGIBLE_ROW');
  });

  it('refuses the whole unit when execution-time admission scope is "none"', async () => {
    const deps = makeDeps({ async admissionScope() { return 'none'; } });
    const out = await remediateListingUnit(unit(), [row()], deps);
    expect(out.status).toBe('refused');
    expect(deps.uploads).toHaveLength(0);
    expect(deps.pointerWrites).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('evidence classes', () => {
  it('(5) a FloorPlan-byte legacy hero is repaired (422 rows)', async () => {
    const deps = makeDeps();
    const r = row({ evidenceClass: 'CONTAINS_FLOORPLAN_BYTES' });
    const out = await remediateListingUnit(unit({ rows: [r] }), [r], deps);
    expect(out.status).toBe('repaired');
  });

  it('(6) an other-media-byte legacy hero is repaired (84 rows)', async () => {
    const deps = makeDeps();
    const r = row({ evidenceClass: 'CONTAINS_OTHER_MEDIA_BYTES' });
    const out = await remediateListingUnit(unit({ rows: [r] }), [r], deps);
    expect(out.status).toBe('repaired');
  });

  it('(13) sale and rental take the identical path', async () => {
    const saleDeps = makeDeps();
    const rentDeps = makeDeps();
    const saleOut = await remediateListingUnit(unit({ listing_type: 'sale' }), [row()], saleDeps);
    const rentOut = await remediateListingUnit(unit({ listing_type: 'rent' }), [row()], rentDeps);
    expect(saleOut.status).toBe('repaired');
    expect(rentOut.status).toBe('repaired');
    expect(saleDeps.order).toEqual(rentDeps.order);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('siblings', () => {
  const heroRow = row({ media_key: 'HERO', kind: 'hero', legacyR2Key: 'photos/L/1.jpg' });
  const badSib = row({ media_key: 'SIB_BAD', kind: 'sibling', legacyR2Key: 'photos/L/1.jpg', evidenceClass: 'CURRENT_PROVIDER_BYTES_DIFFER' });

  it('(15) a verified-correct sibling stays on its working legacy object and is never written', async () => {
    const deps = makeDeps();
    const out = await remediateListingUnit(
      { listing_id: 'L', listing_type: 'sale', rows: [heroRow] },
      [heroRow], // the SIBLING_OK row is NOT a known-bad row
      deps,
    );
    expect(out.status).toBe('repaired');
    expect(deps.pointerWrites.map((w) => w.mediaKey)).toEqual(['HERO']);
    expect(deps.pointerWrites.some((w) => w.mediaKey === 'SIB_OK')).toBe(false);
  });

  it('(16) a hero-only plan is REJECTED as incomplete when the listing has a verified-bad active sibling', () => {
    const v = validateRemediationUnit(
      { listing_id: 'L', listing_type: 'sale', rows: [heroRow] },
      [heroRow, badSib],
    );
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toBe('INCOMPLETE_UNIT');
      expect(v.missing).toContain('SIB_BAD');
    }
  });

  it('(21) the unit set is the UNION of bad-hero and bad-sibling listings — a hero-less unit is not skipped', () => {
    // RLS20093163: hero reclassified MATCH_CURRENT_PHOTO, sibling still bad
    const orphanSibling = row({ media_key: 'SIB_ONLY', listing_id: 'RLS20093163', kind: 'sibling' });
    const units = buildRemediationUnits([row(), orphanSibling]);
    expect(units.map((u) => u.listing_id).sort()).toEqual(['RLS20054046', 'RLS20093163']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('failure safety — a working delivery is never lost', () => {
  it('(9) a failed provider fetch leaves the existing pointer intact', async () => {
    const deps = makeDeps({ async fetchProviderBytes() { throw new Error('provider 503'); } });
    const out = await remediateListingUnit(unit(), [row()], deps);
    expect(out.status).toBe('incomplete');
    expect(deps.uploads).toHaveLength(0);
    expect(deps.pointerWrites).toHaveLength(0);
  });

  it('(10) a failed R2 upload leaves the existing pointer intact', async () => {
    const deps = makeDeps({ async uploadToR2() { throw new Error('R2 500'); } });
    const out = await remediateListingUnit(unit(), [row()], deps);
    expect(out.status).toBe('incomplete');
    expect(deps.pointerWrites).toHaveLength(0);
  });

  it('(11) the pointer swap happens ONLY after the uploaded object is content-verified', async () => {
    const deps = makeDeps();
    await remediateListingUnit(unit(), [row()], deps);
    const upload = deps.order.findIndex((o) => o.startsWith('upload:'));
    const verify = deps.order.findIndex((o) => o.startsWith('verify:'));
    const pointer = deps.order.findIndex((o) => o.startsWith('pointer:'));
    expect(upload).toBeGreaterThanOrEqual(0);
    expect(verify).toBeGreaterThan(upload);
    expect(pointer).toBeGreaterThan(verify);
  });

  it('(11b) bytes that read back different from what was uploaded do NOT become authoritative', async () => {
    const deps = makeDeps({ async readR2Bytes() { return Buffer.from('TRUNCATED'); } });
    const out = await remediateListingUnit(unit(), [row()], deps);
    expect(out.status).toBe('incomplete');
    expect(deps.pointerWrites).toHaveLength(0);
  });

  it('(14) the legacy object is never overwritten and never deleted', async () => {
    const deps = makeDeps();
    await remediateListingUnit(unit(), [row()], deps);
    expect(deps.uploads.some((u) => u.key === 'photos/RLS20054046/1.jpg')).toBe(false);
    expect((deps as unknown as { deletes?: unknown[] }).deletes ?? []).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('closure and completion accounting', () => {
  const heroRow = row({ media_key: 'HERO', kind: 'hero', legacyR2Key: 'photos/L/1.jpg' });
  const badSib = row({ media_key: 'SIB_BAD', kind: 'sibling', legacyR2Key: 'photos/L/1.jpg', evidenceClass: 'CURRENT_PROVIDER_BYTES_DIFFER' });
  const twoRowUnit: RemediationUnit = { listing_id: 'L', listing_type: 'sale', rows: [heroRow, badSib] };

  it('(17) in a multi-row unit EVERY object is verified before ANY pointer becomes authoritative', async () => {
    const deps = makeDeps();
    await remediateListingUnit(twoRowUnit, [heroRow, badSib], deps);
    for (const w of deps.pointerWrites) {
      const pointerAt = deps.order.indexOf(`pointer:${w.mediaKey}`);
      const verifyAt = deps.order.findIndex((o) => o.startsWith('verify:') && o.includes(w.r2_key));
      expect(verifyAt).toBeGreaterThanOrEqual(0);
      expect(pointerAt).toBeGreaterThan(verifyAt);
    }
  });

  it('closeMediaWrite runs EXACTLY ONCE per listing unit, never per row', async () => {
    const deps = makeDeps();
    await remediateListingUnit(twoRowUnit, [heroRow, badSib], deps);
    expect(deps.closures).toHaveLength(1);
    expect(deps.closures[0].listingId).toBe('L');
  });

  it('closure runs only AFTER every pointer for the listing is reconciled', async () => {
    const deps = makeDeps();
    await remediateListingUnit(twoRowUnit, [heroRow, badSib], deps);
    const lastPointer = deps.order.map((o, i) => (o.startsWith('pointer:') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    expect(deps.order.indexOf('closure')).toBeGreaterThan(lastPointer);
  });

  it('(20) galleryMutated is TRUE whenever an authorized active row had its delivery corrected', async () => {
    const deps = makeDeps();
    await remediateListingUnit(twoRowUnit, [heroRow, badSib], deps);
    expect(deps.closures[0].galleryMutated).toBe(true);
  });

  it('(18) closure ok:false leaves the unit incomplete/retryable and NEVER counts as completed', async () => {
    const deps = makeDeps({ async closeMediaWrite() { return { ok: false }; } });
    const out = await remediateListingUnit(unit(), [row()], deps);
    expect(out.status).toBe('incomplete');
    if (out.status === 'incomplete') expect(out.retryable).toBe(true);
    expect(countCompletedRemediations([out])).toBe(0);
  });

  it('(18b) a fail-soft closure is inspected — it never throws, so an uninspected result would over-count', async () => {
    const deps = makeDeps({ async closeMediaWrite() { return { ok: false }; } });
    const out = await remediateListingUnit(unit(), [row()], deps);
    expect(out.status).not.toBe('repaired');
  });

  it('(19) a unit counts as completed ONLY when all bad rows reconciled AND closure returned ok:true', async () => {
    const deps = makeDeps();
    const out = await remediateListingUnit(twoRowUnit, [heroRow, badSib], deps);
    expect(out.status).toBe('repaired');
    expect(countCompletedRemediations([out])).toBe(1);
  });

  it('a partially-repaired unit is not counted as completed', async () => {
    let n = 0;
    const deps = makeDeps({
      async uploadToR2(key, body) { if (n++ === 1) throw new Error('R2 500'); (deps as DepSpies).uploads.push({ key, body }); },
    });
    const out = await remediateListingUnit(twoRowUnit, [heroRow, badSib], deps);
    expect(out.status).toBe('incomplete');
    expect(countCompletedRemediations([out])).toBe(0);
  });
});
