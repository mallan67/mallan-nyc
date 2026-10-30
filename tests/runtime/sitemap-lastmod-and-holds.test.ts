/// <reference types="jest" />
/**
 * Sitemap: honest lastmod, and the decisions that are HELD for the owner.
 *
 * Found 2026-10-29 (live probe + Search Console, mallan.nyc):
 *   1. Static and legal pages were stamped lastModified = "now" on every request. That teaches Google to
 *      ignore lastmod, including for listing and agent entries where it is accurate. They now carry none.
 *   2. HELD, NOT DONE: (a) Mallan-authored website-only listings (SL-/RL- id, rls_eligible=false) and (b) the
 *      59 neighbourhood guide pages are live and indexable but are not in the sitemap. Master 4.1 says
 *      internal visibility "does not by itself authorize ... website publication or SEO/indexation"; each is
 *      "a separate decision ... taken per surface", and 21.10 makes the sitemap a governed publication
 *      target where unknown means the restrictive form. The independent compliance review of 2026-10-30
 *      also found the neighbourhood pages render unscreened copy (a "Top School" line, a hand-entered
 *      statistics period that State records as an open decision). Until the owner records the decision,
 *      these tests pin the restrictive behaviour; when it is recorded, change them in the same PR.
 *   3. The building block is dormant: nothing writes buildings.active_listing_count (default 0).
 */
import { ACTIVE_DISPLAY_VALUES } from '@/lib/compliance/status';
import { excludeMallanRlsReturnCopies } from '@/lib/listings/mallan-source-identity';
import { ALL_BOROUGH_SLUGS, loadNeighborhoods } from '@/lib/neighborhoods/boroughs';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findMany: jest.fn() },
    agent: { findMany: jest.fn() },
    building: { findMany: jest.fn() },
  },
}));

import prisma from '@/lib/prisma';
import sitemap from '@/app/sitemap';

const findListings = (prisma as unknown as { listing: { findMany: jest.Mock } }).listing.findMany;
const findAgents = (prisma as unknown as { agent: { findMany: jest.Mock } }).agent.findMany;
const findBuildings = (prisma as unknown as { building: { findMany: jest.Mock } }).building.findMany;

// Third-party RLS row (live fixture shared with sitemap-slug-canonical-parity.test.ts).
const RLS_ROW = {
  listing_id: 'RLS20084568',
  mls_id: 'RLS20084568',
  internet_address_display_yn: true,
  modification_timestamp: new Date('2026-10-27T10:00:00Z'),
  address: {
    StreetNumber: '434', StreetDirPrefix: 'W', StreetName: '20th', StreetSuffix: 'Street',
    UnitNumber: '7', City: 'New York City', PostalCode: '10011',
  },
};
const AGENT_ROW = { public_slug: 'maya-allan', updated_at: new Date('2026-10-01T00:00:00Z') };

async function run() {
  findListings.mockReset().mockResolvedValue([RLS_ROW]);
  findAgents.mockReset().mockResolvedValue([AGENT_ROW]);
  findBuildings.mockReset().mockResolvedValue([]);
  const entries = await sitemap();
  const where = findListings.mock.calls[0][0].where as Record<string, unknown>;
  return { entries, urls: entries.map((e) => e.url), where };
}

describe('sitemap: lastmod honesty', () => {
  it('does not stamp static or legal pages with the current time', async () => {
    const { entries } = await run();
    const stamped = entries.filter((e) => !e.url.includes('/listing/') && !e.url.includes('/agents/') && e.lastModified !== undefined);
    expect(stamped.map((e) => e.url)).toEqual([]);
  });

  it('keeps the real modification time on listing and agent entries', async () => {
    const { entries } = await run();
    expect(entries.find((e) => e.url.endsWith('/rls20084568'))?.lastModified).toEqual(RLS_ROW.modification_timestamp);
    expect(entries.find((e) => e.url.endsWith('/agents/maya-allan'))?.lastModified).toEqual(AGENT_ROW.updated_at);
  });
});

describe('sitemap: decisions held for the owner (Master 4.1, 21.10)', () => {
  it('lists third-party RLS listings only through the four distribution gates, as before', async () => {
    const { where, urls } = await run();
    expect(where).toMatchObject({
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
      status: { in: [...ACTIVE_DISPLAY_VALUES] },
    });
    expect(where.AND).toEqual([excludeMallanRlsReturnCopies()]);
    expect(urls).toContain('https://mallan.nyc/listing/434-w-20th-street-apt-7-new-york-city-ny-10011/rls20084568');
  });

  it('does not add a branch for Mallan website-only listings until the owner records the decision', async () => {
    const { where } = await run();
    expect(where.OR).toBeUndefined();
  });

  it('does not list neighbourhood guide pages until the owner records the decision', async () => {
    const { urls } = await run();
    const neighbourhoodUrls = ALL_BOROUGH_SLUGS.flatMap((b) => loadNeighborhoods(b).map((n) => `https://mallan.nyc/${b}/${n.slug}`));
    expect(neighbourhoodUrls.length).toBeGreaterThan(50);
    expect(urls.filter((u) => neighbourhoodUrls.includes(u))).toEqual([]);
  });
});

describe('sitemap: dormant building block', () => {
  it('only offers building pages when the building table says there are active listings', async () => {
    await run();
    expect(findBuildings.mock.calls[0][0].where).toEqual({ active_listing_count: { gt: 0 } });
  });
});
