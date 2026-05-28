/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

import { SENTINEL_L_CONTRACT, evaluateSource } from '../../tools/sentinel-l/run-sentinel-l';
import type { SentinelLError } from '../../tools/sentinel-l/run-sentinel-l';

const repoRoot = path.resolve(__dirname, '..', '..');

function codes(errors: SentinelLError[]): string[] {
  return errors.map((e) => e.code);
}

function find(errors: SentinelLError[], code: string): SentinelLError | undefined {
  return errors.find((e) => e.code === code);
}

describe('Sentinel-L platform actionable error scanner', () => {
  test('package exposes npm run sentinel:l', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts['sentinel:l']).toBe('tsx tools/sentinel-l/run-sentinel-l.ts');
  });

  test('scanner covers changed files plus the mandated hot paths', () => {
    const hotPaths = SENTINEL_L_CONTRACT.hotPaths;

    expect(hotPaths).toContain('public/crm/SALE-FORM-REDESIGN.html');
    expect(hotPaths).toContain('public/crm/RENTAL-FORM-REDESIGN.html');
    expect(hotPaths).toContain('public/crm/js/dashboard/panels.js');
    expect(hotPaths).toContain('public/crm/js/manage/manage-listings.js');
    expect(hotPaths).toContain('app/api/crm/listings/route.ts');
    expect(hotPaths).toContain('app/api/crm/listings/[id]/route.ts');
    expect(hotPaths).toContain('app/api/crm/listings/[id]/status/route.ts');
    expect(hotPaths).toContain('app/api/listings/route.ts');
    expect(hotPaths).toContain('app/api/listings/suggest/route.ts');
    expect(hotPaths).toContain('app/api/buildings/search/route.ts');
    expect(hotPaths).toContain('lib/search/**');
    expect(hotPaths).toContain('lib/idx/**');
    expect(hotPaths).toContain('lib/crm/**');
    expect(hotPaths).toContain('lib/media/**');
    expect(hotPaths).toContain('lib/compliance/**');
    expect(hotPaths).toContain('lib/address/**');
    expect(hotPaths).toContain('app/components/FeaturedListings.tsx');
    expect(hotPaths).toContain('app/components/SearchListingCard.tsx');
    expect(hotPaths).toContain('app/components/IDXImage.tsx');
  });

  test('catalog contains the full platform code families', () => {
    const codes = new Set(SENTINEL_L_CONTRACT.catalog.map((entry) => entry.code));

    for (const code of [
      'S-REG-001',
      'S-REG-009',
      'S-BE-001',
      'S-BE-010',
      'S-DB-001',
      'S-DB-010',
      'S-SALE-001',
      'S-SALE-014',
      'S-RENT-001',
      'S-RENT-012',
      'S-CRM-001',
      'S-CRM-011',
      'S-LEAD-001',
      'S-LEAD-010',
      'S-AGENT-001',
      'S-AGENT-009',
      'S-SUGGEST-001',
      'S-SUGGEST-008',
      'S-BUILDING-001',
      'S-BUILDING-008',
      'S-SAVED-001',
      'S-SAVED-012',
      'S-EMAIL-001',
      'S-EMAIL-009',
      'S-REPORT-001',
      'S-REPORT-010',
      'S-MEDIA-001',
      'S-MEDIA-009',
      'S-URL-001',
      'S-URL-009',
      'S-COMP-001',
      'S-COMP-010',
    ]) {
      expect(codes).toContain(code);
    }
  });

  test('public search and backend search are separate systems', () => {
    expect(SENTINEL_L_CONTRACT.searchScopeMandate).toContain(
      'Public search and backend CRM search are separate systems',
    );
    expect(SENTINEL_L_CONTRACT.searchScopeMandate).toContain('Public search is display-gated');
    expect(SENTINEL_L_CONTRACT.searchScopeMandate).toContain('Backend search is role-gated');

    const publicCodes = SENTINEL_L_CONTRACT.catalog
      .filter((entry) => entry.code.startsWith('S-PUBSEARCH-'))
      .map((entry) => entry.searchSystem);
    const backendCodes = SENTINEL_L_CONTRACT.catalog
      .filter((entry) => entry.code.startsWith('S-BACKSEARCH-'))
      .map((entry) => entry.searchSystem);

    expect(publicCodes).toHaveLength(13);
    expect(backendCodes).toHaveLength(18);
    expect(new Set(publicCodes)).toEqual(new Set(['PUBLIC_SEARCH']));
    expect(new Set(backendCodes)).toEqual(new Set(['BACKEND_SEARCH']));
  });

  test('scanner forbids narrative audit output and pins actionable fields', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'tools', 'sentinel-l', 'run-sentinel-l.ts'),
      'utf8',
    );

    expect(source).toContain('Status: PASS');
    expect(source).toContain('NO ACTIONABLE ERRORS FOUND');
    expect(source).toContain('Status: FAIL');
    expect(source).toContain('Actionable errors:');
    expect(source).toContain('actualFailure');
    expect(source).toContain('Evidence:');
    expect(source).toContain('matchedSource');
    expect(source).toContain("'failing field/query/pattern'");
    expect(source).toContain("'required fix'");
    expect(source).toContain("'proof required'");
    expect(source).toContain('Only post a short PR comment when actionable errors exist');
    expect(source).not.toMatch(/Final verdict:\s*YELLOW/);
    expect(source).not.toMatch(new RegExp('LIMITED\\s+[\\u2014-]'));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Detector PRECISION — a finding is valid only with positive evidence of
// broken behavior. These tests prove the scanner does NOT flag safe code
// (comments, interfaces, helpers, counters, offline fallback, guards,
// suppression, validated paths) and DOES flag the real failure shapes.
// ─────────────────────────────────────────────────────────────────────
describe('Sentinel-L detector precision — negative (safe code must NOT be flagged)', () => {
  test('computeGateColumns display-gate helper is safe (no S-BACKSEARCH-009)', () => {
    const src = [
      'const gate = computeGateColumns({',
      '  internetEntireListingDisplayYN: raw.InternetEntireListingDisplayYN,',
      '  internetAddressDisplayYN: raw.InternetAddressDisplayYN,',
      '  ownerOptOut: raw.OwnerOptOut,',
      '});',
      'const listing = await prisma.listing.create({ data: { ...gate } });',
    ].join('\n');
    const out = evaluateSource('app/api/crm/listings/route.ts', src);
    expect(codes(out)).not.toContain('S-BACKSEARCH-009');
  });

  test('dashboard compliance counter is safe (no S-BACKSEARCH-009)', () => {
    const src = [
      'let violations = 0;',
      'for (const l of listings) {',
      '  if (l.OwnerOptOut) violations++;',
      '  if (l.InternetEntireListingDisplayYN === false) suppressedCount++;',
      '}',
    ].join('\n');
    const out = evaluateSource('public/crm/js/dashboard/panels.js', src);
    expect(codes(out)).not.toContain('S-BACKSEARCH-009');
  });

  test('select clause containing a display-gate column is safe (no S-BACKSEARCH-009)', () => {
    const src = [
      'const createdListing = await prisma.listing.findUnique({',
      '  where: { listing_id: result.listingId },',
      '  select: { listing_id: true, status: true, internet_address_display_yn: true },',
      '});',
    ].join('\n');
    const out = evaluateSource('app/api/crm/listings/route.ts', src);
    expect(codes(out)).not.toContain('S-BACKSEARCH-009');
  });

  test('TypeScript interface with InternetAddressDisplayYN is safe (no S-COMP-001, no S-URL-001)', () => {
    const src = [
      'export interface ListingSlugInput {',
      '  listingId: string;',
      '  internetAddressDisplayYN?: boolean;',
      '  streetDirPrefix?: string;',
      '}',
    ].join('\n');
    const out = evaluateSource('lib/listing-slug.ts', src);
    expect(codes(out)).not.toContain('S-COMP-001');
    expect(codes(out)).not.toContain('S-URL-001');
  });

  test('comment mentioning InternetAddressDisplayYN is safe (no S-COMP-001)', () => {
    const src = [
      '// The canonical /listing/ URL is gated on InternetAddressDisplayYN.',
      '// We call affirmPermission(raw.InternetAddressDisplayYN) before emitting.',
      'const canonicalUrl = buildCanonical(listing);',
    ].join('\n');
    const out = evaluateSource('lib/listing-canonical-url.ts', src);
    expect(codes(out)).not.toContain('S-COMP-001');
  });

  test('affirmPermission(raw.InternetAddressDisplayYN) guard is safe (no S-COMP-001)', () => {
    const src = [
      'const showAddress = affirmPermission(raw.InternetAddressDisplayYN);',
      "const addressSlug = generateListingSlug(listing.address);",
      "const canonicalUrl = showAddress ? '/listing/' + addressSlug : '/listing/listing-' + id;",
    ].join('\n');
    const out = evaluateSource('app/listing/[...slug]/page.tsx', src);
    expect(codes(out)).not.toContain('S-COMP-001');
  });

  test('InternetAddressDisplayYN === false guard is safe (no S-COMP-001)', () => {
    const src = [
      'if (raw.InternetAddressDisplayYN === false) {',
      "  return '/listing/listing-' + listingId.toLowerCase();",
      '}',
      "const addressSlug = generateListingSlug(listing.address);",
      "const canonicalUrl = '/listing/' + addressSlug + '/' + listingId.toLowerCase();",
    ].join('\n');
    const out = evaluateSource('lib/listing-canonical-url.ts', src);
    expect(codes(out)).not.toContain('S-COMP-001');
  });

  test('stale draft suppression is safe (no S-DB-008)', () => {
    const src = [
      '// When a DB match exists, clear the stale browser draft.',
      'if (_dbHasMatch) {',
      "  localStorage.removeItem('saleListings');",
      '}',
    ].join('\n');
    const out = evaluateSource('public/crm/js/dashboard/panels.js', src);
    expect(codes(out)).not.toContain('S-DB-008');
  });

  test('offline fallback localStorage write is safe (no S-DB-008)', () => {
    const src = [
      "if (typeof MallanAPI === 'undefined' || !MallanAPI) {",
      '  // Offline — fall back to localStorage only when the server is unreachable.',
      "  localStorage.setItem('saleListings', JSON.stringify(payload));",
      '}',
    ].join('\n');
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', src);
    expect(codes(out)).not.toContain('S-DB-008');
  });

  test('new unsaved draft localStorage write is safe (no S-DB-008)', () => {
    const src = [
      'function saveNewDraft(data) {',
      '  // Brand-new listing with no DB id yet; safe to keep a local draft.',
      "  localStorage.setItem('mallan_draft_sale', JSON.stringify(data));",
      '}',
    ].join('\n');
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', src);
    expect(codes(out)).not.toContain('S-DB-008');
  });

  test('validated agent path is safe (no S-AGENT-006, no S-BACKSEARCH-012)', () => {
    const src = [
      'function onValidateAgent(agentInfo) {',
      "  if (!agentInfo || !agentInfo.ListAgentMlsId) { blockSubmit('Validate agent first'); return; }",
      "  document.getElementById('saleListingAgentId').value = agentInfo.ListAgentMlsId;",
      "  document.getElementById('saleListOfficeKey').value = agentInfo.ListOfficeKey;",
      '}',
    ].join('\n');
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', src);
    expect(codes(out)).not.toContain('S-AGENT-006');
    expect(codes(out)).not.toContain('S-BACKSEARCH-012');
  });

  test('OData/CSV escaping and bounds parsing are safe (no S-PUBSEARCH-001)', () => {
    const escape = "export function escapeOData(value) { return value.replace(/'/g, \"''\"); }";
    const bounds = "const [south, west, north, east] = boundsParam.split(',').map(Number);";
    expect(codes(evaluateSource('lib/search/crm-idx-filter.ts', escape))).not.toContain('S-PUBSEARCH-001');
    expect(codes(evaluateSource('app/api/listings/route.ts', bounds))).not.toContain('S-PUBSEARCH-001');
  });
});

describe('Sentinel-L detector precision — positive (real failures MUST be flagged)', () => {
  test('backend search wrongly filters by a public display gate (S-BACKSEARCH-009)', () => {
    const src = [
      'const rows = await prisma.listing.findMany({',
      '  where: {',
      '    agent_id: brokerId,',
      '    internet_entire_listing_display_yn: true,',
      '  },',
      '});',
    ].join('\n');
    const out = evaluateSource('app/api/crm/listings/route.ts', src);
    const hit = find(out, 'S-BACKSEARCH-009');
    expect(hit).toBeDefined();
    expect(hit!.actualFailure).toContain('public display gates as broker access gates');
  });

  test('public URL emits address atoms without an address-display guard (S-COMP-001)', () => {
    const src = [
      'export function buildCanonical(listing) {',
      '  const addressSlug = generateListingSlug(listing.address);',
      "  const canonicalUrl = '/listing/' + addressSlug + '/' + listing.id.toLowerCase();",
      '  return canonicalUrl;',
      '}',
    ].join('\n');
    const out = evaluateSource('lib/listing-canonical-url.ts', src);
    const hit = find(out, 'S-COMP-001');
    expect(hit).toBeDefined();
    expect(hit!.actualFailure).toContain('leak address atoms publicly');
  });

  test('edit autosave writes localStorage while a DB id exists (S-DB-008)', () => {
    const src = [
      'function autosaveSaleListing() {',
      '  var editId = _saleEditDbId || currentListingId;',
      "  localStorage.setItem('saleListings', JSON.stringify(collect()));",
      '}',
    ].join('\n');
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', src);
    const hit = find(out, 'S-DB-008');
    expect(hit).toBeDefined();
    expect(hit!.actualFailure).toContain('shadow or overwrite a real DB listing');
  });

  test('success response omits the URL/eligibility contract (S-BE-006)', () => {
    const src = [
      'return NextResponse.json({',
      '  id: result.id,',
      '  listing_id: result.listingId,',
      "  status: 'Incomplete',",
      '  publicUrl: urls.publicUrl,',
      '  realPlusUrl: urls.realPlusUrl,',
      '}, { status: 201 });',
    ].join('\n');
    const out = evaluateSource('app/api/crm/listings/route.ts', src);
    const hit = find(out, 'S-BE-006');
    expect(hit).toBeDefined();
    expect(hit!.actualFailure).toContain('without returning the URL and eligibility contract');
  });

  test('visible agent selected but hidden stable ID falls back to empty (S-BACKSEARCH-012)', () => {
    const src = [
      "saleListingAgent = agentInfo.ListAgentMlsId || '';",
      "document.getElementById('saleListingAgentName').value = agentInfo.name;",
      'submitListing();',
    ].join('\n');
    const out = evaluateSource('public/crm/SALE-FORM-REDESIGN.html', src);
    const hit = find(out, 'S-BACKSEARCH-012');
    expect(hit).toBeDefined();
    expect(hit!.actualFailure).toContain('missing stable agent/office IDs');
  });
});
