/// <reference types="jest" />
/**
 * Sitemap coverage: which listings mallan.nyc offers search engines, and which things it deliberately does not.
 *
 * Owner decision (Maya Allan, 2026-10-30): "get the listings ... included". Master 4.1 / 21.10 had held Mallan-authored listings as a
 * separate publication decision; this is it. Found 2026-10-29 (live probe + Search Console, mallan.nyc):
 *   1. Static and legal pages were stamped lastModified = "now" on every request. That teaches Google to ignore lastmod, including
 *      for listing and agent entries where it is accurate. They carry none.
 *   2. SL-0004 (Mallan website-only) was live and indexable but absent from the sitemap. It is now listed, through gates of its own.
 *
 * The 59 neighbourhood guides are offered since their copy was cleaned of school, family and protected-class wording (owner instruction
 * 2026-10-30; the word-level guard in guardrails-prohibited-terms-single-source.test.ts fails if it returns).
 *
 * NOT offered, on purpose (independent compliance review 2026-10-30, recorded in State):
 *   - building pages: the building data layer has open gate questions (units read without the display flags, no return-copy
 *     exclusion on the live layer) that have to be closed against the live provider first.
 * Whoever lifts that hold changes the matching test below in the same PR that records the decision.
 *
 * The rows are shaped like real `listings` rows. The Prisma client is mocked for the sitemap route; the population itself is checked by
 * evaluating the real `where` over sample rows, not by matching its text.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ACTIVE_DISPLAY_VALUES } from '@/lib/compliance/status';
import { ALL_BOROUGH_SLUGS, loadNeighborhoods } from '@/lib/neighborhoods/boroughs';
import { buildingCanonicalHref } from '@/lib/buildings/slug';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findMany: jest.fn() },
    agent: { findMany: jest.fn() },
  },
}));

// The building page's metadata asks the data layer for the building; nothing found is enough for what is checked here.
jest.mock('@/lib/buildings/public-building-data', () => ({
  __esModule: true,
  getBuildingDataCached: jest.fn().mockResolvedValue({ success: false }),
}));

import prisma from '@/lib/prisma';
import robots from '@/app/robots';
import { generateMetadata as buildingMetadata } from '@/app/buildings/[slug]/page';
import sitemap from '@/app/sitemap';
import { sitemapListingWhere, type SitemapListingRow } from '@/lib/sitemap/population';

const findListings = (prisma as unknown as { listing: { findMany: jest.Mock } }).listing.findMany;
const findAgents = (prisma as unknown as { agent: { findMany: jest.Mock } }).agent.findMany;

const NOW = new Date('2026-10-30T12:00:00Z');
const MODIFIED = new Date('2026-10-27T10:00:00Z');

// ── A tiny evaluator for the Prisma operators the sitemap `where` uses ─────────────────────────────
// Equality, null, in, notIn, gt, startsWith, and OR / AND / NOT. SQL semantics are kept where they matter here: a NULL never matches
// `notIn`, which is why the return-copy exclusion names `list_office_mls_id: null` separately.
type Row = Record<string, unknown>;
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w));
    if (key === 'NOT') return !matches(row, cond as Row);
    const v = row[key];
    if (cond === null) return v === null || v === undefined;
    if (typeof cond !== 'object' || cond instanceof Date) return v === cond;
    return Object.entries(cond as Row).every(([op, arg]) => {
      if (op === 'in') return (arg as unknown[]).includes(v);
      if (op === 'notIn') return v !== null && v !== undefined && !(arg as unknown[]).includes(v);
      if (op === 'gt') return v !== null && v !== undefined && (v as number | Date) > (arg as number | Date);
      if (op === 'startsWith') return typeof v === 'string' && v.startsWith(arg as string);
      throw new Error(`operator not modelled by this test: ${op}`);
    });
  });
}

// A fully displayable third-party RLS row; each case overrides what it is about.
const RLS: Row = {
  listing_id: 'RLS20084568', status: 'Active', rls_eligible: true, list_office_mls_id: '4321',
  idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: true,
  owner_opt_out: false, participant_only: false, list_price: 1250000, expiration_date: null,
};
// A Mallan website-only row as the CRM writes it: outside RLS, so idx_display_yn is false.
const MALLAN: Row = {
  listing_id: 'SL-0004', status: 'Active', rls_eligible: false, list_office_mls_id: null,
  idx_display_yn: false, internet_entire_listing_display_yn: true, internet_address_display_yn: true,
  owner_opt_out: false, participant_only: false, list_price: 2400000, expiration_date: null,
};
const offered = (over: Row) => matches({ ...over }, sitemapListingWhere(NOW) as Row);

describe('the listing population: third-party RLS rows', () => {
  it('offers a fully displayable active row', () => expect(offered(RLS)).toBe(true));

  it.each([
    ['Active', true], ['ActiveUnderContract', true], ['ComingSoon', true],
    ['Pending', false], ['Closed', false], ['Canceled', false], ['Expired', false], ['Withdrawn', false], ['Hold', false], ['Draft', false],
  ])('status %s -> offered: %s', (status, expected) => expect(offered({ ...RLS, status })).toBe(expected));

  it.each([
    ['idx_display_yn off', { idx_display_yn: false }],
    ['entire-listing display off', { internet_entire_listing_display_yn: false }],
    ['owner opt-out', { owner_opt_out: true }],
    ['participant-only', { participant_only: true }],
  ])('does not offer a row with %s', (_n, over) => expect(offered({ ...RLS, ...over })).toBe(false));

  it("does not offer Mallan's own listing returned through Cotality (the local SL-/RL- row is the canonical page)", () => {
    expect(offered({ ...RLS, list_office_mls_id: '7041' })).toBe(false);
  });

  it('keeps a row of unknown provenance (suppression is never the default)', () => {
    expect(offered({ ...RLS, list_office_mls_id: null })).toBe(true);
  });

  it('offers an RLS-eligible SL- listing that is distributed through RLS with all four gates open', () => {
    expect(offered({ ...RLS, listing_id: 'SL-0100', list_office_mls_id: null })).toBe(true);
  });
});

describe('the listing population: Mallan website-only rows', () => {
  it('offers an ordinary active website-only listing (SL-0004)', () => expect(offered(MALLAN)).toBe(true));
  it('offers an RL- rental the same way', () => expect(offered({ ...MALLAN, listing_id: 'RL-0007' })).toBe(true));

  it.each([
    ['Draft', { status: 'Draft' }],
    ['Closed', { status: 'Closed' }],
    ['no price', { list_price: 0 }],
    ['entire-listing display off', { internet_entire_listing_display_yn: false }],
    ['address display off', { internet_address_display_yn: false }],
    ['owner opt-out', { owner_opt_out: true }],
    ['participant-only', { participant_only: true }],
    ['a lapsed exclusive agreement', { expiration_date: new Date('2026-10-01T00:00:00Z') }],
  ])('does not offer a row with %s', (_n, over) => expect(offered({ ...MALLAN, ...over })).toBe(false));

  it('offers a row whose exclusive runs on, and one with no expiration recorded', () => {
    expect(offered({ ...MALLAN, expiration_date: new Date('2027-03-01T00:00:00Z') })).toBe(true);
    expect(offered({ ...MALLAN, expiration_date: null })).toBe(true);
  });

  it('REGRESSION (compliance review B1): a website-only row with idx_display_yn ON and address display OFF is not offered', () => {
    // It used to pass the third-party branch (no address condition there; the return-copy exclusion re-admits SL-/RL- by prefix),
    // and the slug builder then published the address of a row it treats as outside RLS.
    expect(offered({ ...MALLAN, idx_display_yn: true, internet_address_display_yn: false })).toBe(false);
    expect(offered({ ...MALLAN, idx_display_yn: true, internet_address_display_yn: false, listing_id: 'RL-0007' })).toBe(false);
  });

  it('a website-only row is judged by its own branch only: idx_display_yn on does not skip its price or expiration rules', () => {
    expect(offered({ ...MALLAN, idx_display_yn: true })).toBe(true);
    expect(offered({ ...MALLAN, idx_display_yn: true, list_price: 0 })).toBe(false);
    expect(offered({ ...MALLAN, idx_display_yn: true, expiration_date: new Date('2026-10-01T00:00:00Z') })).toBe(false);
  });
});

describe('/sitemap.xml: what it lists', () => {
  const SITEMAP_ROW = (over: Row): SitemapListingRow =>
    ({ borough: 'Manhattan', internet_entire_listing_display_yn: true, internet_address_display_yn: true, modification_timestamp: MODIFIED, rls_eligible: true, ...over }) as unknown as SitemapListingRow;
  const W20 = { StreetNumber: '434', StreetDirPrefix: 'W', StreetName: '20th', StreetSuffix: 'Street', City: 'New York City', PostalCode: '10011' };
  const RLS_ROW = SITEMAP_ROW({ listing_id: 'RLS20084568', address: { ...W20, UnitNumber: '7' } });
  const RLS_SUPPRESSED = SITEMAP_ROW({
    listing_id: 'RLS20085000', internet_address_display_yn: false,
    address: { StreetNumber: '88', StreetName: 'Hidden', StreetSuffix: 'Avenue', City: 'New York', PostalCode: '10128', UnitNumber: '2C' },
  });
  const MALLAN_ROW = SITEMAP_ROW({
    listing_id: 'SL-0004', rls_eligible: false,
    address: { StreetNumber: '101', StreetName: 'Fake', StreetSuffix: 'Street', City: 'New York', PostalCode: '10001', UnitNumber: '5A' },
  });
  const AGENT_ROW = { public_slug: 'maya-allan', updated_at: new Date('2026-10-01T00:00:00Z') };

  async function run(rows: SitemapListingRow[]) {
    findListings.mockReset().mockResolvedValue(rows);
    findAgents.mockReset().mockResolvedValue([AGENT_ROW]);
    const entries = await sitemap();
    return { entries, urls: entries.map((e) => e.url) };
  }

  it('does not stamp static or legal pages with the current time', async () => {
    const { entries } = await run([RLS_ROW]);
    const stamped = entries.filter((e) => !e.url.includes('/listing/') && !e.url.includes('/agents/') && e.lastModified !== undefined);
    expect(stamped.map((e) => e.url)).toEqual([]);
  });

  it('keeps the real modification time on listing and agent entries', async () => {
    const { entries } = await run([RLS_ROW]);
    expect(entries.find((e) => e.url.endsWith('/rls20084568'))?.lastModified).toEqual(MODIFIED);
    expect(entries.find((e) => e.url.endsWith('/agents/maya-allan'))?.lastModified).toEqual(AGENT_ROW.updated_at);
  });

  it('lists a third-party RLS listing at the canonical the page declares', async () => {
    const { urls } = await run([RLS_ROW]);
    expect(urls).toContain('https://mallan.nyc/listing/434-w-20th-street-apt-7-new-york-city-ny-10011/rls20084568');
  });

  it("lists Mallan's own website-only listing (SL-0004) at its address URL", async () => {
    const { urls } = await run([MALLAN_ROW]);
    expect(urls).toContain('https://mallan.nyc/listing/101-fake-street-apt-5a-new-york-ny-10001/sl-0004');
  });

  it('puts no address in the URL of an RLS listing whose address display is switched off', async () => {
    const { urls } = await run([RLS_SUPPRESSED]);
    expect(urls.filter((u) => u.includes('/listing/'))).toEqual(['https://mallan.nyc/listing/listing-rls20085000']);
  });

  it('asks the database for exactly the population above, and for the flags the slug builder reads', async () => {
    await run([RLS_ROW]);
    const arg = findListings.mock.calls[0][0] as { where: Row; select: Row };
    expect(arg.where.status).toEqual({ in: [...ACTIVE_DISPLAY_VALUES] });
    expect(arg.where.OR).toHaveLength(2);
    expect(arg.select).toMatchObject({
      listing_id: true, address: true, rls_eligible: true,
      internet_entire_listing_display_yn: true, internet_address_display_yn: true,
    });
    // The where the route really sent behaves like the population: admits SL-0004, refuses the B1 row.
    expect(matches(MALLAN, arg.where)).toBe(true);
    expect(matches({ ...MALLAN, idx_display_yn: true, internet_address_display_yn: false }, arg.where)).toBe(false);
  });

  it('still lists the static pages and agents when the listing read fails', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    findListings.mockReset().mockRejectedValue(new Error('connection refused'));
    findAgents.mockReset().mockResolvedValue([AGENT_ROW]);
    const urls = (await sitemap()).map((e) => e.url);
    quiet.mockRestore();
    expect(urls).toContain('https://mallan.nyc/buy');
    expect(urls).toContain('https://mallan.nyc/agents/maya-allan');
    expect(urls.filter((u) => u.includes('/listing/'))).toEqual([]);
  });

  describe('neighbourhood guides', () => {
    const guides = ALL_BOROUGH_SLUGS.flatMap((b) => loadNeighborhoods(b).map((n) => ({ borough: b, url: `https://mallan.nyc/${b}/${n.slug}` })));

    it('lists every neighbourhood guide, once, with no lastmod (they have no modification time)', async () => {
      const { entries, urls } = await run([RLS_ROW]);
      expect(guides).toHaveLength(59);
      expect(guides.filter((g) => !urls.includes(g.url))).toEqual([]);
      expect(new Set(urls).size).toBe(urls.length);
      expect(entries.filter((e) => guides.some((g) => g.url === e.url) && e.lastModified !== undefined)).toEqual([]);
    });

    it('lists only addresses that have a page: each borough has a [neighborhood] route', () => {
      const missing = [...new Set(guides.map((g) => g.borough))].filter(
        (b) => !fs.existsSync(path.resolve(__dirname, '../../app', b, '[neighborhood]', 'page.tsx')),
      );
      expect(missing).toEqual([]);
    });
  });

  describe('held back, with the reason (change these in the PR that records the decision)', () => {
    it('does not list building pages (data-layer gate questions open)', async () => {
      const { urls } = await run([RLS_ROW, MALLAN_ROW]);
      expect(urls.filter((u) => u.includes('/buildings/'))).toEqual([]);
    });

    it('robots.txt names the one sitemap, and no index that is not served', () => {
      expect(robots().sitemap).toBe('https://mallan.nyc/sitemap.xml');
      for (const p of ['app/sitemap-index.xml', 'app/sitemap-buildings']) {
        expect(fs.existsSync(path.resolve(__dirname, '../..', p))).toBe(false);
      }
    });
  });
});

describe('building pages: one canonical URL', () => {
  it('is number + street + zip only; the building name is not part of it', () => {
    expect(buildingCanonicalHref({ streetNumber: '157', streetName: 'W 57th Street', postalCode: '10019' })).toBe('/buildings/profile?sn=157&st=W+57th+Street&z=10019');
    expect(buildingCanonicalHref({ streetNumber: '157', streetName: 'W 57th Street' })).toBe('/buildings/profile?sn=157&st=W+57th+Street');
    expect(buildingCanonicalHref({ streetNumber: '157', streetName: 'W 57th Street', postalCode: null })).toBe('/buildings/profile?sn=157&st=W+57th+Street');
  });

  const meta = (sp: Record<string, string>) => buildingMetadata({ params: Promise.resolve({ slug: 'x' }), searchParams: Promise.resolve(sp) });

  it('is what the building page declares as its canonical, whatever name or slug the link carried', async () => {
    const expected = 'https://mallan.nyc/buildings/profile?sn=434&st=W+20th+Street&z=10011';
    for (const bn of [undefined, 'The Foo', 'Foo Tower']) {
      const m = await meta({ sn: '434', st: 'W 20th Street', z: '10011', ...(bn ? { bn } : {}) });
      expect(m.alternates?.canonical).toBe(expected);
    }
  });

  it('does not index a ?bn= variant (its name comes from the link, not from our data); the plain URL stays indexable', async () => {
    const variant = await meta({ sn: '434', st: 'W 20th Street', z: '10011', bn: 'Typed Into A Link' });
    expect(variant.robots).toMatchObject({ index: false, follow: true, noimageindex: true });
    expect(variant.alternates?.canonical).toBe('https://mallan.nyc/buildings/profile?sn=434&st=W+20th+Street&z=10011');
    const plain = await meta({ sn: '434', st: 'W 20th Street', z: '10011' });
    expect(plain.robots).toMatchObject({ index: true });
  });

  it('asks image crawlers not to index its images until the building data layer is verified, and keeps the site-wide robots settings', async () => {
    const withData = await meta({ sn: '434', st: 'W 20th Street', z: '10011' });
    const withoutAddress = await meta({});
    for (const m of [withData, withoutAddress]) {
      expect(m.robots).toMatchObject({
        index: true, follow: true, noimageindex: true,
        googleBot: { index: true, follow: true, noimageindex: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
      });
    }
  });
});
