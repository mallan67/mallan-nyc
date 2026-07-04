/**
 * SELLER-001 Phase 1 — seller report aggregation (pure builder).
 *
 * Truth rules under test (Maya directives 2026-07-03, non-negotiable):
 *  - Every metric section carries an explicit truth level:
 *    VERIFIED_MALLAN_TRAFFIC / TRACKED_CAMPAIGN / PORTAL_REPORTED /
 *    EXTERNAL_PRESENCE / MARKET_PROXY.
 *  - Known-vs-anonymous: the report NEVER exposes viewer identity —
 *    aggregate counts only. No lead_id, email, or name may survive
 *    into the report payload.
 *  - Market context uses PROXY metrics from our own DB only — never
 *    a competitor/portal traffic claim.
 *  - Honest data_gaps array for everything not yet tracked (Phase 2).
 *
 * Spec: docs/architecture/SELLER-001-SPEC-2026-07-03.md
 */
import {
  buildSellerReport,
  TRUTH_LEVELS,
  type SellerReportInput,
} from '@/lib/seller-report/build-report';

const NOW = new Date('2026-07-03T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function baseInput(overrides: Partial<SellerReportInput> = {}): SellerReportInput {
  return {
    listing: {
      listing_id: 'SL-0007',
      address_display: '400 East 90th Street 4D, New York, NY 10128',
      status: 'Active',
      listing_type: 'sale',
      property_type: 'Residential',
      borough: 'Manhattan',
      list_price: 425000,
      days_on_market: 40,
      first_active_date: '2026-05-24T00:00:00.000Z',
    },
    views: [],
    inquiries: [],
    showings: [],
    actions: [],
    similarActives: [],
    now: NOW,
    ...overrides,
  };
}

describe('buildSellerReport — truth-level labeling', () => {
  test('every metric section carries its required truth level', () => {
    const report = buildSellerReport(baseInput());
    expect(report.exposure.truth_level).toBe(TRUTH_LEVELS.VERIFIED_MALLAN_TRAFFIC);
    expect(report.engagement.truth_level).toBe(TRUTH_LEVELS.VERIFIED_MALLAN_TRAFFIC);
    expect(report.inquiries.truth_level).toBe(TRUTH_LEVELS.VERIFIED_MALLAN_TRAFFIC);
    expect(report.campaigns.truth_level).toBe(TRUTH_LEVELS.TRACKED_CAMPAIGN);
    expect(report.portal_reported.truth_level).toBe(TRUTH_LEVELS.PORTAL_REPORTED);
    expect(report.external_presence.truth_level).toBe(TRUTH_LEVELS.EXTERNAL_PRESENCE);
    expect(report.market_context.truth_level).toBe(TRUTH_LEVELS.MARKET_PROXY);
  });

  test('truth level definitions are included so the UI can render them verbatim', () => {
    const report = buildSellerReport(baseInput());
    for (const level of Object.values(TRUTH_LEVELS)) {
      expect(report.truth_level_definitions[level]).toEqual(expect.any(String));
      expect(report.truth_level_definitions[level].length).toBeGreaterThan(10);
    }
  });

  test('not-yet-tracked sections are explicit, not silently omitted', () => {
    const report = buildSellerReport(baseInput());
    expect(report.campaigns.status).toBe('not_yet_tracked');
    expect(report.portal_reported.status).toBe('not_yet_tracked');
    expect(report.external_presence.status).toBe('not_yet_tracked');
  });
});

describe('buildSellerReport — exposure (listing_views aggregation)', () => {
  const views = [
    // lead 1: 2 views, desktop, same ip hash — returning viewer
    { lead_id: '1', viewed_at: daysAgo(2), device_type: 'desktop', ip_hash: 'aaa', referrer: 'https://mail.google.com' },
    { lead_id: '1', viewed_at: daysAgo(1), device_type: 'desktop', ip_hash: 'aaa', referrer: null },
    // lead 2: 1 view, mobile
    { lead_id: '2', viewed_at: daysAgo(10), device_type: 'mobile', ip_hash: 'bbb', referrer: null },
    // lead 3: 1 view, no device/ip captured
    { lead_id: '3', viewed_at: daysAgo(45), device_type: null, ip_hash: null, referrer: null },
  ];

  test('counts total, unique, known and returning viewers', () => {
    const report = buildSellerReport(baseInput({ views }));
    expect(report.exposure.total_views).toBe(4);
    // unique = distinct ip_hash (aaa, bbb) + 1 row without ip_hash falls back to lead key
    expect(report.exposure.unique_viewers).toBe(3);
    expect(report.exposure.known_viewers).toBe(3); // 3 distinct leads (all token-tracked)
    expect(report.exposure.returning_viewers).toBe(1); // lead 1 viewed twice
  });

  test('returning viewers key on lead_id, not shared IP — two leads on one network are NOT returning (Codex #472 r10)', () => {
    // Office/household: two DISTINCT leads share an ip_hash, each a single view.
    // No lead came back, so returning must be 0. This locks the lead-level
    // contract the exact SQL aggregate (load-report.ts) must group on, so the
    // capped-slice and exact-aggregate paths never disagree.
    const shared = [
      { lead_id: '10', viewed_at: daysAgo(3), device_type: 'desktop', ip_hash: 'office', referrer: null },
      { lead_id: '11', viewed_at: daysAgo(2), device_type: 'mobile', ip_hash: 'office', referrer: null },
    ];
    const report = buildSellerReport(baseInput({ views: shared }));
    expect(report.exposure.returning_viewers).toBe(0);
  });

  test('windows views by 7 and 30 days from `now`', () => {
    const report = buildSellerReport(baseInput({ views }));
    expect(report.exposure.views_last_7_days).toBe(2);
    expect(report.exposure.views_last_30_days).toBe(3);
  });

  test('aggregates device breakdown and first/last view timestamps', () => {
    const report = buildSellerReport(baseInput({ views }));
    expect(report.exposure.device_breakdown).toEqual({ desktop: 2, mobile: 1, unknown: 1 });
    expect(report.exposure.first_view_at).toBe(daysAgo(45).toISOString());
    expect(report.exposure.last_view_at).toBe(daysAgo(1).toISOString());
  });

  test('empty views produce zeros, not fabricated activity', () => {
    const report = buildSellerReport(baseInput());
    expect(report.exposure.total_views).toBe(0);
    expect(report.exposure.unique_viewers).toBe(0);
    expect(report.exposure.first_view_at).toBeNull();
    expect(report.exposure.last_view_at).toBeNull();
  });
});

describe('buildSellerReport — known-vs-anonymous (identity never leaks)', () => {
  test('serialized report contains no lead ids, emails, or name fields', () => {
    const report = buildSellerReport(
      baseInput({
        views: [
          { lead_id: '9001', viewed_at: daysAgo(1), device_type: 'desktop', ip_hash: 'zzz', referrer: 'x' },
        ],
        inquiries: [{ source: 'contact_form', created_at: daysAgo(3), has_message: true }],
      })
    );
    const json = JSON.stringify(report);
    expect(json).not.toContain('lead_id');
    expect(json).not.toContain('9001');
    expect(json).not.toMatch(/"email"/i);
    expect(json).not.toMatch(/first_name|last_name|full_name/);
    // ip hashes are internal correlation keys — they must not leak either
    expect(json).not.toContain('zzz');
  });

  test('report states the known-vs-anonymous policy verbatim for the UI', () => {
    const report = buildSellerReport(baseInput());
    expect(report.known_vs_anonymous_policy).toMatch(/self-identified/i);
    expect(report.known_vs_anonymous_policy).toMatch(/aggregate/i);
  });
});

describe('buildSellerReport — inquiries', () => {
  test('counts inquiries by source and splits RSVP into engagement', () => {
    const inquiries = [
      { source: 'contact_form', created_at: daysAgo(1), has_message: true },
      { source: 'inquiry', created_at: daysAgo(2), has_message: true },
      { source: 'inquiry', created_at: daysAgo(20), has_message: false },
      { source: 'open_house_rsvp', created_at: daysAgo(5), has_message: false },
    ];
    const report = buildSellerReport(baseInput({ inquiries }));
    expect(report.inquiries.total).toBe(4);
    expect(report.inquiries.by_source).toEqual({
      contact_form: 1,
      inquiry: 2,
      open_house_rsvp: 1,
    });
    expect(report.inquiries.with_message).toBe(2);
    expect(report.inquiries.last_30_days).toBe(4);
    expect(report.engagement.open_house_rsvps).toBe(1);
  });

  test('inquiry free-text messages are never included (Fair Housing scan surface stays in CRM)', () => {
    const report = buildSellerReport(
      baseInput({ inquiries: [{ source: 'inquiry', created_at: daysAgo(1), has_message: true }] })
    );
    expect(JSON.stringify(report)).not.toMatch(/"message"/);
  });
});

describe('buildSellerReport — engagement (showings + client actions)', () => {
  test('aggregates showings by status and type', () => {
    const showings = [
      { type: 'private', status: 'completed', date: daysAgo(4) },
      { type: 'private', status: 'requested', date: daysAgo(1) },
      { type: 'openhouse', status: 'confirmed', date: daysAgo(2) },
      { type: 'private', status: 'cancelled', date: daysAgo(9) },
    ];
    const report = buildSellerReport(baseInput({ showings }));
    expect(report.engagement.showings.total).toBe(4);
    expect(report.engagement.showings.completed).toBe(1);
    expect(report.engagement.showings.upcoming_or_requested).toBe(2);
    expect(report.engagement.showings.by_type).toEqual({ private: 3, openhouse: 1 });
  });

  test('aggregates client listing actions by action type', () => {
    const actions = [
      { action: 'sent', created_at: daysAgo(6) },
      { action: 'sent', created_at: daysAgo(5) },
      { action: 'liked', created_at: daysAgo(4) },
      { action: 'discuss', created_at: daysAgo(3) },
    ];
    const report = buildSellerReport(baseInput({ actions }));
    expect(report.engagement.client_actions).toEqual({ sent: 2, liked: 1, discuss: 1 });
    expect(report.engagement.saves_or_likes).toBe(1);
  });
});

describe('buildSellerReport — market context (PROXY only)', () => {
  test('computes count, median price and median DOM from similar actives', () => {
    const similarActives = [
      { list_price: 400000, days_on_market: 30 },
      { list_price: 450000, days_on_market: 50 },
      { list_price: 500000, days_on_market: 90 },
    ];
    const report = buildSellerReport(baseInput({ similarActives }));
    expect(report.market_context.similar_active_count).toBe(3);
    expect(report.market_context.median_list_price).toBe(450000);
    expect(report.market_context.median_days_on_market).toBe(50);
    expect(report.market_context.subject_days_on_market).toBe(40);
  });

  test('median with an even row count averages the middle two', () => {
    const similarActives = [
      { list_price: 400000, days_on_market: 10 },
      { list_price: 420000, days_on_market: 20 },
      { list_price: 480000, days_on_market: 40 },
      { list_price: 500000, days_on_market: 80 },
    ];
    const report = buildSellerReport(baseInput({ similarActives }));
    expect(report.market_context.median_list_price).toBe(450000);
    expect(report.market_context.median_days_on_market).toBe(30);
  });

  test('reports the ±20% price band used for comparability', () => {
    const report = buildSellerReport(baseInput());
    expect(report.market_context.price_band).toEqual({ min: 340000, max: 510000 });
  });

  test('empty comp set yields nulls — never fabricated market numbers', () => {
    const report = buildSellerReport(baseInput());
    expect(report.market_context.similar_active_count).toBe(0);
    expect(report.market_context.median_list_price).toBeNull();
    expect(report.market_context.median_days_on_market).toBeNull();
  });

  test('proxy disclaimer forbids competitor-traffic claims', () => {
    const report = buildSellerReport(baseInput());
    expect(report.market_context.disclaimer).toMatch(/own database/i);
    expect(report.market_context.disclaimer).toMatch(/not .*(competitor|portal) traffic/i);
  });
});

describe('buildSellerReport — data gaps (honesty contract)', () => {
  test('data_gaps is non-empty and names the untracked Phase-2 surfaces', () => {
    const report = buildSellerReport(baseInput());
    expect(report.data_gaps.length).toBeGreaterThanOrEqual(3);
    const joined = report.data_gaps.join(' | ');
    expect(joined).toMatch(/photo.gallery/i);
    expect(joined).toMatch(/anonymous/i);
    expect(joined).toMatch(/Phase 2/);
  });

  test('report echoes listing identity fields needed for the header', () => {
    const report = buildSellerReport(baseInput());
    expect(report.listing).toEqual({
      listing_id: 'SL-0007',
      address_display: '400 East 90th Street 4D, New York, NY 10128',
      status: 'Active',
      listing_type: 'sale',
      property_type: 'Residential',
      borough: 'Manhattan',
      list_price: 425000,
      days_on_market: 40,
      first_active_date: '2026-05-24T00:00:00.000Z',
    });
    expect(report.generated_at).toBe(NOW.toISOString());
  });
});


// ── Codex #472 fixes (RED first) ─────────────────────────────────────────
import { composeAddressDisplay } from '@/lib/seller-report/load-report';
import { parseOpenHouseId } from '@/lib/open-houses/parse-open-house-id';
import { rsvpAddressMatches } from '@/lib/open-houses/rsvp-address-match';
import { isLocalOpenHousePubliclyEligible } from '@/lib/open-houses/local-open-house-eligible';

describe('Codex #472 r1 — PascalCase address + capped-slice totals', () => {
  it('composeAddressDisplay reads RESO PascalCase (IDX rows) incl. DirPrefix/Suffix via canonical street composition', () => {
    const line = composeAddressDisplay(
      { StreetNumber: '434', StreetDirPrefix: 'W', StreetName: '20th', StreetSuffix: 'Street', UnitNumber: '7', City: 'New York City', StateOrProvince: 'NY', PostalCode: '10011' },
      'RLS20084568'
    );
    expect(line).toBe('434 W 20th Street 7, New York City, NY 10011');
  });

  it('composeAddressDisplay includes StreetDirSuffix — "Central Park S" not "Central Park" (Codex #472 r13)', () => {
    expect(composeAddressDisplay(
      { StreetNumber: '160', StreetName: 'Central', StreetSuffix: 'Park', StreetDirSuffix: 'S', City: 'New York', StateOrProvince: 'NY', PostalCode: '10019' },
      'X',
    )).toBe('160 Central Park S, New York, NY 10019');
    expect(composeAddressDisplay(
      { StreetNumber: '100', StreetName: 'Park', StreetSuffix: 'Avenue', StreetDirSuffix: 'S' }, 'X',
    )).toContain('100 Park Avenue S');
  });

  it('composeAddressDisplay still reads camelCase (CRM/local rows); PascalCase wins when both present', () => {
    expect(composeAddressDisplay({ streetNumber: '400', streetName: 'East 90th Street', unitNumber: '4D', city: 'New York', state: 'NY', postalCode: '10128' }, 'SL-0007'))
      .toBe('400 East 90th Street 4D, New York, NY 10128');
    expect(composeAddressDisplay({ StreetName: 'Broadway', streetName: 'STALE' }, 'X')).toContain('Broadway');
  });

  it('composeAddressDisplay falls back to the listing id when the address JSON is empty', () => {
    expect(composeAddressDisplay({}, 'RLS123')).toBe('RLS123');
  });

  it('viewer metrics honor exact DB aggregates when provided (Codex #472 r3 — capped slice must not masquerade as all-time)', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const views = [
      { lead_id: 'lead-a', ip_hash: 'ha', device_type: 'mobile', referrer: null, viewed_at: new Date('2026-07-01T10:00:00Z') },
    ];
    const report = buildSellerReport({
      ...baseInput(), views, total_view_count: 9000, now,
      viewer_aggregates: { unique_viewers: 4321, known_viewers: 210, returning_viewers: 333, device_breakdown: { mobile: 6000, desktop: 3000 } },
    });
    expect(report.exposure.unique_viewers).toBe(4321);
    expect(report.exposure.known_viewers).toBe(210);
    expect(report.exposure.returning_viewers).toBe(333);
    expect(report.exposure.device_breakdown).toEqual({ mobile: 6000, desktop: 3000 });
  });

  it('with_message + engagement RSVPs come from exact aggregates past the cap (Codex #472 r6)', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const inquiries = [
      { source: 'contact_form', created_at: new Date('2026-07-01T10:00:00Z'), has_message: true },
    ];
    const report = buildSellerReport({
      ...baseInput(), inquiries, now,
      inquiry_aggregates: { total: 7500, by_source: { contact_form: 6000, open_house_rsvp: 1500 }, last_30_days: 1200, with_message: 4200 },
    });
    expect(report.inquiries.with_message).toBe(4200);
    expect(report.engagement.open_house_rsvps).toBe(1500);
  });

  it('inquiry metrics honor exact DB aggregates when provided (Codex #472 r5 — capped inquiry slice must not pose as totals)', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const inquiries = [
      { source: 'contact_form', created_at: new Date('2026-07-01T10:00:00Z'), has_message: true },
    ];
    const report = buildSellerReport({
      ...baseInput(), inquiries, now,
      inquiry_aggregates: { total: 7500, by_source: { contact_form: 7000, inquiry: 500 }, last_30_days: 1200 },
    });
    expect(report.inquiries.total).toBe(7500);
    expect(report.inquiries.by_source).toEqual({ contact_form: 7000, inquiry: 500 });
    expect(report.inquiries.last_30_days).toBe(1200);
  });

  it('windowed view counts honor exact DB counts when provided (Codex #472 r4 — 8,123 views in 7 days must not read 5,000)', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const views = [
      { lead_id: 'lead-a', ip_hash: 'ha', device_type: 'mobile', referrer: null, viewed_at: new Date('2026-07-02T09:00:00Z') },
    ];
    const report = buildSellerReport({
      ...baseInput(), views, total_view_count: 8123, now,
      window_counts: { last_7_days: 8123, last_30_days: 8123 },
    });
    expect(report.exposure.views_last_7_days).toBe(8123);
    expect(report.exposure.views_last_30_days).toBe(8123);
  });

  it('appends a slice-limited data gap when the cap is hit WITHOUT exact aggregates (fail-honest)', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const views = [
      { lead_id: 'lead-a', ip_hash: 'ha', device_type: 'mobile', referrer: null, viewed_at: new Date('2026-07-01T10:00:00Z') },
    ];
    const report = buildSellerReport({ ...baseInput(), views, total_view_count: 9000, now });
    expect(report.data_gaps.some((g) => /newest \d+ of \d+ tracked views/i.test(g))).toBe(true);
  });

  it('first_view_at honors the true earliest timestamp when the newest-first slice is capped (Codex #472 r2)', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const views = [
      { lead_id: 'lead-a', ip_hash: 'ha', device_type: 'mobile', referrer: null, viewed_at: new Date('2026-07-01T10:00:00Z') },
      { lead_id: 'lead-b', ip_hash: 'hb', device_type: 'desktop', referrer: null, viewed_at: new Date('2026-07-02T09:00:00Z') },
    ];
    const trueFirst = new Date('2026-03-15T08:30:00Z'); // outside the capped slice
    const report = buildSellerReport({ ...baseInput(), views, total_view_count: 9000, earliest_view_at: trueFirst, now });
    expect(report.exposure.first_view_at).toBe(trueFirst.toISOString());
  });

  it('total_views honors the true DB count when the detail slice is capped (high-traffic listing)', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const views = Array.from({ length: 3 }, (_, i) => ({
      lead_id: `lead-${i}`, ip_hash: `h${i}`, device_type: 'mobile', referrer: null,
      viewed_at: new Date(now.getTime() - i * 3600_000),
    }));
    const report = buildSellerReport({ ...baseInput(), views, total_view_count: 8123, now });
    expect(report.exposure.total_views).toBe(8123);
    // windowed metrics still come from the (newest) slice
    expect(report.exposure.views_last_7_days).toBe(3);
  });
});


describe('parseOpenHouseId — RSVP listing linkage (Codex #472 r3)', () => {
  it("resolves local-{showingId} ids", () => {
    expect(parseOpenHouseId('local-123')).toEqual({ kind: 'local', showingId: 123n });
  });
  it('classifies trestle ids as unresolvable-by-design (documented limitation)', () => {
    expect(parseOpenHouseId('trestle-ABC123')).toEqual({ kind: 'trestle' });
  });
  it('returns null on garbage / absent input', () => {
    expect(parseOpenHouseId('local-notanumber')).toBeNull();
    expect(parseOpenHouseId('')).toBeNull();
    expect(parseOpenHouseId(undefined)).toBeNull();
  });
});


describe('rsvpAddressMatches — RSVP linkage integrity (Codex #472 r5)', () => {
  it('matches when the submitted address contains the listing street number + a street-name token', () => {
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'East 90th Street' }, '400 East 90th Street, Unit 4D')).toBe(true);
    expect(rsvpAddressMatches({ streetNumber: '333', streetName: 'East 46th Street' }, '333 E 46th St 2G')).toBe(true);
  });
  it('rejects a mismatched submitted address (attacker posts an arbitrary address with a real showing id)', () => {
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'East 90th Street' }, '123 Fake Street')).toBe(false);
  });

  it('Queens hyphenated street numbers link — all number tokens present (Codex #472 r9)', () => {
    expect(rsvpAddressMatches({ StreetNumber: '25-10', StreetName: '30th Avenue' }, '25-10 30th Ave, Astoria')).toBe(true);
    expect(rsvpAddressMatches({ StreetNumber: '25-10', StreetName: '30th Avenue' }, '25 30th Ave')).toBe(false); // missing the "10" token
  });

  it('requires a DISTINCTIVE street token — generic direction/suffix words do not link (Codex #472 r8)', () => {
    // listing "400 East 90th Street" must NOT link these mismatched addresses:
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'East 90th Street' }, '400 Fake Street')).toBe(false);   // only "street" overlaps
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'East 90th Street' }, '400 East 91st Street')).toBe(false); // "east"+"street" overlap, 90th != 91st
    // the real address (distinctive "90th") still links:
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'East 90th Street' }, '400 East 90th Street, Unit 4D')).toBe(true);
    // a name with NO distinctive token (all generic) fails closed rather than false-linking:
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'North Street' }, '400 North Avenue')).toBe(false);
  });

  it('short NON-generic street tokens are distinctive — real NYC streets still link (Codex #472 r10)', () => {
    // "West End" — distinctive "end" (len 3) was wrongly dropped, dropping valid RSVPs:
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'West End Avenue' }, '400 West End Ave')).toBe(true);
    // alphabet avenues — distinctive "a" (len 1):
    expect(rsvpAddressMatches({ StreetNumber: '123', StreetName: 'Avenue A' }, '123 Avenue A, Apt 5')).toBe(true);
    // short proper names (Elm) link too:
    expect(rsvpAddressMatches({ StreetNumber: '12', StreetName: 'Elm Street' }, '12 Elm Street')).toBe(true);
    // fail-closed PRESERVED: a genuinely different short name must NOT link:
    expect(rsvpAddressMatches({ StreetNumber: '12', StreetName: 'Elm Street' }, '12 Oak Street')).toBe(false);
    // distinct alphabet avenues must NOT cross-link:
    expect(rsvpAddressMatches({ StreetNumber: '123', StreetName: 'Avenue A' }, '123 Avenue B')).toBe(false);
  });

  it('does NOT cross-link different streets sharing one short token — false positives fail CLOSED (Codex #472 r11)', () => {
    // direction must matter: an East End Ave RSVP must NOT land on a West End Ave listing
    expect(rsvpAddressMatches({ StreetNumber: '170', StreetName: 'West End Avenue' }, '170 East End Avenue')).toBe(false);
    // a unit/apartment letter must not satisfy an alphabet-avenue core token
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'Avenue A' }, '400 Broadway, Apt A')).toBe(false);
    // a shared street-type word (Circle/Row/Concourse/Broadway) must not link different names
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'Oak Circle' }, '400 Pine Circle')).toBe(false);
    expect(rsvpAddressMatches({ StreetNumber: '55', StreetName: 'Bank Row' }, '55 Park Row')).toBe(false);
    // a shared short token in an otherwise different street name
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'West End Avenue' }, '400 Dead End Road')).toBe(false);
    // Broadway fails closed unless exact — "West Broadway" is a different street
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'Broadway' }, '400 West Broadway')).toBe(false);
    // same core, different street-type suffix = different street
    expect(rsvpAddressMatches({ StreetNumber: '12', StreetName: 'Oak Street' }, '12 Oak Avenue')).toBe(false);
  });

  it('still links legitimate addresses after the r11 tightening (regression guard)', () => {
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'West End Avenue' }, '400 West End Ave')).toBe(true);
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'Broadway' }, '400 Broadway')).toBe(true);
    expect(rsvpAddressMatches({ StreetNumber: '123', StreetName: 'Avenue A' }, '123 Avenue A, Apt 5')).toBe(true);
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'East 90th Street' }, '400 East 90th')).toBe(true); // suffix omitted is fine
    expect(rsvpAddressMatches({ streetNumber: '333', streetName: 'East 46th Street' }, '333 E 46th St 2G')).toBe(true); // abbreviations + bare unit token
  });

  it('returning_viewers SQL groups on the lead-level key, not the ip_hash key (Codex #472 r10 — SQL-path guard)', () => {
    // The returning-viewers aggregate is raw SQL in load-report.ts and cannot be
    // executed in this jest env (no in-memory Postgres). This source-level guard
    // locks the fix so a revert is caught: the returning subquery must GROUP BY
    // lead_id (the same key the in-memory reducer uses), NOT the ip_hash-fused key
    // that over-merged two leads on one office/household IP into a false "returning"
    // viewer. Behavioural semantics are pinned separately by the 'two leads on one
    // network' reducer test.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'lib', 'seller-report', 'load-report.ts'),
      'utf8',
    ) as string;
    const start = src.indexOf('SELECT 1 FROM listing_views');
    const end = src.indexOf('returning_viewers', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const returningSubquery = src.slice(start, end);
    expect(returningSubquery).toMatch(/GROUP BY lead_id/);
    expect(returningSubquery).not.toMatch(/coalesce\(ip_hash/);
  });

  it('street number must match as an EXACT token — substring hits like 1400-vs-400 are rejected (Codex #472 r7)', () => {
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'East 90th Street' }, '1400 East 90th Street')).toBe(false);
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'East 90th Street' }, '400-402 East 90th Street')).toBe(true); // hyphenated ranges tokenize
    expect(rsvpAddressMatches({ StreetNumber: '90', StreetName: 'East 90th Street' }, '400 East 90th Street')).toBe(false); // "90" must not match "90th"
  });
  it('fails CLOSED when either side is missing (no linkage rather than a wrong one)', () => {
    expect(rsvpAddressMatches({}, '400 East 90th Street')).toBe(false);
    expect(rsvpAddressMatches({ StreetNumber: '400', StreetName: 'East 90th Street' }, '')).toBe(false);
  });
});

describe('rsvpAddressMatches — RESO split-shape address + cross-street safety (Codex #472 r12)', () => {
  // Production stores the SPLIT shape (verified live 2026-07-03): StreetName is bare
  // ("52nd", "30th", "Fort Washington"), with direction in StreetDirPrefix/DirSuffix
  // and type in StreetSuffix. The matcher must compose all four and compare by core
  // EQUALITY, so different real streets never cross-link.

  it('composes the split RESO fields — directioned numbered streets link their own address', () => {
    const eSt = { StreetNumber: '429', StreetDirPrefix: 'E', StreetName: '52nd', StreetSuffix: 'Street' };
    expect(rsvpAddressMatches(eSt, '429 East 52nd Street')).toBe(true);
    expect(rsvpAddressMatches(eSt, '429 East 52nd, #4D')).toBe(true);   // DTO shape (suffix omitted) + unit
    // …but must NOT link the opposite-direction street at the same number:
    expect(rsvpAddressMatches(eSt, '429 West 52nd Street')).toBe(false);
    // …nor a directionless submission (can't confirm E vs W → fail closed):
    expect(rsvpAddressMatches(eSt, '429 52nd Street')).toBe(false);
  });

  it('Fort Washington Avenue is a DIFFERENT street from Washington Avenue — core equality (Maya 2026-07-03)', () => {
    const fortWash = { StreetNumber: '720', StreetName: 'Fort Washington', StreetSuffix: 'Avenue' };
    const wash = { StreetNumber: '720', StreetName: 'Washington', StreetSuffix: 'Avenue' };
    // each links its OWN address:
    expect(rsvpAddressMatches(fortWash, '720 Fort Washington Avenue')).toBe(true);
    expect(rsvpAddressMatches(wash, '720 Washington Avenue')).toBe(true);
    // …but NEVER each other (the false positive r11 subset logic allowed):
    expect(rsvpAddressMatches(wash, '720 Fort Washington Avenue')).toBe(false);
    expect(rsvpAddressMatches(fortWash, '720 Washington Avenue')).toBe(false);
    // same class: Little West 12th ≠ West 12th; Central Park Avenue ≠ Park Avenue
    expect(rsvpAddressMatches({ StreetNumber: '55', StreetDirPrefix: 'W', StreetName: '12th', StreetSuffix: 'Street' }, '55 Little West 12th Street')).toBe(false);
    expect(rsvpAddressMatches({ StreetNumber: '100', StreetName: 'Park', StreetSuffix: 'Avenue' }, '100 Central Park Avenue')).toBe(false);
  });

  it('"St" is Saint when it leads a name (St Nicholas), Street only as a trailing type', () => {
    const stNick = { StreetNumber: '320', StreetName: 'St Nicholas', StreetSuffix: 'Avenue' };
    expect(rsvpAddressMatches(stNick, '320 St Nicholas Avenue')).toBe(true);
    expect(rsvpAddressMatches(stNick, '320 Saint Nicholas Avenue')).toBe(true);   // spelling drift tolerated
    expect(rsvpAddressMatches(stNick, '320 Nicholas Avenue')).toBe(false);        // dropping "Saint" = different street
    // trailing "St" still reads as Street:
    expect(rsvpAddressMatches({ StreetNumber: '100', StreetName: 'Bank', StreetSuffix: 'Street' }, '100 Bank St')).toBe(true);
  });

  it('lettered avenues (Avenue H) link exactly, never a sibling letter', () => {
    const aveH = { StreetNumber: '3220', StreetName: 'Ave H' };  // real shape: whole "Ave H" in StreetName
    expect(rsvpAddressMatches(aveH, '3220 Avenue H')).toBe(true);
    expect(rsvpAddressMatches(aveH, '3220 Ave H, Apt 2')).toBe(true);
    expect(rsvpAddressMatches(aveH, '3220 Avenue J')).toBe(false);   // different avenue
  });

  it('StreetDirSuffix distinguishes Central Park South from West, and Park Ave from Park Ave South', () => {
    const cpS = { StreetNumber: '160', StreetName: 'Central', StreetSuffix: 'Park', StreetDirSuffix: 'S' };
    expect(rsvpAddressMatches(cpS, '160 Central Park South')).toBe(true);
    expect(rsvpAddressMatches(cpS, '160 Central Park West')).toBe(false);   // different street (dir suffix)
    const parkAve = { StreetNumber: '100', StreetName: 'Park', StreetSuffix: 'Avenue' };
    expect(rsvpAddressMatches(parkAve, '100 Park Avenue')).toBe(true);
    expect(rsvpAddressMatches(parkAve, '100 Park Avenue South')).toBe(false); // Park Ave ≠ Park Ave South
  });

  it('Queens parallel grid — 30th Avenue does not absorb 30th Road / Street at the same number', () => {
    const q30ave = { StreetNumber: '25-10', StreetName: '30th', StreetSuffix: 'Avenue' };
    expect(rsvpAddressMatches(q30ave, '25-10 30th Avenue, Astoria')).toBe(true);   // own listing + trailing neighborhood
    expect(rsvpAddressMatches(q30ave, '25-10 30th Road, Astoria')).toBe(false);    // parallel street, same number
    expect(rsvpAddressMatches(q30ave, '25-10 30th Street')).toBe(false);
  });

  it('trailing city/state/zip is tolerated; a bare unit token does not break a pure-suffix name', () => {
    const kos = { StreetNumber: '558', StreetName: 'Kosciuszko', StreetSuffix: 'Street' };
    expect(rsvpAddressMatches(kos, '558 Kosciuszko Street, Brooklyn, NY 11221')).toBe(true);
    // Broadway (pure suffix) via the open-houses-list path that appends ", 4D" (no #):
    expect(rsvpAddressMatches({ StreetNumber: '100', StreetName: 'Broadway' }, '100 Broadway, 4D')).toBe(true);
    expect(rsvpAddressMatches({ StreetNumber: '100', StreetName: 'Broadway' }, '100 West Broadway')).toBe(false);
  });

  it('a bare trailing floor number cannot satisfy the stored house number (same-street wrong-building)', () => {
    const four = { StreetNumber: '4', StreetName: 'Main', StreetSuffix: 'Street' };
    expect(rsvpAddressMatches(four, '4 Main Street')).toBe(true);
    // "100 Main Street 4" is #100 with floor 4 — must NOT link the #4 listing:
    expect(rsvpAddressMatches(four, '100 Main Street 4')).toBe(false);
    expect(rsvpAddressMatches(four, '100 Main Street, 4')).toBe(false);
  });

  it('a borough/locality word INSIDE the street name is kept; only a TRAILING one is stripped (Codex #472 r13)', () => {
    // real streets whose identity contains a borough/state word — must still link:
    expect(rsvpAddressMatches({ StreetNumber: '123', StreetName: 'Manhattan', StreetSuffix: 'Avenue' }, '123 Manhattan Avenue')).toBe(true);
    expect(rsvpAddressMatches({ StreetNumber: '200', StreetName: 'New York', StreetSuffix: 'Avenue' }, '200 New York Avenue')).toBe(true);
    // …but they must not cross-link a different avenue:
    expect(rsvpAddressMatches({ StreetNumber: '123', StreetName: 'Manhattan', StreetSuffix: 'Avenue' }, '123 New York Avenue')).toBe(false);
    // trailing borough/state/ZIP (no comma) is still stripped so the address links:
    expect(rsvpAddressMatches({ StreetNumber: '558', StreetName: 'Kosciuszko', StreetSuffix: 'Street' }, '558 Kosciuszko Street Brooklyn NY 11221')).toBe(true);
  });
});


describe('isLocalOpenHousePubliclyEligible — RSVP gate == feed gate (Codex #472 r9)', () => {
  const base = { listing_id: 'SL-0004', status: 'Active', rls_eligible: false as const,
    owner_opt_out: false, participant_only: false,
    internet_entire_listing_display_yn: true, internet_address_display_yn: true };
  it('website-only Mallan exclusive, displayable status → eligible', () => {
    expect(isLocalOpenHousePubliclyEligible(base)).toBe(true);
  });
  it('non-Mallan-owned local (no SL/RL, rls_eligible true) → NOT eligible', () => {
    expect(isLocalOpenHousePubliclyEligible({ ...base, listing_id: 'X-1', rls_eligible: true })).toBe(false);
  });
  it('RLS-eligible local with owner opt-out → NOT eligible (feed fails closed here too)', () => {
    expect(isLocalOpenHousePubliclyEligible({ ...base, listing_id: 'SL-9', rls_eligible: true, owner_opt_out: true })).toBe(false);
  });
  it('participant-only → NOT eligible', () => {
    expect(isLocalOpenHousePubliclyEligible({ ...base, listing_id: 'RL-2', rls_eligible: true, participant_only: true })).toBe(false);
  });
  it('ineligible status (Closed) → NOT eligible', () => {
    expect(isLocalOpenHousePubliclyEligible({ ...base, status: 'Closed' })).toBe(false);
  });
});
