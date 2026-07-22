/// <reference types="jest" />
/**
 * Phase 3 write-suppression — recurring scorer/cache writers (failing-first TDD).
 *
 * Surfaces:
 *   - listing_momentum       (lib/listing-momentum/scorer.ts, daily cron)
 *   - social_proof_cache     (lib/social-proof/cache.ts, daily cron)
 *   - demand_indices         (lib/demand-index/collector.ts, daily cron)
 *   - demand_signals         (same collector — seller/demand-signal reconciliation)
 *   - conviction_scores      (lib/conviction/scorer.ts, daily cron)
 *   - buyer_intent_profiles  (lib/buyer-intent/profiler.ts, daily cron)
 *   - agent_metrics + agent_performance_index (lib/agent-performance/indexer.ts, weekly cron)
 *   - readiness_signals      (lib/seller-readiness/scorer.ts, daily cron — set-level reconcile)
 *
 * Timestamp semantics DEFINED by this phase (asserted behaviorally below):
 *   - `last_computed` on score/cache tables means "last MATERIAL result
 *     change", NOT "last calculation attempt". An unchanged computed result
 *     must NOT touch the row at all.
 *   - `lead_scores.last_computed` and `seller_leads.last_scored_at` are the
 *     EXCEPTIONS: they are staleness CURSORS (attempt-time semantics,
 *     documented in code) because their batch queries rotate on them.
 *   - `demand_signals` rows have a deterministic logical identity
 *     (signal_type, neighborhood, source, UTC-day of period_end). Re-running
 *     the collector within the same identity window must RECONCILE — update
 *     the canonical (earliest) row when values changed, no-op when unchanged,
 *     NEVER insert a duplicate logical signal, and NEVER silently delete
 *     pre-existing duplicates (they are only counted/reported).
 *   - Overlapping-run insert races are serialized through a pg advisory
 *     transaction lock keyed on the logical identity (asserted below). The
 *     DURABLE guarantee still requires a DB unique constraint — reported to
 *     Maya, NOT applied here (migrations are held).
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
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
const demandIndex = {
  findUnique: jest.fn(),
  upsert: jest.fn(),
};
const convictionScore = {
  findMany: jest.fn(),
  upsert: jest.fn(),
};
const buyerIntentProfile = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  upsert: jest.fn(),
};
const agentMetrics = {
  findMany: jest.fn(),
  upsert: jest.fn(),
};
const agentPerformanceIndex = {
  findUnique: jest.fn(),
  upsert: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
};
const sellerLead = {
  findUniqueOrThrow: jest.fn(),
  update: jest.fn(),
};
const readinessSignal = {
  findMany: jest.fn(),
  deleteMany: jest.fn(),
  create: jest.fn(),
};
const listing = { findMany: jest.fn() };
const agent = { findMany: jest.fn() };
const lead = { findUnique: jest.fn() };
const intentEvent = { findMany: jest.fn() };
const behavioralEvent = { groupBy: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() };
const demandAlert = { findMany: jest.fn() };
const notification = { create: jest.fn() };
const showing = { count: jest.fn() };

// Advisory-lock capture: every $executeRaw issued INSIDE a transaction.
const txExecuteRaw = jest.fn<Promise<number>, unknown[]>(async () => 0);

// The tx client handed to interactive $transaction callbacks. It shares the
// demandSignal mocks so assertions cover the transactional path.
const txClient = {
  $executeRaw: (...args: unknown[]) => txExecuteRaw(...(args as [])),
  demandSignal: {
    findMany: (a: unknown) => demandSignal.findMany(a),
    create: (a: unknown) => demandSignal.create(a),
    update: (a: unknown) => demandSignal.update(a),
  },
};

// Interactive transactions are SERIALIZED (models the advisory xact lock:
// two overlapping runs cannot interleave the findMany→create window).
let txQueue: Promise<unknown> = Promise.resolve();
function runSerializedTx<T>(fn: (tx: typeof txClient) => Promise<T>): Promise<T> {
  const next = txQueue.then(() => fn(txClient));
  txQueue = next.catch(() => undefined);
  return next;
}

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
      findMany: (a: unknown) => demandSignal.findMany(a),
      create: (a: unknown) => demandSignal.create(a),
      update: (a: unknown) => demandSignal.update(a),
    },
    demandIndex: {
      findUnique: (a: unknown) => demandIndex.findUnique(a),
      upsert: (a: unknown) => demandIndex.upsert(a),
    },
    convictionScore: {
      findMany: (a: unknown) => convictionScore.findMany(a),
      upsert: (a: unknown) => convictionScore.upsert(a),
    },
    buyerIntentProfile: {
      findMany: (a: unknown) => buyerIntentProfile.findMany(a),
      findUnique: (a: unknown) => buyerIntentProfile.findUnique(a),
      upsert: (a: unknown) => buyerIntentProfile.upsert(a),
    },
    agentMetrics: {
      findMany: (a: unknown) => agentMetrics.findMany(a),
      upsert: (a: unknown) => agentMetrics.upsert(a),
    },
    agentPerformanceIndex: {
      findUnique: (a: unknown) => agentPerformanceIndex.findUnique(a),
      upsert: (a: unknown) => agentPerformanceIndex.upsert(a),
      findMany: (a: unknown) => agentPerformanceIndex.findMany(a),
      update: (a: unknown) => agentPerformanceIndex.update(a),
    },
    sellerLead: {
      findUniqueOrThrow: (a: unknown) => sellerLead.findUniqueOrThrow(a),
      update: (a: unknown) => sellerLead.update(a),
    },
    readinessSignal: {
      findMany: (a: unknown) => readinessSignal.findMany(a),
      deleteMany: (a: unknown) => readinessSignal.deleteMany(a),
      create: (a: unknown) => readinessSignal.create(a),
    },
    listing: { findMany: (a: unknown) => listing.findMany(a) },
    agent: { findMany: (a: unknown) => agent.findMany(a) },
    lead: { findUnique: (a: unknown) => lead.findUnique(a) },
    intentEvent: { findMany: (a: unknown) => intentEvent.findMany(a) },
    behavioralEvent: {
      groupBy: (a: unknown) => behavioralEvent.groupBy(a),
      findFirst: (a: unknown) => behavioralEvent.findFirst(a),
      findMany: (a: unknown) => behavioralEvent.findMany(a),
    },
    demandAlert: { findMany: (a: unknown) => demandAlert.findMany(a) },
    notification: { create: (a: unknown) => notification.create(a) },
    showing: { count: (a: unknown) => showing.count(a) },
    $transaction: (arg: unknown) => {
      if (typeof arg === "function") {
        return runSerializedTx(arg as (tx: typeof txClient) => Promise<unknown>);
      }
      // Array form (seller-readiness scorer): the promises are already in flight.
      return Promise.all(arg as Promise<unknown>[]);
    },
  },
}));

const eventCounts = jest.fn();
const uniqueSessions = jest.fn();
const leadEventCounts = jest.fn();
const leadTopListings = jest.fn();
jest.mock("@/lib/behavioral/events", () => ({
  __esModule: true,
  getListingEventCounts: (id: string, days: number) => eventCounts(id, days),
  getListingUniqueSessions: (id: string, days: number) => uniqueSessions(id, days),
  getLeadEventCounts: (id: bigint, days: number) => leadEventCounts(id, days),
  getLeadTopListings: (id: bigint, n: number) => leadTopListings(id, n),
}));

jest.mock("@/lib/soda", () => ({
  __esModule: true,
  soda: jest.fn(async () => []),
  getSocrataToken: () => null, // no SODA permits in these tests
}));

// Agent-performance: stub ONLY the DB-heavy monthly metrics computation;
// normalization stays real so index math is production code.
const computeMonthlyMetricsMock = jest.fn();
jest.mock("@/lib/agent-performance/calculator", () => {
  const actual = jest.requireActual("@/lib/agent-performance/calculator");
  return {
    __esModule: true,
    ...actual,
    computeMonthlyMetrics: (agentId: bigint, month: Date) => computeMonthlyMetricsMock(agentId, month),
  };
});

// Seller-readiness: stub the public-data collectors (network/DB heavy).
const acrisSignals = jest.fn();
jest.mock("@/lib/seller-readiness/signals/acris", () => ({
  __esModule: true,
  collectAcrisSignals: (bbl: string) => acrisSignals(bbl),
}));
jest.mock("@/lib/seller-readiness/signals/dob", () => ({
  __esModule: true,
  collectDobSignals: jest.fn(async () => []),
}));
const dofSignals = jest.fn(async (_bbl: string): Promise<unknown[]> => []);
jest.mock("@/lib/seller-readiness/signals/dof-tax", () => ({
  __esModule: true,
  collectDofSignals: (bbl: string) => dofSignals(bbl),
}));
jest.mock("@/lib/seller-readiness/signals/first-party", () => ({
  __esModule: true,
  collectFirstPartySignals: jest.fn(async () => []),
}));

import { batchComputeMomentum } from "@/lib/listing-momentum/scorer";
import { batchComputeSocialProof } from "@/lib/social-proof/cache";
import { batchComputeDemandIndex } from "@/lib/demand-index/collector";
import { batchComputeConvictionScores } from "@/lib/conviction/scorer";
import { computeIntentProfile } from "@/lib/buyer-intent/profiler";
import { batchReindex } from "@/lib/agent-performance/indexer";
import { scoreSellerLead } from "@/lib/seller-readiness/scorer";

beforeEach(() => {
  jest.clearAllMocks();
  txQueue = Promise.resolve();
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
    demandSignal.findMany.mockResolvedValue([]);
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
    demandSignal.findMany.mockResolvedValue([storedSignal]);
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
    demandSignal.findMany.mockResolvedValue([
      {
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
      },
    ]);
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
    // findMany models the identity-window query: the collector must scope it
    // to TODAY's bucket, so we assert the where clause it passes.
    demandSignal.findMany.mockImplementation(async (args: unknown) => {
      const where = (args as { where: Record<string, unknown> }).where;
      expect(where.signal_type).toBe("composite");
      expect(where.neighborhood).toBe("Yorkville");
      expect(where.source).toBe("first_party");
      expect(where.period_end).toBeDefined(); // day-bucket range
      return []; // nothing in today's bucket
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

  // ── Correction 5: collision-safety + pre-existing duplicates ──

  it("reconciliation runs inside a serialized advisory-lock transaction", async () => {
    wire();
    demandSignal.findMany.mockResolvedValue([]);
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

    await batchComputeDemandIndex();

    // The advisory xact lock must be requested inside the transaction.
    expect(txExecuteRaw).toHaveBeenCalled();
    const lockSql = txExecuteRaw.mock.calls
      .map((c) => (Array.isArray(c[0]) ? (c[0] as unknown as string[]).join("?") : String(c[0])))
      .join("\n");
    expect(lockSql).toContain("pg_advisory_xact_lock");
  });

  it("two OVERLAPPING runs create exactly ONE signal (second reconciles/suppresses)", async () => {
    wire();
    // Stateful store shared by both runs; the serialized $transaction models
    // the advisory lock, so the second run's findMany sees the first's create.
    const store: Record<string, unknown>[] = [];
    demandSignal.findMany.mockImplementation(async () => [...store]);
    demandSignal.create.mockImplementation(async (a: { data: Record<string, unknown> }) => {
      const row = { id: BigInt(store.length + 1), ...a.data, collected_at: new Date() };
      store.push(row);
      return row;
    });
    demandSignal.update.mockResolvedValue({});
    demandIndex.findUnique.mockResolvedValue(null);
    demandIndex.upsert.mockImplementation(async (a: { create: Record<string, unknown> }) => ({
      id: BigInt(9),
      ...a.create,
    }));

    const [r1, r2] = await Promise.all([batchComputeDemandIndex(), batchComputeDemandIndex()]);

    expect(demandSignal.create).toHaveBeenCalledTimes(1);
    expect(demandSignal.update).not.toHaveBeenCalled();
    const inserted = r1.write_paths.demand_signals.rows_inserted + r2.write_paths.demand_signals.rows_inserted;
    const suppressed =
      r1.write_paths.demand_signals.rows_suppressed_unchanged + r2.write_paths.demand_signals.rows_suppressed_unchanged;
    expect(inserted).toBe(1);
    expect(suppressed).toBe(1);
  });

  it("pre-existing duplicates: reconciles the EARLIEST row, deletes nothing, reports the extras", async () => {
    wire();
    const earliest = {
      id: BigInt(1),
      value: 5,
      normalized: 40,
      metadata: { searches: 4, intents: 1, permits: 0 },
      collected_at: new Date(Date.now() - 7200_000),
    };
    const duplicate = {
      id: BigInt(2),
      value: 6,
      normalized: 44,
      metadata: { searches: 5, intents: 1, permits: 0 },
      collected_at: new Date(Date.now() - 3600_000),
    };
    demandSignal.findMany.mockResolvedValue([earliest, duplicate]); // collected_at ASC
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
    expect((demandSignal.update.mock.calls[0][0] as { where: { id: bigint } }).where.id).toBe(BigInt(1));
    // NO deletion of the duplicate — it is only detected + reported.
    expect(result.duplicate_signal_rows_detected).toBe(1);
  });
});

// ── conviction_scores ────────────────────────────────────────────────────

describe("batchComputeConvictionScores — write-on-change only", () => {
  const LEAD = BigInt(11);
  function wire() {
    behavioralEvent.findMany.mockResolvedValue([{ lead_id: LEAD }]);
    behavioralEvent.findFirst.mockResolvedValue({ recorded_at: new Date(Date.now() - 5 * 86400_000 - 3600_000) });
    behavioralEvent.groupBy.mockResolvedValue([]); // no repeated views
    leadEventCounts.mockResolvedValue({ share: 1, inquiry_submit: 1 });
    leadTopListings.mockResolvedValue([{ listingId: "L1", eventCount: 4 }]);
  }

  it("unchanged computed result → ZERO convictionScore writes", async () => {
    wire();
    convictionScore.findMany.mockResolvedValue([]);
    convictionScore.upsert.mockResolvedValue({});
    const first = await batchComputeConvictionScores();
    expect(first.updated).toBe(1);
    expect(convictionScore.upsert).toHaveBeenCalledTimes(1);
    const created = (convictionScore.upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;

    jest.clearAllMocks();
    wire();
    convictionScore.findMany.mockResolvedValue([{ ...created }]);
    convictionScore.upsert.mockResolvedValue({});

    const second = await batchComputeConvictionScores();
    expect(convictionScore.upsert).not.toHaveBeenCalled();
    expect(second.updated).toBe(0);
    expect(second.write_paths.conviction.rows_suppressed_unchanged).toBe(1);
  });

  it("a changed milestone writes the row", async () => {
    wire();
    convictionScore.findMany.mockResolvedValue([]);
    convictionScore.upsert.mockResolvedValue({});
    await batchComputeConvictionScores();
    const created = (convictionScore.upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;

    jest.clearAllMocks();
    wire();
    leadEventCounts.mockResolvedValue({ share: 1, inquiry_submit: 1, showing_request: 2 }); // new milestone
    convictionScore.findMany.mockResolvedValue([{ ...created }]);
    convictionScore.upsert.mockResolvedValue({});

    const result = await batchComputeConvictionScores();
    expect(convictionScore.upsert).toHaveBeenCalledTimes(1);
    expect(result.write_paths.conviction.rows_updated).toBe(1);
  });
});

// ── buyer_intent_profiles ────────────────────────────────────────────────

describe("computeIntentProfile — write-on-change only", () => {
  const LEAD = BigInt(21);
  function wire() {
    intentEvent.findMany.mockResolvedValue([
      {
        event_type: "listing_view",
        recorded_at: new Date("2026-07-20T12:00:00Z"),
        payload: { neighborhood: "Yorkville", property_type: "Condominium", beds: 2, listing_type: "sale" },
      },
    ]);
    lead.findUnique.mockResolvedValue({ preferences: null, roles: ["buyer"] });
  }

  it("unchanged profile → ZERO buyerIntentProfile writes", async () => {
    wire();
    buyerIntentProfile.findUnique.mockResolvedValue(null);
    buyerIntentProfile.upsert.mockResolvedValue({});
    await computeIntentProfile(LEAD);
    expect(buyerIntentProfile.upsert).toHaveBeenCalledTimes(1);
    const created = (buyerIntentProfile.upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;

    jest.clearAllMocks();
    wire();
    buyerIntentProfile.findUnique.mockResolvedValue({ ...created });
    buyerIntentProfile.upsert.mockResolvedValue({});

    await computeIntentProfile(LEAD);
    expect(buyerIntentProfile.upsert).not.toHaveBeenCalled();
  });

  it("a new event changes the profile → writes", async () => {
    wire();
    buyerIntentProfile.findUnique.mockResolvedValue(null);
    buyerIntentProfile.upsert.mockResolvedValue({});
    await computeIntentProfile(LEAD);
    const created = (buyerIntentProfile.upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;

    jest.clearAllMocks();
    wire();
    intentEvent.findMany.mockResolvedValue([
      {
        event_type: "listing_view",
        recorded_at: new Date("2026-07-21T09:00:00Z"),
        payload: { neighborhood: "Tribeca", listing_type: "sale" },
      },
      {
        event_type: "listing_view",
        recorded_at: new Date("2026-07-20T12:00:00Z"),
        payload: { neighborhood: "Yorkville", property_type: "Condominium", beds: 2, listing_type: "sale" },
      },
    ]);
    buyerIntentProfile.findUnique.mockResolvedValue({ ...created });
    buyerIntentProfile.upsert.mockResolvedValue({});

    await computeIntentProfile(LEAD);
    expect(buyerIntentProfile.upsert).toHaveBeenCalledTimes(1);
  });
});

// ── agent_metrics + agent_performance_index ──────────────────────────────

describe("batchReindex — write-on-change for monthly metrics, index, and rank", () => {
  const AGENT = BigInt(31);
  const METRICS = {
    time_to_contact_avg: 2.5,
    showings_to_offer_ratio: 0.4,
    closing_cadence_days: 30,
    compliance_score: 95,
    response_rate: 90,
    deal_volume: 3,
  };

  function wire() {
    agent.findMany.mockResolvedValue([{ id: AGENT }]);
    computeMonthlyMetricsMock.mockResolvedValue({ ...METRICS });
  }

  it("run 1 writes; run 2 (same metrics) performs ZERO writes", async () => {
    wire();
    agentMetrics.findMany.mockResolvedValue([]);
    agentMetrics.upsert.mockResolvedValue({});
    agentPerformanceIndex.findUnique.mockResolvedValue(null);
    agentPerformanceIndex.upsert.mockResolvedValue({});
    agentPerformanceIndex.update.mockResolvedValue({});
    agentPerformanceIndex.findMany.mockResolvedValue([{ id: BigInt(77), rank: null }]);

    const first = await batchReindex();
    expect(first.computed).toBe(1);
    const monthWrites = agentMetrics.upsert.mock.calls.map((c) => {
      const args = c[0] as { where: { agent_id_month: { month: Date } }; create: { metrics: unknown } };
      return { agent_id: AGENT, month: args.where.agent_id_month.month, metrics: args.create.metrics };
    });
    expect(monthWrites.length).toBeGreaterThan(0);
    const indexCreate = (agentPerformanceIndex.upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;
    // Rank pass wrote rank 1 on first run.
    expect(agentPerformanceIndex.update).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    wire();
    agentMetrics.findMany.mockResolvedValue(monthWrites);
    agentPerformanceIndex.findUnique.mockResolvedValue({ ...indexCreate });
    agentPerformanceIndex.upsert.mockResolvedValue({});
    agentPerformanceIndex.update.mockResolvedValue({});
    agentPerformanceIndex.findMany.mockResolvedValue([{ id: BigInt(77), rank: 1 }]);

    const second = await batchReindex();
    expect(second.computed).toBe(1);
    expect(agentMetrics.upsert).not.toHaveBeenCalled();
    expect(agentPerformanceIndex.upsert).not.toHaveBeenCalled();
    expect(agentPerformanceIndex.update).not.toHaveBeenCalled();
    expect(second.write_paths.agent_metrics.rows_suppressed_unchanged).toBeGreaterThan(0);
    expect(second.write_paths.performance_index.rows_suppressed_unchanged).toBe(1);
    expect(second.write_paths.rank.rows_suppressed_unchanged).toBe(1);
  });
});

// ── readiness_signals (seller-readiness set-level reconcile) ─────────────

describe("scoreSellerLead — signal set reconcile (no delete+recreate when unchanged)", () => {
  const LEAD = BigInt(41);
  const SIGNALS = [
    { signal_type: "ownership_duration", raw_value: 12, normalized: 0.8, source: "acris", metadata: null },
    { signal_type: "equity_position", raw_value: 0.6, normalized: 0.6, source: "acris", metadata: { ltv: 0.4 } },
  ];

  function wire() {
    sellerLead.findUniqueOrThrow.mockResolvedValue({ id: LEAD, bbl: "1000010001", bin: null });
    acrisSignals.mockResolvedValue(SIGNALS.map((s) => ({ ...s })));
    sellerLead.update.mockResolvedValue({});
    readinessSignal.deleteMany.mockResolvedValue({ count: 2 });
    readinessSignal.create.mockResolvedValue({});
  }

  it("unchanged signal set → NO deleteMany, NO creates (lead cursor still advances)", async () => {
    wire();
    readinessSignal.findMany.mockResolvedValue(SIGNALS.map((s) => ({ ...s })));

    await scoreSellerLead(LEAD);

    expect(readinessSignal.deleteMany).not.toHaveBeenCalled();
    expect(readinessSignal.create).not.toHaveBeenCalled();
    // last_scored_at is a staleness CURSOR (attempt-time) — must still advance.
    expect(sellerLead.update).toHaveBeenCalledTimes(1);
  });

  it("changed signal set → existing delete+recreate semantics preserved", async () => {
    wire();
    readinessSignal.findMany.mockResolvedValue([
      { signal_type: "ownership_duration", raw_value: 10, normalized: 0.7, source: "acris", metadata: null },
    ]);

    await scoreSellerLead(LEAD);

    expect(readinessSignal.deleteMany).toHaveBeenCalledTimes(1);
    expect(readinessSignal.create).toHaveBeenCalledTimes(2);
    expect(sellerLead.update).toHaveBeenCalledTimes(1);
  });

  // ── Codex post-merge review: DOF signals must be in BOTH reconcile scopes ──
  const DOF_SIGNAL = { signal_type: "tax_burden", raw_value: 0.3, normalized: 0.3, source: "dof", metadata: null };

  it("read + delete scopes cover EVERY persisted non-first_party source (not an acris/dob enumeration)", async () => {
    wire();
    dofSignals.mockResolvedValueOnce([{ ...DOF_SIGNAL }]);
    readinessSignal.findMany.mockResolvedValue([...SIGNALS, DOF_SIGNAL].map((s) => ({ ...s })));

    await scoreSellerLead(LEAD);

    // The stored-set READ must select the exact complement of the persistable
    // filter (source !== first_party) — never an acris/dob-only enumeration
    // that silently drops DOF (and any future source).
    const readWhere = readinessSignal.findMany.mock.calls[0][0].where;
    expect(readWhere.source).toEqual({ not: "first_party" });
  });

  it("stored set INCLUDING dof that matches the persistable set → zero writes (no dof accumulation)", async () => {
    wire();
    dofSignals.mockResolvedValueOnce([{ ...DOF_SIGNAL }]);
    // Behavioral: the mock HONOURS the where filter over a stored table that
    // contains acris + dof rows — pre-fix the acris/dob-only read hides the
    // stored dof row, the sets compare unequal, and delete+recreate fires
    // (re-inserting dof forever: 33 rows / 1 logical observed in production).
    const storedTable = [...SIGNALS, DOF_SIGNAL].map((s) => ({ ...s }));
    readinessSignal.findMany.mockImplementation(async (args: { where: { source: Record<string, unknown> } }) => {
      const src = args.where.source as { in?: string[]; not?: string };
      return storedTable.filter((r) => (src.in ? src.in.includes(r.source) : r.source !== src.not));
    });

    await scoreSellerLead(LEAD);

    expect(readinessSignal.deleteMany).not.toHaveBeenCalled();
    expect(readinessSignal.create).not.toHaveBeenCalled();
  });

  it("changed set: the DELETE scope also covers dof (replace cannot orphan/duplicate dof rows)", async () => {
    wire();
    dofSignals.mockResolvedValueOnce([{ ...DOF_SIGNAL }]);
    readinessSignal.findMany.mockResolvedValue([]); // nothing stored → replace fires

    await scoreSellerLead(LEAD);

    const delWhere = readinessSignal.deleteMany.mock.calls[0][0].where;
    expect(delWhere.source).toEqual({ not: "first_party" });
    expect(readinessSignal.create).toHaveBeenCalledTimes(3); // acris x2 + dof x1
  });
});
