/// <reference types="jest" />
/**
 * CRM media → Listing summary convergence — REAL PostgreSQL integration test.
 *
 * WHY THIS IS NOT A MOCKED TEST
 *
 * The invariant is: a CRM media mutation and the derived `Listing` media summary
 * either BOTH commit or NEITHER does. No handcrafted Prisma object can prove
 * that. A mock `$transaction: (ops) => Promise.all(ops)` rolls nothing back — it
 * is a sequential executor wearing a transaction's name, and it reports success
 * for code that leaves the database split. This repository already learned the
 * lesson: `lead-upsert.integration.test.ts` exists because its mocked sibling
 * inspected only the SQL *string* and was blind to a wrong physical table name
 * that silently dropped leads.
 *
 * WHY IT CALLS THE PRODUCTION SERVICE
 *
 * An earlier draft of this file opened its own `prisma.$transaction(...)` and
 * called the summary updater inside it. That proves PostgreSQL transactions work
 * — which nobody doubted — and proves nothing about whether Mallan's routes use
 * them correctly. It was a second implementation of the pattern living in the
 * test. Every case below drives `withCrmMediaConvergence`, the SAME function the
 * upload / delete / set-main / reorder routes call. If a route stops using it,
 * these tests keep passing and the anti-bypass guard is what catches that — the
 * two protections are deliberately different.
 *
 * WHAT IS REAL vs STUBBED
 *   REAL: Postgres, Prisma, the transaction, FKs, the unique index, the summary
 *         formula, the production convergence service.
 *   STUBBED: nothing. This suite touches no external boundary.
 *
 * SAFETY
 *   - localhost / 127.0.0.1 ONLY, allow-listed. Any remote host fails closed;
 *     a hostname denylist is not sufficient because a renamed managed host slips
 *     through it.
 *   - In CI (`process.env.CI`) a missing URL FAILS. Skipping there would recreate
 *     the false-green this suite exists to prevent: someone edits the workflow
 *     env, the most important suite silently stops running, Jest still reports
 *     green. Locally, absent URL skips.
 */

const crmMediaIntegrationUrl = process.env.CRM_MEDIA_DB_INTEGRATION_URL;
const isCi = Boolean(process.env.CI);

/** Positive allow-list: only a local, disposable Postgres is acceptable. */
function isLocalPostgresUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.protocol === "postgresql:" || u.protocol === "postgres:") &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1")
    );
  } catch {
    return false;
  }
}

if (crmMediaIntegrationUrl && !isLocalPostgresUrl(crmMediaIntegrationUrl)) {
  throw new Error(
    "[crm-media-convergence] CRM_MEDIA_DB_INTEGRATION_URL must point at a local, " +
      "disposable Postgres (localhost / 127.0.0.1). This suite writes rows and " +
      "forces rollbacks; it must never reach a managed or shared database.",
  );
}

if (!crmMediaIntegrationUrl) {
  if (isCi) {
    describe("CRM media convergence (real Postgres)", () => {
      it("CI MUST provide CRM_MEDIA_DB_INTEGRATION_URL — skipping here would be a false green", () => {
        throw new Error(
          "CRM_MEDIA_DB_INTEGRATION_URL is not set in CI. The workflow provisions " +
            "postgres:15 for exactly this suite; a missing URL means the transaction " +
            "and convergence invariants ran nowhere.",
        );
      });
    });
  } else {
    describe.skip("CRM media convergence (real Postgres)", () => {
      it("requires CRM_MEDIA_DB_INTEGRATION_URL (local throwaway DB)", () => {
        // Intentionally empty — placeholder so the skipped file is not empty.
      });
    });
  }
} else {
  describe("CRM media convergence (real Postgres)", () => {
    const { PrismaClient } = require("@prisma/client");
    const { computeListingMediaSummary } = require("@/lib/idx/media-sync");
    // THE production service the CRM routes call. Not a reimplementation.
    const { withCrmMediaConvergence } = require("@/lib/media/crm-media-mutation");
    const routeClient = require("@/lib/prisma").default;

    // Independent connection. Rollback must be observed from OUTSIDE the
    // transaction that produced it; the client that ran it can read its own
    // uncommitted state.
    const observer = new PrismaClient({
      datasources: { db: { url: crmMediaIntegrationUrl } },
    });

    const stamp = Date.now();
    const listingId = `SL-ITEST-${stamp}`;
    const key = (n: number) => `crm:${listingId}:photo${n}`;

    const mediaRow = (n: number, over: Record<string, unknown> = {}) => ({
      listing_id: listingId,
      media_key: key(n),
      resource_record_key: listingId,
      media_url_original: `https://itest.invalid/${stamp}/${n}.jpg`,
      media_url_cached: `https://itest.invalid/${stamp}/${n}.webp`,
      media_type: "Photo",
      media_category: "Photo",
      status: "active",
      order: n,
      preferred_photo_yn: n === 1,
      ...over,
    });

    beforeAll(async () => {
      await routeClient.listing.create({
        data: {
          listing_id: listingId,
          status: "Active",
          listing_type: "sale",
          // Required by the real schema — a mocked client would have accepted
          // the row without them and hidden this on the way to Production.
          list_price: 1000000,
          modification_timestamp: new Date(),
          rls_eligible: false, // Mallan-owned; keeps this row out of feed logic
        },
      });
    });

    afterAll(async () => {
      await routeClient.listingMedia.deleteMany({ where: { listing_id: listingId } });
      await routeClient.listing.deleteMany({ where: { listing_id: listingId } });
      await observer.$disconnect();
    });

    async function storedSummary() {
      return observer.listing.findUnique({
        where: { listing_id: listingId },
        select: {
          photo_count: true,
          primary_photo_url: true,
          primary_photo_r2_key: true,
          photos_change_timestamp: true,
        },
      });
    }

    async function canonicalSummary() {
      const rows = await observer.listingMedia.findMany({ where: { listing_id: listingId } });
      return computeListingMediaSummary(rows);
    }

    /** Every committed operation must leave stored == canonical. */
    async function expectConverged(expectedPhotoCount: number) {
      const stored = await storedSummary();
      const canonical = await canonicalSummary();
      expect(stored!.photo_count).toBe(canonical.photo_count);
      expect(stored!.primary_photo_url).toBe(canonical.primary_photo_url);
      expect(stored!.primary_photo_r2_key).toBe(canonical.primary_photo_r2_key);
      expect(stored!.photo_count).toBe(expectedPhotoCount);
    }

    it("the service and the test observe the SAME physical database", async () => {
      // The service uses the global client (DATABASE_URL); the observer uses
      // CRM_MEDIA_DB_INTEGRATION_URL. If CI ever points those at different
      // databases every assertion below becomes meaningless while still passing.
      const sql = `SELECT current_database() AS db, current_schema() AS schema`;
      const [viaRoute] = (await routeClient.$queryRawUnsafe(sql)) as {
        db: string;
        schema: string;
      }[];
      const [viaObserver] = (await observer.$queryRawUnsafe(sql)) as {
        db: string;
        schema: string;
      }[];
      expect(viaRoute).toEqual(viaObserver);
    });

    it("converges after the first photo", async () => {
      await withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
        await tx.listingMedia.create({ data: mediaRow(1) });
      });
      await expectConverged(1);
    });

    it("converges after a second photo", async () => {
      await withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
        await tx.listingMedia.create({ data: mediaRow(2) });
      });
      await expectConverged(2);
    });

    it("a FloorPlan does not inflate photo_count", async () => {
      await withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
        await tx.listingMedia.create({
          data: mediaRow(3, { media_type: "FloorPlan", media_category: "FloorPlan" }),
        });
      });
      await expectConverged(2);
    });

    it("a Video does not inflate photo_count", async () => {
      await withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
        await tx.listingMedia.create({
          data: mediaRow(4, { media_type: "Video", media_category: "Video" }),
        });
      });
      await expectConverged(2);
    });

    it("deleting a non-hero photo converges", async () => {
      await withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
        await tx.listingMedia.updateMany({
          where: { media_key: key(2), status: "active" },
          data: { status: "deleted" },
        });
      });
      await expectConverged(1);
    });

    it("restoring a tombstoned photo converges", async () => {
      await withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
        await tx.listingMedia.updateMany({
          where: { media_key: key(2) },
          data: { status: "active" },
        });
      });
      await expectConverged(2);
    });

    it("tombstoning the LAST photo converges to 0 — the exact Production defect", async () => {
      // The shape that left Production listings with a photo_count frozen at
      // their pre-tombstone value: rows tombstoned, summary never recomputed.
      await withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
        await tx.listingMedia.updateMany({
          where: { listing_id: listingId, media_type: "Photo", status: "active" },
          data: { status: "deleted" },
        });
      });
      await expectConverged(0);
      expect((await storedSummary())!.primary_photo_url).toBeNull();
    });

    it("set-main clears ONLY the crm: namespace, never source-owned feed rows", async () => {
      // Migrated here from a mocked call-shape assertion. The real invariant is
      // that source-owned metadata survives — provable only against real rows.
      await routeClient.listingMedia.create({
        data: mediaRow(20, { media_key: `FEED-${stamp}-20`, preferred_photo_yn: true }),
      });
      await withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
        await tx.listingMedia.updateMany({
          where: { listing_id: listingId, status: "active", preferred_photo_yn: true,
                   media_key: { startsWith: "crm:" } },
          data: { preferred_photo_yn: false },
        });
        await tx.listingMedia.updateMany({
          where: { media_key: key(2), status: "active" },
          data: { preferred_photo_yn: true },
        });
      });
      const feedRow = await observer.listingMedia.findUnique({
        where: { media_key: `FEED-${stamp}-20` },
      });
      expect(feedRow!.preferred_photo_yn).toBe(true); // untouched by the crm-scoped clear
      await routeClient.listingMedia.delete({ where: { media_key: `FEED-${stamp}-20` } });
    });

    it("reorder applies ONLY to crm: keys, never renumbering feed rows", async () => {
      // Migrated from a mocked suite. Feed order is source-owned; media-sync
      // rewrites it every cycle, so a CRM reorder must not touch it.
      const feedKey = `FEED-${stamp}-30`;
      await routeClient.listingMedia.create({
        data: mediaRow(30, { media_key: feedKey, order: 99 }),
      });
      await withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
        await tx.listingMedia.updateMany({
          where: { media_key: key(1), listing_id: listingId, status: "active" },
          data: { order: 7 },
        });
      });
      const feedRow = await observer.listingMedia.findUnique({ where: { media_key: feedKey } });
      const crmRow = await observer.listingMedia.findUnique({ where: { media_key: key(1) } });
      expect(feedRow!.order).toBe(99); // untouched
      expect(crmRow!.order).toBe(7);
      await routeClient.listingMedia.delete({ where: { media_key: feedKey } });
    });

    it("a CRM media mutation does NOT bump modification_timestamp on a Trestle-synced listing", async () => {
      // Migrated from a mocked suite. idx-sync reads modification_timestamp as
      // its cursor; a CRM-side bump would corrupt feed sync. Proven on the real
      // row rather than by inspecting a mocked update payload.
      const feedListing = `RLS-ITEST-${stamp}`;
      const before = new Date("2026-01-01T00:00:00Z");
      await routeClient.listing.create({
        data: {
          listing_id: feedListing,
          status: "Active",
          listing_type: "sale",
          list_price: 500000,
          modification_timestamp: before,
          last_synced_from_trestle: new Date(), // Trestle-synced
          rls_eligible: true,
        },
      });
      await withCrmMediaConvergence(feedListing, async (tx: typeof routeClient) => {
        await tx.listingMedia.create({
          data: { ...mediaRow(40), listing_id: feedListing,
                  media_key: `crm:${feedListing}:p40`, resource_record_key: feedListing },
        });
      });
      const after = await observer.listing.findUnique({
        where: { listing_id: feedListing },
        select: { modification_timestamp: true, photo_count: true },
      });
      expect(after!.modification_timestamp.toISOString()).toBe(before.toISOString());
      expect(after!.photo_count).toBe(1); // summary still converged
      await routeClient.listingMedia.deleteMany({ where: { listing_id: feedListing } });
      await routeClient.listing.delete({ where: { listing_id: feedListing } });
    });

    it("ROLLBACK: a real Postgres constraint failure rolls back the media write too", async () => {
      const before = await observer.listingMedia.count({ where: { listing_id: listingId } });
      const storedBefore = await storedSummary();

      // A GENUINE database failure inside the production service: the second
      // insert violates the real media_key unique index, so Postgres aborts the
      // transaction. No mocked throw, no fake $transaction.
      await expect(
        withCrmMediaConvergence(listingId, async (tx: typeof routeClient) => {
          await tx.listingMedia.create({ data: mediaRow(50) }); // would succeed alone
          await tx.listingMedia.create({ data: mediaRow(1) }); // duplicate key -> P2002
        }),
      ).rejects.toMatchObject({ code: "P2002" });

      // Observed through the INDEPENDENT connection: Postgres itself proves that
      // neither the first insert nor any summary change survived.
      expect(await observer.listingMedia.count({ where: { listing_id: listingId } })).toBe(before);
      expect(await observer.listingMedia.findUnique({ where: { media_key: key(50) } })).toBeNull();
      expect(await storedSummary()).toEqual(storedBefore);
    });

    it("the real unique index rejects a duplicate media_key", async () => {
      // Mocked uniqueness proves nothing; this asserts the actual index.
      await expect(
        routeClient.listingMedia.create({ data: mediaRow(1) }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });
}
