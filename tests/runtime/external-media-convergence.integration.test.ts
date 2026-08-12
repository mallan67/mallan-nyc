/**
 * REAL POSTGRES — canonical external-media convergence.
 *
 * Gated on EXTERNAL_MEDIA_DB_INTEGRATION_URL, which CI points at the disposable
 * postgres:15 service. Fails closed unless the host is loopback, so this can
 * never be aimed at Neon or any real database.
 *
 * CI applies the hand-written migration SQL (not `prisma db push`) before this
 * runs, because db push does not recreate the CHECK constraints. The constraint
 * assertions below therefore prove the ACTUAL shipped DDL.
 */
import { PrismaClient } from '@prisma/client';
import { convergeExternalMediaBatch } from '@/lib/media/external-media-repository';

const INTEGRATION_URL = process.env.EXTERNAL_MEDIA_DB_INTEGRATION_URL;

function hostOf(u: string | undefined): string {
  if (!u) return '';
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}

const HOST = hostOf(INTEGRATION_URL);
const LOOPBACK = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';

// Fail closed: a non-loopback integration URL is a configuration error, not a
// reason to silently skip. This is what keeps the suite off Neon.
if (INTEGRATION_URL && !LOOPBACK) {
  throw new Error(
    `EXTERNAL_MEDIA_DB_INTEGRATION_URL must point at loopback; got host "${HOST}"`,
  );
}

const run = INTEGRATION_URL && LOOPBACK ? describe : describe.skip;

const L = 'SL-EXTMEDIA-1';

function property(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    VirtualTourURLUnbranded: 'https://youtu.be/aaa',
    VirtualTourURLUnbranded2: 'https://my.matterport.com/show/?m=bbb',
    ...over,
  };
}

run('external-media convergence — real PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: INTEGRATION_URL } } });
    await prisma.$connect();
    await prisma.listing.upsert({
      where: { listing_id: L },
      // Every required Listing field lacking a default, enumerated from
      // schema.prisma rather than discovered one CI cycle at a time.
      create: {
        listing_id: L,
        listing_type: 'sale',
        list_price: 1,
        modification_timestamp: new Date('2026-08-12T00:00:00Z'),
      } as never,
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.listingExternalMedia.deleteMany({ where: { listing_id: L } });
    await prisma.listing.deleteMany({ where: { listing_id: L } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.listingExternalMedia.deleteMany({ where: { listing_id: L } });
  });

  const rows = () =>
    prisma.listingExternalMedia.findMany({
      where: { listing_id: L },
      orderBy: [{ source: 'asc' }, { source_key: 'asc' }],
    });

  it('the SHIPPED DDL is in force: compound PK, FK, three CHECKs, one unique index', async () => {
    const got = await prisma.$queryRawUnsafe<Array<{ conname: string; contype: string }>>(
      "SELECT conname, contype::text AS contype FROM pg_constraint " +
        "WHERE conrelid = 'listing_external_media'::regclass ORDER BY conname",
    );
    const names = got.map((c) => c.conname);
    expect(names).toContain('listing_external_media_pkey');
    expect(names).toContain('listing_external_media_listing_id_fkey');
    expect(names).toContain('listing_external_media_source_check');
    expect(names).toContain('listing_external_media_kind_check');
    expect(names).toContain('listing_external_media_cotality_slot_check');
    // Exactly one PK/unique constraint — no redundant second B-tree.
    expect(got.filter((c) => c.contype === 'p' || c.contype === 'u')).toHaveLength(1);
  });

  it('RUN ONE inserts; identical RUN TWO is a total no-op with updated_at frozen', async () => {
    const first = await convergeExternalMediaBatch(prisma, [{ listingId: L, property: property() }]);
    expect(first.inserts).toBe(2);
    expect(first.changedListingIds).toEqual([L]);

    const after1 = await rows();
    expect(after1).toHaveLength(2);
    const stamps = after1.map((r) => r.updated_at.getTime());

    const second = await convergeExternalMediaBatch(prisma, [{ listingId: L, property: property() }]);
    expect(second).toMatchObject({ inserts: 0, updates: 0, deletes: 0, unchanged: 1 });
    expect(second.changedListingIds).toEqual([]);

    const after2 = await rows();
    expect(after2.map((r) => r.updated_at.getTime())).toEqual(stamps);
  });

  it('classifies each slot and stores it source-faithfully', async () => {
    await convergeExternalMediaBatch(prisma, [{ listingId: L, property: property() }]);
    const r = await rows();
    expect(r.find((x) => x.source_key === 'VirtualTourURLUnbranded')?.kind).toBe('video');
    expect(r.find((x) => x.source_key === 'VirtualTourURLUnbranded2')?.kind).toBe('virtual_tour');
    expect(r.every((x) => x.source === 'cotality_property' && x.branded === false)).toBe(true);
  });

  it('changed URL updates exactly one row; vanished slot deletes exactly one row', async () => {
    await convergeExternalMediaBatch(prisma, [{ listingId: L, property: property() }]);

    const upd = await convergeExternalMediaBatch(prisma, [
      { listingId: L, property: property({ VirtualTourURLUnbranded: 'https://youtu.be/CHANGED' }) },
    ]);
    expect(upd).toMatchObject({ inserts: 0, updates: 1, deletes: 0 });

    const del = await convergeExternalMediaBatch(prisma, [
      { listingId: L, property: { VirtualTourURLUnbranded: 'https://youtu.be/CHANGED' } },
    ]);
    expect(del).toMatchObject({ inserts: 0, updates: 0, deletes: 1 });
    expect(await rows()).toHaveLength(1);
  });

  it('CRM rows survive Cotality convergence and coexist on the same key name', async () => {
    await prisma.listingExternalMedia.create({
      data: {
        listing_id: L,
        source: 'crm',
        source_key: 'VirtualTourURLUnbranded',
        url: 'https://vimeo.com/999',
        branded: false,
        kind: 'video',
      },
    });

    const res = await convergeExternalMediaBatch(prisma, [{ listingId: L, property: property() }]);
    expect(res.inserts).toBe(2); // cotality rows are NEW despite the identical key name
    expect(res.deletes).toBe(0); // crm row is never proposed for deletion
    expect(await rows()).toHaveLength(3);

    const wipe = await convergeExternalMediaBatch(prisma, [{ listingId: L, property: {} }]);
    expect(wipe.deletes).toBe(2);
    const survivors = await rows();
    expect(survivors).toHaveLength(1);
    expect(survivors[0].source).toBe('crm');
  });

  it('DB rejects invalid source, invalid kind, unlisted Cotality slot, and PK collision', async () => {
    const create = (over: Record<string, unknown>) =>
      prisma.listingExternalMedia.create({
        data: {
          listing_id: L,
          source: 'cotality_property',
          source_key: 'VirtualTourURLUnbranded',
          url: 'https://youtu.be/a',
          branded: false,
          kind: 'video',
          ...over,
        },
      });

    await expect(create({ source: 'nope' })).rejects.toThrow();
    await expect(create({ kind: 'tour' })).rejects.toThrow();
    await expect(create({ source_key: 'VirtualTourURLUnbranded4' })).rejects.toThrow();

    await create({});
    await expect(create({})).rejects.toThrow(); // compound PK collision
  });

  it('a failing transaction leaves ZERO partial state', async () => {
    await convergeExternalMediaBatch(prisma, [{ listingId: L, property: property() }]);
    const before = await rows();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.listingExternalMedia.deleteMany({ where: { listing_id: L } });
        await tx.listingExternalMedia.create({
          data: {
            listing_id: L,
            source: 'cotality_property',
            source_key: 'BOGUS_SLOT',
            url: 'https://x.example/y',
            branded: false,
            kind: 'video',
          },
        });
      }),
    ).rejects.toThrow();

    expect(await rows()).toHaveLength(before.length);
  });
});
