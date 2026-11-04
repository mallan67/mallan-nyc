/// <reference types="jest" />
/**
 * runRlsFollow — REAL PostgreSQL.
 *
 * rls-follow-cron.test.ts mocks Prisma, so it cannot prove what only a database can: that the JSON-path query that finds the linked listings (raw_data.saleRlsId starts with "RLS") runs on
 * PostgreSQL, that the id cursor reads every one of 250 listings, that the compare-and-set update and the search-projection write are one transaction (a failing projection rolls the update
 * back), that a listing saved in the CRM meanwhile is left alone, and that the projection and the audit event hold what the follow wrote.
 *
 * Cotality is stubbed (this file never signs in to it): the record is the live one for RLS20123633 as read on 2026-11-04. The database is a real, migrated Postgres; nothing else is.
 *
 * Gating: runs ONLY when ONE_CYCLE_DB_INTEGRATION_URL is set (CI points it at the ephemeral PostgreSQL service; a local run needs a throwaway database). It never connects to production Neon:
 * @/lib/prisma (which would read .env.local) is replaced here by a client built from that URL.
 */
const integrationUrl = process.env.ONE_CYCLE_DB_INTEGRATION_URL;

if (!integrationUrl) {
  describe.skip('runRlsFollow — real Postgres', () => {
    it('requires ONE_CYCLE_DB_INTEGRATION_URL (set in CI / local harness)', () => {
      /* skipped without the URL */
    });
  });
} else {
  const safeRevalidateTags = jest.fn();
  jest.mock('@/lib/prisma', () => {
    const { PrismaClient } = require('@prisma/client');
    return { __esModule: true, default: new PrismaClient({ datasources: { db: { url: process.env.ONE_CYCLE_DB_INTEGRATION_URL } } }) };
  });
  jest.mock('@/lib/idx/auth', () => ({ getAccessToken: jest.fn(async () => 'test-token') }));
  jest.mock('@/lib/idx/media-sync', () => ({ buildMallanOwnedListingWhere: () => ({ OR: [{ listing_id: { startsWith: 'SL-' } }, { listing_id: { startsWith: 'RL-' } }] }) }));
  jest.mock('@/lib/cache/public-cache', () => ({
    SEARCH_CACHE_TAG: 'search',
    listingCacheTag: (id: string) => `listing:${id}`,
    buildingAndManifestInvalidationTags: () => [],
    safeRevalidateTags: (...a: unknown[]) => safeRevalidateTags(...a),
  }));

  describe('runRlsFollow — real Postgres', () => {
    const prisma = require('@/lib/prisma').default as import('@prisma/client').PrismaClient;
    const { runRlsFollow } = require('@/lib/listings/rls-follow-run') as typeof import('@/lib/listings/rls-follow-run');
    const projection = require('@/lib/search/listing-search-projection') as typeof import('@/lib/search/listing-search-projection');

    const PREFIX = 'SL-INT-';
    const LIVE = {
      ListingId: 'RLS20123633', ListingKey: '1194314473', ListOfficeMlsId: '7041', StandardStatus: 'Active', ListPrice: 1200000,
      BedroomsTotal: 8, BathroomsFull: 3, BathroomsHalf: 0, LivingArea: 1482, RoomsTotal: 8, StoriesTotal: 18, YearBuilt: 1957, AssociationFee: 1588, AssociationFeeFrequency: 'Monthly',
      StreetNumber: '800', StreetDirPrefix: null, StreetName: '2ND', StreetSuffix: 'Avenue', UnitNumber: '806', PostalCode: '10017',
    };
    const ADDRESS = { StreetNumber: '800', StreetName: '2nd Avenue', UnitNumber: '806', PostalCode: '10017' };

    /** Cotality answers each request with the records for the RLS IDs it asks about, from `records`. */
    let records: Record<string, Record<string, unknown>> = {};
    let onAsk: (() => Promise<void>) | null = null;
    function stubCotality() {
      global.fetch = jest.fn(async (url: string) => {
        if (onAsk) { const f = onAsk; onAsk = null; await f(); }
        const ids = [...decodeURIComponent(String(url).replace(/\+/g, ' ')).matchAll(/ListingId eq '(RLS\d+)'/g)].map((m) => m[1]);
        return { ok: true, status: 200, json: async () => ({ value: ids.filter((i) => records[i]).map((i) => records[i]) }) };
      }) as unknown as typeof fetch;
    }

    const listingRow = (n: number, over: Record<string, unknown> = {}) => ({
      listing_id: `${PREFIX}${String(n).padStart(4, '0')}`,
      listing_type: 'sale',
      status: 'Active',
      list_price: 1200000,
      bedrooms_total: 0,
      bathrooms_full: 2,
      bathrooms_half: 0,
      living_area: 1482,
      postal_code: '10017',
      address: ADDRESS,
      features: {},
      raw_data: { saleRlsId: 'RLS20123633', PublicRemarks: 'Our own description.' },
      modification_timestamp: new Date('2026-11-03T16:28:40.683Z'),
      ...over,
    });

    const clean = async () => {
      const rows = await prisma.listing.findMany({ where: { listing_id: { startsWith: PREFIX } }, select: { id: true, listing_id: true } });
      if (!rows.length) return;
      await prisma.auditEvent.deleteMany({ where: { entity_type: 'listing', entity_id: { in: rows.map((r) => r.id.toString()) } } });
      await prisma.listing.deleteMany({ where: { listing_id: { startsWith: PREFIX } } });   // the projection row goes with its listing (cascade)
    };

    beforeAll(clean);
    beforeEach(async () => {
      await clean();
      safeRevalidateTags.mockClear();
      records = { RLS20123633: LIVE };
      onAsk = null;
      stubCotality();
    });
    afterAll(async () => {
      await clean();
      await prisma.$disconnect();
    });

    const read = (listing_id: string) => prisma.listing.findUniqueOrThrow({ where: { listing_id } });

    it('the JSON-path query finds the linked listing on real PostgreSQL, and the follow writes the record, the search projection and the audit event together', async () => {
      await prisma.listing.create({ data: listingRow(1) });
      await prisma.listing.create({ data: listingRow(2, { raw_data: { PublicRemarks: 'no RLS link' } }) });
      await prisma.listing.create({ data: listingRow(3, { status: 'Draft', raw_data: { saleRlsId: 'RLS20123999' } }) });
      const before = await read(`${PREFIX}0001`);

      const { httpStatus, summary } = await runRlsFollow({ budgetMs: 60_000 });

      expect(httpStatus).toBe(200);
      expect(summary).toMatchObject({ linked: 1, changed: 1, failed: [], duplicateLinks: [], notTheSameUnit: [], statusMismatch: [] });
      const after = await read(`${PREFIX}0001`);
      expect(after.bedrooms_total).toBe(8);
      expect(after.bathrooms_full).toBe(3);
      expect(Number(after.list_price)).toBe(1200000);
      expect(after.status).toBe('Active');                                                    // status is never the follow's to change
      expect(after.modification_timestamp.getTime()).toBeGreaterThan(before.modification_timestamp.getTime());
      expect(after.raw_data).toMatchObject({ saleRlsId: 'RLS20123633', PublicRemarks: 'Our own description.', BedroomsTotal: 8, saleBedrooms: 8, BathroomsFull: 3, saleFullBaths: 3 });
      expect(after.features).toMatchObject({ RoomsTotal: 8, YearBuilt: 1957, StoriesTotal: 18, AssociationFee: 1588 });
      // the other two listings are untouched
      expect((await read(`${PREFIX}0002`)).bedrooms_total).toBe(0);
      expect((await read(`${PREFIX}0003`)).bedrooms_total).toBe(0);

      const proj = await prisma.listingSearchProjection.findFirstOrThrow({ where: { listing_id: `${PREFIX}0001` } });
      expect(proj.bedrooms).toBe(8);
      expect(proj.bathrooms).toBe(3);

      const audit = await prisma.auditEvent.findMany({ where: { action: 'rls_follow', entity_id: after.id.toString() } });
      expect(audit).toHaveLength(1);
      expect(audit[0].changes).toMatchObject({ listing_id: `${PREFIX}0001`, rls_id: 'RLS20123633', source: 'cotality' });
      expect(safeRevalidateTags).toHaveBeenCalledWith(expect.arrayContaining([`listing:${PREFIX}0001`, 'search']));

      // the same run again finds nothing to do
      safeRevalidateTags.mockClear();
      const again = await runRlsFollow({ budgetMs: 60_000 });
      expect(again.summary).toMatchObject({ linked: 1, changed: 0, unchanged: 1 });
      expect(safeRevalidateTags).not.toHaveBeenCalled();
    });

    it('a projection write that fails rolls the update back (the record keeps its old facts), and the next run follows it', async () => {
      await prisma.listing.create({ data: listingRow(1) });
      const spy = jest.spyOn(projection, 'dualWriteProjectionForListingId').mockRejectedValueOnce(new Error('projection down'));
      const first = await runRlsFollow({ budgetMs: 60_000 });
      spy.mockRestore();
      expect(first.summary).toMatchObject({ changed: 0, failed: [{ listing_id: `${PREFIX}0001`, error: 'projection down' }] });
      const rolledBack = await read(`${PREFIX}0001`);
      expect(rolledBack.bedrooms_total).toBe(0);                                              // not half-written
      expect(rolledBack.modification_timestamp.toISOString()).toBe('2026-11-03T16:28:40.683Z');
      expect(await prisma.auditEvent.count({ where: { action: 'rls_follow', entity_id: rolledBack.id.toString() } })).toBe(0);
      expect(safeRevalidateTags).not.toHaveBeenCalled();

      const next = await runRlsFollow({ budgetMs: 60_000 });
      expect(next.summary).toMatchObject({ changed: 1, failed: [] });
      expect((await read(`${PREFIX}0001`)).bedrooms_total).toBe(8);
      expect((await prisma.listingSearchProjection.findFirstOrThrow({ where: { listing_id: `${PREFIX}0001` } })).bedrooms).toBe(8);
    });

    it('a listing saved in the CRM after it was read is left alone (compare-and-set on its modification time)', async () => {
      await prisma.listing.create({ data: listingRow(1) });
      const savedMeanwhile = new Date('2026-11-04T09:00:00.000Z');
      // the CRM saves the listing while the follow is asking Cotality
      onAsk = async () => { await prisma.listing.update({ where: { listing_id: `${PREFIX}0001` }, data: { bedrooms_total: 3, modification_timestamp: savedMeanwhile } }); };
      const { summary } = await runRlsFollow({ budgetMs: 60_000 });
      expect(summary).toMatchObject({ changed: 0 });
      expect(summary.skipped).toEqual([{ listing_id: `${PREFIX}0001`, reason: expect.stringMatching(/saved meanwhile/) }]);
      const row = await read(`${PREFIX}0001`);
      expect(row.bedrooms_total).toBe(3);                                                     // the agent's save stands
      expect(row.modification_timestamp.toISOString()).toBe(savedMeanwhile.toISOString());
      // and the next run, which reads the saved listing, follows Cotality
      expect((await runRlsFollow({ budgetMs: 60_000 })).summary).toMatchObject({ changed: 1 });
      expect((await read(`${PREFIX}0001`)).bedrooms_total).toBe(8);
    });

    it('two listings that carry the same RLS ID are followed by neither; a record for another unit is refused; nothing is written', async () => {
      await prisma.listing.create({ data: listingRow(1) });
      await prisma.listing.create({ data: listingRow(2) });
      let r = await runRlsFollow({ budgetMs: 60_000 });
      expect(r.summary.duplicateLinks).toEqual([{ rls: 'RLS20123633', listings: [`${PREFIX}0001`, `${PREFIX}0002`] }]);
      expect(r.summary.changed).toBe(0);
      await prisma.listing.delete({ where: { listing_id: `${PREFIX}0002` } });
      await prisma.listing.update({ where: { listing_id: `${PREFIX}0001` }, data: { address: { ...ADDRESS, UnitNumber: '807' } } });
      r = await runRlsFollow({ budgetMs: 60_000 });
      expect(r.summary.notTheSameUnit).toHaveLength(1);
      expect(r.summary.changed).toBe(0);
      expect((await read(`${PREFIX}0001`)).bedrooms_total).toBe(0);
    });

    it('Cotality says Withdrawn: the listing keeps its status and facts, and the difference is recorded once', async () => {
      await prisma.listing.create({ data: listingRow(1) });
      records = { RLS20123633: { ...LIVE, StandardStatus: 'Withdrawn', BedroomsTotal: 1 } };
      const first = await runRlsFollow({ budgetMs: 60_000 });
      const second = await runRlsFollow({ budgetMs: 60_000 });
      expect(first.summary.statusMismatch).toEqual([{ listing_id: `${PREFIX}0001`, rls: 'RLS20123633', cotalityStatus: 'Withdrawn' }]);
      expect(second.summary.statusMismatch).toHaveLength(1);
      const row = await read(`${PREFIX}0001`);
      expect(row.status).toBe('Active');
      expect(row.bedrooms_total).toBe(0);
      expect(await prisma.auditEvent.count({ where: { action: 'rls_follow_status_mismatch', entity_id: row.id.toString() } })).toBe(1);   // twice run, once recorded
    });

    it('reads every one of 250 linked listings, 100 to a page by id, and follows them all', async () => {
      const rows = Array.from({ length: 250 }, (_, i) => listingRow(i + 1, { raw_data: { saleRlsId: `RLS2001${String(1000 + i)}` } }));
      await prisma.listing.createMany({ data: rows });
      records = Object.fromEntries(rows.map((r, i) => [`RLS2001${String(1000 + i)}`, { ...LIVE, ListingId: `RLS2001${String(1000 + i)}` }]));
      const { httpStatus, summary } = await runRlsFollow({ budgetMs: 120_000 });
      expect(httpStatus).toBe(200);
      expect(summary).toMatchObject({ linked: 250, changed: 250, capped: false, timeBudgetReached: false, failed: [] });
      expect(await prisma.listing.count({ where: { listing_id: { startsWith: PREFIX }, bedrooms_total: 8 } })).toBe(250);
      expect(await prisma.listingSearchProjection.count({ where: { listing_id: { startsWith: PREFIX }, bedrooms: 8 } })).toBe(250);
    }, 180_000);
  });
}
