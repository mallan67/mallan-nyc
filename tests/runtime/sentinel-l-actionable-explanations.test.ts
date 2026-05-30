/// <reference types="jest" />

// Sentinel-L v2 — actionable explanations.
//
// Every finding must answer: which line, what user/system failure, why it is
// wrong under Cotality/UCBA/CRM rules, and how we prove it is fixed. These
// tests pin the 16-field explanation schema and the new detector categories
// (A BUILDING_AUTOFILL, B MEDIA_P0, C COTALITY_CONTRACT, D RELEASE_TRUTH/
// WORKFLOW, E SALES_FORM_SAVE_LOAD, F CANONICAL_URL/DISPLAY_GATE) against
// real Mallan failure fixtures (PR #277, PR #276, Release-Truth ECONNRESET).
//
// Built TDD-first: written RED before the scanner is extended.

import {
  evaluateSource,
  classifyWorkflowFailure,
  type SentinelLError,
} from '../../tools/sentinel-l/run-sentinel-l';

function find(errors: SentinelLError[], code: string): SentinelLError | undefined {
  return errors.find((e) => e.code === code);
}

// Every actionable finding must carry all 16 explanation fields with real,
// non-generic content. Generic strings ("pattern matched", "may be unsafe",
// "field might be missing") are explicitly disallowed.
const GENERIC_PHRASES = [
  'pattern matched',
  'may be unsafe',
  'might be missing',
  'workflow blocking failures',
];

function assertSixteenFieldSchema(f: SentinelLError): void {
  // 1 code, 2 severity, 3 system, 4 layer, 5 file, 6 line
  expect(typeof f.code).toBe('string');
  expect(['P0', 'P1', 'P2']).toContain(f.severity);
  expect(typeof f.system).toBe('string');
  expect(f.system!.length).toBeGreaterThan(0);
  expect(['frontend', 'backend', 'data', 'compliance', 'workflow']).toContain(f.layer);
  expect(typeof f.file).toBe('string');
  expect(f.line).toBeGreaterThanOrEqual(1);
  // 7 failingPattern, 8 evidence
  expect(f['failing field/query/pattern'].length).toBeGreaterThan(0);
  expect(f.evidence.matchedSource.length).toBeGreaterThan(0);
  // 9 actualFailure, 10 whyThisIsAnError, 11 expectedBehavior
  expect(f.actualFailure.length).toBeGreaterThan(20);
  expect(f.whyThisIsAnError!.length).toBeGreaterThan(20);
  expect(f.expectedBehavior!.length).toBeGreaterThan(10);
  // 12 requiredFix, 13 proofRequired
  expect(f['required fix'].length).toBeGreaterThan(10);
  expect(f['proof required'].length).toBeGreaterThan(10);
  // 14 falsePositiveGuard, 15 confidence, 16 relatedSurfaces
  expect(f.falsePositiveGuard!.length).toBeGreaterThan(10);
  expect(['high', 'medium', 'low']).toContain(f.confidence!.level);
  expect(f.confidence!.reason.length).toBeGreaterThan(10);
  expect(Array.isArray(f.relatedSurfaces)).toBe(true);
  expect(f.relatedSurfaces!.length).toBeGreaterThan(0);
  // No generic filler anywhere in the human-readable fields.
  const blob = [
    f.actualFailure,
    f.whyThisIsAnError,
    f.expectedBehavior,
    f['required fix'],
  ].join(' ').toLowerCase();
  for (const phrase of GENERIC_PHRASES) {
    expect(blob).not.toContain(phrase);
  }
}

// Minimal Cotality Property $metadata field set for the fixtures: the real
// metadata has ~hundreds; these are the valid ones the fixtures reference.
const COTALITY_FIELDS = new Set<string>([
  'UnitNumber',
  'BuildingName',
  'BuildingFeatures',
  'StreetDirPrefix',
  'StreetName',
  'PostalCode',
  'YearBuilt',
  'StoriesTotal',
]);

describe('Sentinel-L v2 — C. COTALITY_CONTRACT — $select field absent from $metadata (PR #277)', () => {
  // PR #277 root cause: /api/buildings/search OData $select listed
  // AttendanceType, NewDevelopmentYN, SponsorUnitYN, RentingAllowedYN —
  // none present in the live Cotality Property $metadata — so Trestle 400'd
  // the WHOLE query and the building lookup silently returned nothing.
  const phantomSelectSource = [
    'export async function fetchBuildingsFromAPI(q: string) {',
    "  const SELECT_FIELDS = ['UnitNumber', 'BuildingName', 'BuildingFeatures', 'AttendanceType', 'NewDevelopmentYN', 'SponsorUnitYN', 'RentingAllowedYN'];",
    '  const url = `${BASE}/Property?$select=${SELECT_FIELDS.join(",")}&$filter=${filter}`;',
    '  const res = await trestleFetch(url);',
    '  return res.value;',
    '}',
  ].join('\n');

  test('flags a $select field that is not in the Cotality $metadata (S-COTALITY-001)', () => {
    const out = evaluateSource('app/api/buildings/search/route.ts', phantomSelectSource, {
      cotalityFields: COTALITY_FIELDS,
    });
    const hit = find(out, 'S-COTALITY-001');
    expect(hit).toBeDefined();
    // Names the actual phantom fields, not a generic "field might be missing".
    expect(hit!['failing field/query/pattern']).toMatch(/AttendanceType/);
    expect(hit!.actualFailure).toMatch(/400|whole query|silently|building/i);
    expect(hit!.whyThisIsAnError).toMatch(/Cotality|metadata|IDX Plus/i);
  });

  test('the S-COTALITY-001 finding satisfies the full 16-field explanation schema', () => {
    const out = evaluateSource('app/api/buildings/search/route.ts', phantomSelectSource, {
      cotalityFields: COTALITY_FIELDS,
    });
    const hit = find(out, 'S-COTALITY-001')!;
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit);
    expect(hit.system).toBe('COTALITY_CONTRACT');
    expect(hit.layer).toBe('backend');
    expect(hit.relatedSurfaces!.join(' ')).toMatch(/buildings\/search|BUILDING_AUTOFILL/);
  });

  test('does NOT flag a $select built only from valid metadata fields (false-positive guard)', () => {
    const validSource = [
      'export async function fetchBuildingsFromAPI(q: string) {',
      "  const SELECT_FIELDS = ['UnitNumber', 'BuildingName', 'StreetDirPrefix', 'StreetName', 'PostalCode'];",
      '  const url = `${BASE}/Property?$select=${SELECT_FIELDS.join(",")}`;',
      '  return (await trestleFetch(url)).value;',
      '}',
    ].join('\n');
    const out = evaluateSource('app/api/buildings/search/route.ts', validSource, {
      cotalityFields: COTALITY_FIELDS,
    });
    expect(find(out, 'S-COTALITY-001')).toBeUndefined();
  });

  test('does NOT flag when the Cotality field set is unavailable (cannot prove a phantom — fail-closed quiet)', () => {
    // Without the metadata field set we cannot prove a field is phantom, so the
    // detector stays silent rather than emit a false positive.
    const out = evaluateSource('app/api/buildings/search/route.ts', phantomSelectSource);
    expect(find(out, 'S-COTALITY-001')).toBeUndefined();
  });
});

describe('Sentinel-L v2 — A. BUILDING_AUTOFILL', () => {
  // S-BUILDING-009 — lossy fetchBuildingsFromAPI normalization (PR #278). The
  // function rebuilt each result into a hand-picked subset; the cache feeding
  // both selectBuildingFromIDX (main address) and the Building tab was that
  // subset, so populateBuildingFromIDX (reads the full snake_case shape via
  // pick()) found tax_block, association_*, stories_total, structure_type,
  // etc. missing — silently unpopulated.
  const lossySource = [
    'async function fetchBuildingsFromAPI(q) {',
    "  const res = await fetch('/api/buildings/search?q=' + q);",
    '  const json = await res.json();',
    '  buildingDatabase = json.results.map((b) => ({',
    '    address: b.address,',
    '    name: b.building_name,',
    '  }));',
    '  return buildingDatabase;',
    '}',
  ].join('\n');
  const spreadSource = [
    'async function fetchBuildingsFromAPI(q) {',
    "  const res = await fetch('/api/buildings/search?q=' + q);",
    '  const json = await res.json();',
    '  buildingDatabase = json.results.map((b) => Object.assign({}, b, {',
    '    displayAddress: formatAddress(b),',
    '  }));',
    '  return buildingDatabase;',
    '}',
  ].join('\n');

  test('flags lossy fetchBuildingsFromAPI that rebuilds a subset without preserving raw Cotality fields (S-BUILDING-009)', () => {
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', lossySource);
    const hit = find(out, 'S-BUILDING-009');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('BUILDING_AUTOFILL');
    expect(hit!.actualFailure).toMatch(/drop|populate|field/i);
    expect(hit!.whyThisIsAnError).toMatch(/Cotality|populateBuildingFromIDX|snake_case|pick/i);
  });

  test('does NOT flag fetchBuildingsFromAPI that preserves the raw object (spread/Object.assign) (false-positive guard)', () => {
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', spreadSource);
    expect(find(out, 'S-BUILDING-009')).toBeUndefined();
  });

  // S-BUILDING-010 — Building-tab search cache-only (PR #277). The Building tab
  // only filtered the in-memory buildingDatabase and never called the API when
  // the cache was empty/stale, so a building that was not already cached
  // returned no matches and auto-populate never ran.
  const cacheOnly = [
    'function searchBuildingTab(q) {',
    '  const results = buildingDatabase.filter((b) => b.name.includes(q));',
    '  renderBuildingResults(results);',
    '}',
  ].join('\n');
  const cacheWithFallback = [
    'async function searchBuildingTab(q) {',
    '  let results = buildingDatabase.filter((b) => b.name.includes(q));',
    '  if (!results.length) {',
    "    const res = await fetch('/api/buildings/search?q=' + q);",
    '    results = (await res.json()).results;',
    '  }',
    '  renderBuildingResults(results);',
    '}',
  ].join('\n');

  test('flags Building-tab search that filters the in-memory cache with no API fallback (S-BUILDING-010)', () => {
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', cacheOnly);
    const hit = find(out, 'S-BUILDING-010');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('BUILDING_AUTOFILL');
    expect(hit!['proof required']).toMatch(/buildings\/search|cache|stale/i);
  });

  test('does NOT flag Building-tab search that falls back to /api/buildings/search when cache empty (false-positive guard)', () => {
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', cacheWithFallback);
    expect(find(out, 'S-BUILDING-010')).toBeUndefined();
  });

  // S-BUILDING-011 — building populate clobbers the user-entered UnitNumber.
  const unitClobber = [
    'function populateBuildingFromIDX(building) {',
    "  document.getElementById('saleUnitNumber').value = building.unitNumber;",
    '}',
  ].join('\n');
  const unitPreserved = [
    'function populateBuildingFromIDX(building) {',
    "  const unitEl = document.getElementById('saleUnitNumber');",
    '  if (!unitEl.value) unitEl.value = building.unitNumber;',
    '}',
  ].join('\n');

  test('flags building populate that overwrites the user-entered UnitNumber (S-BUILDING-011)', () => {
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', unitClobber);
    const hit = find(out, 'S-BUILDING-011');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('BUILDING_AUTOFILL');
    expect(hit!.actualFailure).toMatch(/unit/i);
  });

  test('does NOT flag building populate that preserves a user-entered unit (false-positive guard)', () => {
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', unitPreserved);
    expect(find(out, 'S-BUILDING-011')).toBeUndefined();
  });
});

describe('Sentinel-L v2 — B. MEDIA_P0', () => {
  // S-MEDIA-010 — CRM media written only to the listing.media JSON column, not
  // listing_media rows (the Cotality-shaped table the resolver reads).
  const jsonOnlyMedia = [
    'export async function PUT(req, { params }) {',
    '  const photos = await req.json();',
    '  await prisma.listing.update({',
    '    where: { listing_id: params.id },',
    '    data: { media: photos },',
    '  });',
    '  return NextResponse.json({ ok: true });',
    '}',
  ].join('\n');
  const rowsMedia = [
    'export async function PUT(req, { params }) {',
    '  const photos = await req.json();',
    '  await prisma.listing_media.createMany({ data: photos.map((p, i) => ({ media_key: p.key, order: i })) });',
    '  await prisma.listing.update({ where: { listing_id: params.id }, data: { modification_timestamp: new Date() } });',
    '  return NextResponse.json({ ok: true });',
    '}',
  ].join('\n');

  test('flags media written only to the listing.media JSON column with no listing_media rows (S-MEDIA-010)', () => {
    const out = evaluateSource('app/api/crm/listings/[id]/media/upload/route.ts', jsonOnlyMedia);
    const hit = find(out, 'S-MEDIA-010');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('MEDIA');
    expect(hit!.whyThisIsAnError).toMatch(/listing_media|resolver|Cotality/i);
  });
  test('does NOT flag a media write that creates listing_media rows (false-positive guard)', () => {
    const out = evaluateSource('app/api/crm/listings/[id]/media/upload/route.ts', rowsMedia);
    expect(find(out, 'S-MEDIA-010')).toBeUndefined();
  });

  // S-MEDIA-011 — reorder writes raw_data.media_order, which the resolver does
  // not read (it orders by listing_media.order).
  const orderToRawData = [
    'export async function PATCH(req, { params }) {',
    '  const { order } = await req.json();',
    '  await prisma.listing.update({',
    '    where: { listing_id: params.id },',
    '    data: { raw_data: { media_order: order } },',
    '  });',
    '}',
  ].join('\n');
  const orderToRows = [
    'export async function PATCH(req, { params }) {',
    '  const { order } = await req.json();',
    '  const raw = { media_order: order };',
    '  for (let i = 0; i < order.length; i++) {',
    '    await prisma.listing_media.update({ where: { media_key: order[i] }, data: { order: i } });',
    '  }',
    '}',
  ].join('\n');

  test('flags reorder writing raw_data.media_order, which the resolver does not read (S-MEDIA-011)', () => {
    const out = evaluateSource('app/api/crm/listings/[id]/media-order/route.ts', orderToRawData);
    const hit = find(out, 'S-MEDIA-011');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('MEDIA');
    expect(hit!.actualFailure).toMatch(/order|resolver|listing_media/i);
  });
  test('does NOT flag reorder that updates listing_media.order rows (false-positive guard)', () => {
    const out = evaluateSource('app/api/crm/listings/[id]/media-order/route.ts', orderToRows);
    expect(find(out, 'S-MEDIA-011')).toBeUndefined();
  });

  // S-MEDIA-012 — media delete by array index instead of a stable media_key.
  const deleteByIndex = [
    'function removeMedia(index) {',
    '  media.splice(index, 1);',
    '  renderMedia();',
    '}',
  ].join('\n');
  const deleteByKey = [
    'async function removeMedia(mediaKey) {',
    "  await fetch('/api/crm/listings/' + id + '/media/' + mediaKey, { method: 'DELETE' });",
    '  media = media.filter((m) => m.media_key !== mediaKey);',
    '}',
  ].join('\n');

  test('flags media delete by array index instead of a stable media_key (S-MEDIA-012)', () => {
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', deleteByIndex);
    const hit = find(out, 'S-MEDIA-012');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('MEDIA');
  });
  test('does NOT flag media delete keyed by media_key (false-positive guard)', () => {
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', deleteByKey);
    expect(find(out, 'S-MEDIA-012')).toBeUndefined();
  });
});

describe('Sentinel-L v2 — C. RELEASE_TRUTH / WORKFLOW — classifyWorkflowFailure', () => {
  // Release-Truth fixture: geo-validate first run failed on an NYC Open Data
  // ECONNRESET; rerun passed; the PR touched no geo files.
  test('classifies a geo-validate ECONNRESET that passed on rerun as external_infra, not a product regression', () => {
    const f = classifyWorkflowFailure({
      workflow: 'CRM Validation',
      job: 'geo-validate',
      failingStep: 'Geo: Run 12-check validator',
      rootCauseStep: 'Geo: Build GeoJSON from canonical list',
      logs:
        'Fetching NTA 2020 boundaries from NYC Open Data...\n'
        + '  WARN: Could not fetch NTA data (read ECONNRESET) — using patches only\n'
        + 'WARNING: 627 canonical neighborhoods have no polygon.',
      prFiles: ['app/api/buildings/search/route.ts', 'public/crm/SALE-FORM-REDESIGN.html'],
      rerunPassed: true,
      gating: 'required',
    });
    expect(f.system).toBe('WORKFLOW');
    expect(f.cause).toBe('external_infra');
    expect(f.rerunPassed).toBe(true);
    expect(f.freshness).toBe('stale');
    expect(f.recommendedAction).toMatch(/ignore_stale_advisory|rerun/);
    expect(f.actualFailure).toMatch(/ECONNRESET/);
    expect(f.actualFailure).toMatch(/not a product regression|external/i);
    expect(f['failing field/query/pattern']).not.toContain('workflow blocking failures');
    assertSixteenFieldSchema(f);
  });

  // Real-regression fixture: deterministic geo failure, PR DID touch geo files.
  test('classifies a deterministic geo failure when the PR touched geo files as pr-caused, not external', () => {
    const f = classifyWorkflowFailure({
      workflow: 'CRM Validation',
      job: 'geo-validate',
      failingStep: 'Geo: Run 12-check validator',
      logs: '[FAIL] 3. Canonical ↔ GeoJSON mismatch: 12 missing\nExit 1 — 1 strict failure.',
      prFiles: ['public/geo/rls-neighborhoods.geojson', 'data/rls/neighborhoods.json'],
      rerunPassed: false,
      gating: 'required',
    });
    expect(f.cause).toBe('pr');
    expect(f.recommendedAction).toMatch(/fix_pr/);
    expect(f.confidence!.level).not.toBe('low');
  });

  // Unknown fixture: no signature, unmapped surface → fail closed.
  test('classifies an unknown failure as indeterminate and fails closed (never external)', () => {
    const f = classifyWorkflowFailure({
      workflow: 'Some Workflow',
      job: 'mystery',
      failingStep: 'do thing',
      logs: 'Process completed with exit code 1.',
      prFiles: ['README.md'],
      rerunPassed: false,
      gating: 'advisory',
    });
    expect(f.cause).toBe('indeterminate');
    expect(f.confidence!.level).toBe('low');
    expect(f.recommendedAction).toMatch(/human|review/i);
    expect(f.cause).not.toBe('external_infra');
  });
});

describe('Sentinel-L v2 — C. WORKFLOW — advisory PR comment must stay disabled', () => {
  const activeComment = [
    'jobs:',
    '  release-truth:',
    '    steps:',
    '      - name: Comment on PR',
    "        if: github.event_name == 'pull_request'",
    '        run: gh pr comment "$PR" --body-file /tmp/c.md',
  ].join('\n');
  const disabledComment = [
    'jobs:',
    '  release-truth:',
    '    steps:',
    '      - name: Comment on PR',
    '        if: ${{ false }}',
    '        run: gh pr comment "$PR" --body-file /tmp/c.md',
  ].join('\n');

  test('flags an enabled gh pr comment step in an advisory workflow (S-WORKFLOW-001)', () => {
    const out = evaluateSource('.github/workflows/release-truth.yml', activeComment);
    const hit = find(out, 'S-WORKFLOW-001');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('WORKFLOW');
  });
  test('does NOT flag a gh pr comment step gated if: ${{ false }} (false-positive guard)', () => {
    const out = evaluateSource('.github/workflows/release-truth.yml', disabledComment);
    expect(find(out, 'S-WORKFLOW-001')).toBeUndefined();
  });
});

describe('Sentinel-L v2 — D. CANONICAL_URL / DISPLAY_GATE', () => {
  // S-URL-010 — hybrid listing URL (PR #272 two-shape problem).
  const hybridUrl = [
    'export function listingHref(listing) {',
    '  return `/listing/${listing.slug}-${listing.id}`;',
    '}',
  ].join('\n');
  const hybridKey = [
    'export function listingHref(listing) {',
    '  return `/listing/${listing.slug}?key=${listing.id}`;',
    '}',
  ].join('\n');
  const canonicalUrl = [
    'export function listingHref(listing) {',
    '  return buildCanonicalListingPath({ slug: listing.slug, id: listing.id });',
    '}',
  ].join('\n');

  test('flags a hybrid /listing/{slug}-{id} URL (S-URL-010)', () => {
    const out = evaluateSource('app/components/SearchListingCard.tsx', hybridUrl);
    const hit = find(out, 'S-URL-010');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('CANONICAL_URL');
  });
  test('flags a /listing/{slug}?key={id} hybrid URL (S-URL-010)', () => {
    const out = evaluateSource('lib/crm/listing-urls.ts', hybridKey);
    expect(find(out, 'S-URL-010')).toBeDefined();
  });
  test('does NOT flag the canonical two-segment builder (false-positive guard)', () => {
    const out = evaluateSource('app/components/SearchListingCard.tsx', canonicalUrl);
    expect(find(out, 'S-URL-010')).toBeUndefined();
  });

  // S-URL-011 — lowercase canonical id not normalized for DB lookup (PR #272 Codex).
  const lookupNoUpper = [
    'const row = await prisma.listing.findUnique({',
    '  where: { listing_id: extractListingIdFromSlug(slug) },',
    '});',
  ].join('\n');
  const lookupUpper = [
    'const id = extractListingIdFromSlug(slug).toUpperCase();',
    'const row = await prisma.listing.findUnique({ where: { listing_id: id } });',
  ].join('\n');

  test('flags a listing_id lookup from a lowercased slug id with no toUpperCase (S-URL-011)', () => {
    const out = evaluateSource('app/listing/[...slug]/page.tsx', lookupNoUpper);
    const hit = find(out, 'S-URL-011');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('CANONICAL_URL');
  });
  test('does NOT flag a lookup that normalizes the id to uppercase (false-positive guard)', () => {
    const out = evaluateSource('app/listing/[...slug]/page.tsx', lookupUpper);
    expect(find(out, 'S-URL-011')).toBeUndefined();
  });

  // S-COMP-011 — Mallan website-only exclusive hidden by an IDX-only gate.
  const idxOnlyGate = [
    'const rows = await prisma.listing.findMany({',
    '  where: { agent_id: brokerId, idx_display_yn: true },',
    '});',
  ].join('\n');
  const rlsAwareGate = [
    'const rows = await prisma.listing.findMany({',
    '  where: { agent_id: brokerId, OR: [{ rls_eligible: false }, { idx_display_yn: true }] },',
    '});',
  ].join('\n');

  test('flags an agent/listing query gated only on idx_display_yn (hides rls_eligible=false exclusives) (S-COMP-011)', () => {
    const out = evaluateSource('app/api/agents/[slug]/listings/route.ts', idxOnlyGate);
    const hit = find(out, 'S-COMP-011');
    expect(hit).toBeDefined();
    assertSixteenFieldSchema(hit!);
    expect(hit!.system).toBe('DISPLAY_GATE');
    expect(hit!.whyThisIsAnError).toMatch(/InHouseWebOnly|rls_eligible|UCBA|exclusive/i);
  });
  test('does NOT flag a query that bypasses the IDX gate for rls_eligible=false (false-positive guard)', () => {
    const out = evaluateSource('app/api/agents/[slug]/listings/route.ts', rlsAwareGate);
    expect(find(out, 'S-COMP-011')).toBeUndefined();
  });
});
