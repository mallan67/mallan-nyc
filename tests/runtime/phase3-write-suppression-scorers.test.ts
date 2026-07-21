/// <reference types="jest" />
/**
 * Phase 3 write-suppression — recurring scorer/cache writers (failing-first TDD).
 *
 * Surfaces:
 *   - listing_momentum   (lib/listing-momentum/scorer.ts, daily cron)
 *   - social_proof_cache (lib/social-proof/cache.ts, cron)
 *   - demand_indices     (lib/demand-index/collector.ts, cron)
 *   - demand_signals     (same collector — the seller/demand-signal insert path)
 *
 * Timestamp semantics DEFINED by this phase (asserted behaviorally below):
 *   - `last_computed` on all three score/cache tables means "last MATERIAL
 *     result change", NOT "last calculation attempt". An unchanged computed
 *     result must NOT touch the row at all.
 *   - `demand_signals` rows have a deterministic logical identity
 *     (signal_type, neighborhood, source, UTC-day of period_end). Re-running
 *     the collector within the same identity window must RECONCILE (update
 *     the existing row when values/metadata changed, no-op when unchanged) —
 *     never insert a duplicate logical signal.
 *
 * The test pattern is double-run idempotency: run the batch once against an
 * empty store (writes flow), feed the captured writes back as the stored
 * state, run again with identical inputs → ZERO physical writes.
 */

// ── Shared prisma mock ───────────────────────────────────────────────────

const momentum = {
  findMany: jest.fn(),
  upsert: jest.fn(),
  update: jest.fn(),
};
const socialProof = {
  findUnique: jest.fn(),
  upsert: jest.fn(),
};
const demandSignal = {
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
const demandIndex = {
  findUnique: jest.fn(),
  upsert: jest.fn(),
};
const listing = {
  findMany: jest.fn(),
};
const behavioralEvent = { groupBy: jest.fn() };
const buyerIntentProfile = { findMany: jest.fn() };
const demandAlert = { findMany: jest.fn() };
const notification = { create: jest.fn() };
const showing = { count: jest.fn() };

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMomentum: {
      findMany: (a: unknown) => momentum.findMany(a),
      upsert: (a: unknown) => momentum.upsert(a),
      update: (a: unknown) => momentum.update(a),
    },
    socialProofCache: {
      findUnique: (a: unknown) => socialProof.findUnique(a),
      upsert: (a: unknown) => socialProof.upsert(a),
    },
    demandSignal: {
      findFirst: (a: unknown) => demandSignal.findFirst(a),
      create: (a: unknown) => demandSignal.create(a),
      update: (a: unknown) => demandSignal.update(a),
    },
    demandIndex: {
      findUnique: (a: unknown) => demandIndex.findUnique(a),
      upsert: (a: unknown) => demandIndex.upsert(a),
    },
    listing: { findMany: (a: unknown) => listing.findMany(a) },
    behavioralEvent: { groupBy: (a: unknown) => behavioralEvent.groupBy(a) },
    buyerIntentProfile: { findMany: (a: unknown) => buyerIntentProfile.findMany(a) },
    demandAlert: { findMany: (a: unknown) => demandAlert.findMany(a) },
    notification: { create: (a: unknown) => notification.create(a) },
    showing: { count: (a: unknown) => showing.count(a) },
  },
}));

const eventCounts = jest.fn();
const uniqueSessions = jest.fn();
jest.mock("@/lib/behavioral/events", () => ({
  __esModule: true,
  getListingEventCounts: (id: string, days: number) => eventCounts(id, days),
  getListingUniqueSessions: (id: string, days: number) => uniqueSessions(id, days),
}));

jest.mock("@/lib/soda", () => ({
  __esModule: true,
  soda: jest.fn(async () => []),
  getSocrataToken: () => null, // no SODA permits in these tests
}));

import { batchComputeMomentum } from "@/lib/listing-momentum/scorer";
import { batchComputeSocialProof } from "@/lib/social-proof/cache";
import { batchComputeDemandIndex } from "@/lib/demand-index/collector";

beforeEach(() => {
  jest.clearAllMocks();
});

// ── listing_momentum ─────────────────────────────────────────────────────

describe("batchComputeMomentum — write-on-change only", () => {
  function wireEvents() {
    eventCounts.mockImplementation(async (id: string) =>
      id === "L1"
        ? { favorite_add: 3, inquiry_submit: 1, showing_request: 1, photo_dwell: 300, building_deep_dive: 2 }
        : { favorite_add: 1, inquiry_submit: 0, showing_request: 0, photo_dwell: 100, building_deep_dive: 1 },
    );
    uniqueSessions.mockImplementation(async (id: string) => (id === "L1" ? 21 : 7));
    listing.findMany.mockResolvedValue([{ listing_id: "L1" }, { listing_id: "L2" }]);
  }

  it("run 1 (empty store) writes; run 2 (same inputs) performs ZERO writes", async () => {
    wireEvents();

    // Run 1 — nothing stored yet.
    momentum.findMany.mockResolvedValue([]);
    momentum.upsert.mockResolvedValue({});
    momentum.update.mockResolvedValue({});
    const first = await batchComputeMomentum(10);
    expect(first.processed).toBe(2);
    expect(momentum.upsert).toHaveBeenCalledTimes(2);
    // Percentile pass writes both rows on first run (defaults differ).
    const storedRows: Array<Record<string, unknown>> = momentum.upsert.mock.calls.map((c) => {
      const args = c[0] as { create: Record<string, unknown> };
      return { ...args.create, percentile_rank: 50 };
    });
    const percentileWrites = momentum.update.mock.calls.map((c) => {
      const args = c[0] as { where: { listing_id: string }; data: { percentile_rank: number } };
      return args;
    });
    for (const w of percentileWrites) {
      const row = storedRows.find((r) => r.listing_id === w.where.listing_id);
      if (row) row.percentile_rank = w.data.percentile_rank;
    }

    // Run 2 — feed the captured state back; identical inputs.
    jest.clearAllMocks();
    wireEvents();
    momentum.findMany.mockResolvedValue(storedRows);
    momentum.upsert.mockResolvedValue({});
    momentum.update.mockResolvedValue({});

    const second = await batchComputeMomentum(10);
    expect(second.processed).toBe(2);
    expect(momentum.upsert).not.toHaveBeenCalled();
    expect(momentum.update).not.toHaveBeenCalled();
    expect(second.write_paths.momentum.rows_suppressed_unchanged).toBe(2);
    expect(second.write_paths.momentum.rows_updated).toBe(0);
    expect(second.write_paths.momentum.rows_inserted).toBe(0);
  });

  it("a changed behavioral input updates ONLY the affected row", async () => {
    wireEvents();
    momentum.findMany.mockResolvedValue([]);
    momentum.upsert.mockResolvedValue({});
    momentum.update.mockResolvedValue({});
    await batchComputeMomentum(10);
    const storedRows: Array<Record<string, unknown>> = momentum.upsert.mock.calls.map((c) => {
      const args = c[0] as { create: Record<string, unknown> };
      return { ...args.create, percentile_rank: 50 };
    });
    for (const c of momentum.update.mock.calls) {
      const args = c[0] as { where: { listing_id: string }; data: { percentile_rank: number } };
      const row = storedRows.find((r) => r.listing_id === args.where.listing_id);
      if (row) row.percentile_rank = args.data.percentile_rank;
    }

    jest.clearAllMocks();
    wireEvents();
    // L2 gains inquiries → its score changes; L1 unchanged.
    eventCounts.mockImplementation(async (id: string) =>
      id === "L1"
        ? { favorite_add: 3, inquiry_submit: 1, showing_request: 1, photo_dwell: 300, building_deep_dive: 2 }
        : { favorite_add: 1, inquiry_submit: 3, showing_request: 1, photo_dwell: 100, building_deep_dive: 1 },
    );
    momentum.findMany.mockResolvedValue(storedRows);
    momentum.upsert.mockResolvedValue({});
    momentum.update.mockResolvedValue({});

    const result = await batchComputeMomentum(10);
    expect(momentum.upsert).toHaveBeenCalledTimes(1);
    expect((momentum.upsert.mock.calls[0][0] as { where: { listing_id: string } }).where.listing_id).toBe("L2");
    expect(result.write_paths.momentum.rows_suppressed_unchanged).toBe(1);
    expect(result.write_paths.momentum.rows_updated).toBe(1);
  });
});

// ── social_proof_cache ───────────────────────────────────────────────────

describe("batchComputeSocialProof — write-on-change only", () => {
  function wire() {
    eventCounts.mockResolvedValue({ favorite_add: 2 });
    uniqueSessions.mockResolvedValue(14);
    showing.count.mockResolvedValue(1);
    listing.findMany.mockResolvedValue([
      { id: BigInt(1), listing_id: "L1", neighborhood: null },
    ]);
  }

  it("unchanged computed values → ZERO socialProofCache writes", async () => {
    wire();
    socialProof.findUnique.mockResolvedValue(null);
    socialProof.upsert.mockResolvedValue({});
    const first = await batchComputeSocialProof(10);
    expect(first.processed).toBe(1);
    expect(socialProof.upsert).toHaveBeenCalledTimes(1);
    const created = (socialProof.upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;

    jest.clearAllMocks();
    wire();
    socialProof.findUnique.mockResolvedValue({ ...created, last_computed: new Date("2026-07-19T00:00:00Z") });
    socialProof.upsert.mockResolvedValue({});

    const second = await batchComputeSocialProof(10);
    expect(second.processed).toBe(1);
    expect(socialProof.upsert).not.toHaveBeenCalled();
    expect(second.write_paths.social_proof.rows_suppressed_unchanged).toBe(1);
  });

  it("a changed demand input writes the row", async () => {
    wire();
    socialProof.findUnique.mockResolvedValue({
      listing_id: "L1",
      view_count_7d: 2, // stored differs from computed 14
      save_count: 2,
      showings_this_week: 1,
      similar_sold_speed: null,
      demand_level: "low",
      last_computed: new Date("2026-07-19T00:00:00Z"),
    });
    socialProof.upsert.mockResolvedValue({});
    const result = await batchComputeSocialProof(10);
    expect(socialProof.upsert).toHaveBeenCalledTimes(1);
    expect(result.write_paths.social_proof.rows_updated).toBe(1);
  });
});

// ── demand_indices + demand_signals (seller-signal reconciliation) ───────

describe("batchComputeDemandIndex — index write-on-change + signal reconciliation", () => {
  function wire() {
    behavioralEvent.groupBy.mockResolvedValue([{ listing_id: "L1", _count: 12 }]);
    listing.findMany.mockImplementation(async (args: unknown) => {
      const a = args as { distinct?: unknown };
      if (a && a.distinct) return [{ neighborhood: "Yorkville" }];
      return [{ listing_id: "L1", neighborhood: "Yorkville" }];
    });
    buyerIntentProfile.findMany.mockResolvedValue([
      { preferred_neighborhoods: ["Yorkville"] },
    ]);
    demandAlert.findMany.mockResolvedValue([]);
  }

  it("same-day re-run with identical inputs → NO duplicate signal insert, NO index write", async () => {
    wire();

    // Run 1 — empty store.
    demandSignal.findFirst.mockResolvedValue(null);
    demandSignal.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({
      id: BigInt(1),
      ...a.data,
      collected_at: new Date(),
    }));
    demandIndex.findUnique.mockResolvedValue(null);
    demandIndex.upsert.mockImplementation(async (a: { create: Record<string, unknown> }) => ({
      id: BigInt(9),
      ...a.create,
    }));
    const first = await batchComputeDemandIndex();
    expect(first.neighborhoods).toBe(1);
    expect(demandSignal.create).toHaveBeenCalledTimes(1);
    expect(demandIndex.upsert).toHaveBeenCalledTimes(1);
    const storedSignal = await demandSignal.create.mock.results[0].value;
    const storedIndex = await demandIndex.upsert.mock.results[0].value;

    // Run 2 — same UTC day, identical inputs.
    jest.clearAllMocks();
    wire();
    demandSignal.findFirst.mockResolvedValue(storedSignal);
    demandSignal.create.mockResolvedValue({});
    demandSignal.update.mockResolvedValue({});
    demandIndex.findUnique.mockResolvedValue(storedIndex);
    demandIndex.upsert.mockResolvedValue(storedIndex);

    const second = await batchComputeDemandIndex();
    expect(second.neighborhoods).toBe(1);
    // Seller-signal reconciliation: no duplicate logical signal.
    expect(demandSignal.create).not.toHaveBeenCalled();
    expect(demandSignal.update).not.toHaveBeenCalled();
    // Index result unchanged → zero index writes.
    expect(demandIndex.upsert).not.toHaveBeenCalled();
    expect(second.write_paths.demand_signals.rows_suppressed_unchanged).toBe(1);
    expect(second.write_paths.demand_indices.rows_suppressed_unchanged).toBe(1);
  });

  it("same-day re-run with CHANGED values → reconciles the existing signal (update, not insert)", async () => {
    wire();
    // Stored signal from earlier today with different values.
    demandSignal.findFirst.mockResolvedValue({
      id: BigInt(1),
      signal_type: "composite",
      neighborhood: "Yorkville",
      source: "first_party",
      value: 5,
      normalized: 40,
      metadata: { searches: 4, intents: 1, permits: 0 },
      period_start: new Date(Date.now() - 30 * 86400_000),
      period_end: new Date(Date.now() - 3600_000),
      collected_at: new Date(Date.now() - 3600_000),
    });
    demandSignal.update.mockResolvedValue({});
    demandSignal.create.mockResolvedValue({});
    demandIndex.findUnique.mockResolvedValue(null);
    demandIndex.upsert.mockImplementation(async (a: { create: Record<string, unknown> }) => ({
      id: BigInt(9),
      ...a.create,
    }));

    const result = await batchComputeDemandIndex();
    expect(demandSignal.create).not.toHaveBeenCalled();
    expect(demandSignal.update).toHaveBeenCalledTimes(1);
    const upd = demandSignal.update.mock.calls[0][0] as {
      where: { id: bigint };
      data: Record<string, unknown>;
    };
    expect(upd.where.id).toBe(BigInt(1));
    // Provenance is preserved on reconcile: identity fields are not rewritten.
    expect(upd.data.signal_type).toBeUndefined();
    expect(upd.data.neighborhood).toBeUndefined();
    expect(upd.data.source).toBeUndefined();
    expect(result.write_paths.demand_signals.rows_updated).toBe(1);
  });

  it("a PRIOR-day signal does not capture today's run (new period bucket → insert)", async () => {
    wire();
    // findFirst models the identity-window query: the collector must scope it
    // to TODAY's bucket, so we assert the where clause it passes.
    demandSignal.findFirst.mockImplementation(async (args: unknown) => {
      const where = (args as { where: Record<string, unknown> }).where;
      expect(where.signal_type).toBe("composite");
      expect(where.neighborhood).toBe("Yorkville");
      expect(where.source).toBe("first_party");
      expect(where.period_end).toBeDefined(); // day-bucket range
      return null; // nothing in today's bucket
    });
    demandSignal.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({
      id: BigInt(2),
      ...a.data,
    }));
    demandIndex.findUnique.mockResolvedValue(null);
    demandIndex.upsert.mockImplementation(async (a: { create: Record<string, unknown> }) => ({
      id: BigInt(9),
      ...a.create,
    }));

    const result = await batchComputeDemandIndex();
    expect(demandSignal.create).toHaveBeenCalledTimes(1);
    expect(result.write_paths.demand_signals.rows_inserted).toBe(1);
  });
});
