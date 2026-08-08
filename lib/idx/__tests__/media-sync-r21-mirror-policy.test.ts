/// <reference types="jest" />
/**
 * R2-1 — R2 mirror admission policy (behavioral regression proofs).
 *
 * Binding policy (Maya R2-0):
 *   1. Mallan-owned listings → retain COMPLETE active photos + floor plans
 *      (mirror everything active, as today).
 *   2. Third-party displayable listings → mirror the CANONICAL HERO PHOTO ONLY
 *      (max MAX_FEED_MIRROR_PHOTOS_PER_LISTING = 1).
 *   3. Third-party galleries / floor plans / videos / tours → NOT mirrored
 *      (serve via the /api/media/proxy fallback — see media-sync-rc3.test.ts).
 *   4. Non-displayable / terminal third-party media → NOT admitted at all.
 *   5. Ownership = isMallanExclusiveListing (SL-/RL- prefix OR
 *      rls_eligible === false). NEVER agent_id / owner_client_id.
 *   6. Hero selection = the production hero resolver (selectHeroPhoto — the
 *      exact function computeListingMediaSummary uses for primary_photo_url).
 *
 * These tests drive `runMediaSync` Phase 3 with an in-memory backlog pool so
 * the in-code (fail-closed) admission filter is proven even when rows that
 * production's DB-side where would exclude are fed to it directly.
 * No live R2, no live Trestle, no live DB.
 */

const mockMediaSyncFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockMediaSyncUpsert = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
const mockListingMediaUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();
const mockListingMediaCount = jest.fn<Promise<number>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    mediaSyncState: {
      findUnique: (args: unknown) => mockMediaSyncFindUnique(args),
      upsert: (args: unknown) => mockMediaSyncUpsert(args),
    },
    listingMedia: {
      findMany: (args: unknown) => mockListingMediaFindMany(args),
      update: (args: unknown) => mockListingMediaUpdate(args),
      updateMany: (args: unknown) => mockListingMediaUpdateMany(args),
      count: (args: unknown) => mockListingMediaCount(args),
    },
    listing: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    // W3: the drain selection runs inside a $transaction holding a
    // pg advisory xact lock. Grant the lock and route the tx-scoped
    // findMany to the same mock so admission assertions see the calls.
    $transaction: (fn: unknown) =>
      (fn as (tx: unknown) => unknown)({
        $queryRaw: async () => [{ locked: true }],
        listingMedia: {
          findMany: (args: unknown) => mockListingMediaFindMany(args),
        },
      }),
  },
}));

import * as fs from "fs";
import * as path from "path";
import {
  buildMallanOwnedListingWhere,
  buildR2BacklogWhere,
  buildR2MirrorPolicyMediaWhere,
  computeListingMediaSummary,
  decideMirrorAdmissionScope,
  FEED_MIRROR_MEDIA_TYPES,
  MALLAN_MIRROR_MEDIA_TYPES,
  MAX_FEED_MIRROR_PHOTOS_PER_LISTING,
  R2_POLICY_PARKED_ATTEMPTS,
  R2_RETRY_EXHAUSTED_THRESHOLD,
  runMediaSync,
  selectHeroPhoto,
  type MirrorMediaToR2Deps,
  type MirrorPolicyListing,
} from "../media-sync";
import { MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES } from "@/lib/listings/exclusive-agent-assignment";

// ─── Listing fixtures ────────────────────────────────────────────────────

const FEED_DISPLAYABLE: MirrorPolicyListing = {
  listing_id: "RLS20099999",
  rls_eligible: true,
  status: "Active",
  idx_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  internet_entire_listing_display_yn: true,
};

const FEED_NON_DISPLAYABLE: MirrorPolicyListing = {
  ...FEED_DISPLAYABLE,
  listing_id: "RLS20088888",
  idx_display_yn: false,
};

const FEED_TERMINAL: MirrorPolicyListing = {
  ...FEED_DISPLAYABLE,
  listing_id: "RLS20077777",
  status: "Closed",
};

const MALLAN_SL: MirrorPolicyListing = {
  listing_id: "SL-2026-0001",
  rls_eligible: true, // SL- prefix ALONE is the ownership signal here
  status: "Active",
  idx_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  internet_entire_listing_display_yn: true,
};

// ─── Backlog harness ─────────────────────────────────────────────────────

interface PoolRow {
  id: bigint;
  listing_id: string;
  media_key: string;
  media_type: string;
  status: string;
  preferred_photo_yn: boolean;
  order: number;
  media_url_original: string;
  r2_key: string | null;
  media_url_cached: string | null;
  r2_attempts: number | null;
  // Writer cutover: the harness must model the EXPLICIT policy column, or the
  // starvation proof below would keep "proving" a mechanism the writer no
  // longer uses.
  r2_policy_excluded_at: Date | null;
  media_modification_ts: Date | null;
  modification_ts: Date | null;
  listing: MirrorPolicyListing;
}

function makePoolRow(
  id: number,
  listing: MirrorPolicyListing,
  overrides: Partial<PoolRow> = {},
): PoolRow {
  return {
    id: BigInt(id),
    listing_id: String(listing.listing_id),
    media_key: `MK-${id}`,
    media_type: "Photo",
    status: "active",
    preferred_photo_yn: false,
    order: id,
    media_url_original: `https://api.cotality.com/trestle/Media/p-${id}.jpg`,
    r2_key: null,
    media_url_cached: null,
    r2_attempts: null,
    r2_policy_excluded_at: null,
    media_modification_ts: null,
    modification_ts: null,
    listing,
    ...overrides,
  };
}

/**
 * Install a STATEFUL in-memory DB:
 *   - Backlog queries page through `pool` honoring `take` + `id: { notIn }`
 *     AND the real eligibility predicates the production where carries:
 *     status='active', missing R2 copy (r2_key OR media_url_cached null),
 *     and the RC3 attempts predicate (`r2_attempts IS NULL OR <
 *     R2_RETRY_EXHAUSTED_THRESHOLD`). Honoring the attempts predicate is what
 *     PROVES policy-parked rows (r2_attempts = 9) are excluded by the
 *     EXISTING backlog where with zero schema change (Blocker-1).
 *   - Per-listing hero reads (where.listing_id, no status/OR) return the
 *     listing's rows from `pool`.
 *   - `listingMedia.update` / `updateMany` MUTATE the pool (mirror writes and
 *     the policy-parking flush persist), so multi-run tests observe real
 *     cross-run convergence.
 *   - `backlogFetchLimitPerRun` models #533's bounded per-run candidate set:
 *     after N candidate batches the run gets [] (out of budget). `newRun()`
 *     resets the per-run counter between runMediaSync invocations.
 */
function installPool(
  pool: PoolRow[],
  opts: { backlogFetchLimitPerRun?: number } = {},
): { heroQueries: () => number; newRun: () => void } {
  let heroQueryCount = 0;
  let backlogFetches = 0;
  mockListingMediaFindMany.mockImplementation(async (args: unknown) => {
    const a = args as {
      where?: { status?: string; OR?: unknown[]; listing_id?: string; id?: { notIn?: bigint[] } };
      take?: number;
    };
    if (a?.where?.status === "active" && Array.isArray(a.where.OR)) {
      backlogFetches++;
      if (
        opts.backlogFetchLimitPerRun !== undefined &&
        backlogFetches > opts.backlogFetchLimitPerRun
      ) {
        return []; // out of per-run candidate budget (#533 bounded set)
      }
      const excluded = new Set((a.where.id?.notIn ?? []).map(String));
      return pool
        .filter((r) => r.status === "active")
        .filter((r) => r.r2_key === null || r.media_url_cached === null)
        .filter(
          (r) => r.r2_attempts === null || r.r2_attempts < R2_RETRY_EXHAUSTED_THRESHOLD,
        )
        // Explicit policy exclusion — the clause that NOW keeps a parked row out
        // of the backlog (legacy exact-9 rows are still caught by the line
        // above, which is what makes the cutover safe without a backfill).
        .filter((r) => r.r2_policy_excluded_at === null)
        .filter((r) => !excluded.has(String(r.id)))
        .slice(0, a.take ?? 5);
    }
    if (a?.where?.listing_id) {
      heroQueryCount++;
      return pool.filter((r) => r.listing_id === a.where!.listing_id);
    }
    return [];
  });
  // Policy-parking flush — apply parking state to the pool and report count.
  mockListingMediaUpdateMany.mockImplementation(async (args: unknown) => {
    const a = args as {
      where: { id: { in: bigint[] } };
      data: { r2_attempts?: number; r2_last_attempt_at?: Date; r2_policy_excluded_at?: Date };
    };
    const ids = new Set((a.where.id.in ?? []).map(String));
    let count = 0;
    for (const r of pool) {
      if (ids.has(String(r.id))) {
        if (typeof a.data.r2_attempts === "number") r.r2_attempts = a.data.r2_attempts;
        if (a.data.r2_policy_excluded_at instanceof Date) {
          r.r2_policy_excluded_at = a.data.r2_policy_excluded_at;
        }
        count++;
      }
    }
    return { count };
  });
  // Mirror success/failure writes — persist to the pool so mirrored rows
  // leave the backlog on subsequent runs.
  mockListingMediaUpdate.mockImplementation(async (args: unknown) => {
    const a = args as {
      where: { media_key: string };
      data: { r2_key?: string; media_url_cached?: string; r2_attempts?: number };
    };
    const r = pool.find((p) => p.media_key === a.where.media_key);
    if (r) {
      if (typeof a.data.r2_key === "string") r.r2_key = a.data.r2_key;
      if (typeof a.data.media_url_cached === "string") {
        r.media_url_cached = a.data.media_url_cached;
      }
      if (typeof a.data.r2_attempts === "number") r.r2_attempts = a.data.r2_attempts;
    }
    return {};
  });
  return {
    heroQueries: () => heroQueryCount,
    newRun: () => {
      backlogFetches = 0;
    },
  };
}

function makeMirrorDeps(): MirrorMediaToR2Deps {
  return {
    existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
    uploadToR2: jest
      .fn<Promise<string>, [string, Buffer, string]>()
      .mockImplementation(async (key) => `https://r2.example.com/${key}`),
    getR2PublicUrl: jest
      .fn<string, [string]>()
      .mockImplementation((key) => `https://r2.example.com/${key}`),
    getAccessToken: jest.fn<Promise<string>, []>().mockResolvedValue("test-token"),
    fetchFn: jest.fn(),
  };
}

function makeOptions(
  mirrorDeps: MirrorMediaToR2Deps,
  overrides: { backlogBatchLimit?: number; parkedRecoveryQuota?: number } = {},
) {
  return {
    fetchDeps: {
      fetchProperties: jest.fn().mockResolvedValue([]), // Phase 1 idle
      fetchMedia: jest.fn().mockResolvedValue([]),
    },
    mirrorDeps,
    ...overrides,
  };
}

beforeEach(() => {
  mockMediaSyncFindUnique.mockReset().mockResolvedValue(null);
  mockMediaSyncUpsert.mockReset().mockResolvedValue(undefined);
  mockListingMediaFindMany.mockReset().mockResolvedValue([]);
  mockListingMediaUpdate.mockReset().mockResolvedValue(undefined);
  mockListingMediaUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  mockListingMediaCount.mockReset().mockResolvedValue(0);
});

// ─── Rule 2: third-party displayable ⇒ hero-only, hard max 1 ─────────────

describe("R2-1 — third-party displayable listing mirrors the canonical hero ONLY", () => {
  it("10 active photos ⇒ exactly 1 admitted, and it IS the production resolver's hero", async () => {
    // Hero is NOT the lowest id/order: preferred_photo_yn on order 7 wins.
    const pool = Array.from({ length: 10 }, (_, i) =>
      makePoolRow(i + 1, FEED_DISPLAYABLE, {
        preferred_photo_yn: i + 1 === 7,
      }),
    );
    installPool(pool);
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(makeOptions(mirrorDeps));

    // The approved maximum for a feed listing is 1 — and only 1 was admitted.
    expect(MAX_FEED_MIRROR_PHOTOS_PER_LISTING).toBe(1);
    expect(result.mirror_allowed).toBe(MAX_FEED_MIRROR_PHOTOS_PER_LISTING);
    expect(result.mirror_rejected_policy).toBe(9);
    expect(result.r2_mirrored).toBe(1);
    expect(result.r2_reused).toBe(1);
    expect(result.r2_uploaded).toBe(0);
    expect(result.r2_failed).toBe(0);

    // Phase-1 forensic accumulation proof: the new per-listing cause counters are
    // summed by the REAL runMediaSync loop (not a mock) and are emitted as
    // numbers, and the physical-write invariant holds on the accumulated result —
    // so the ~10K/day writes can be split by cause from durable fields alone.
    // (physical_writes/non_tombstone are intentionally NOT stored; rows_updated
    // IS physical_writes.)
    expect(typeof result.delivery_url_refreshed).toBe("number");
    expect(typeof result.suppressed_url_signature_rotation).toBe("number");
    expect(typeof result.suppressed_url_identity_changed).toBe("number");
    expect(typeof result.write_failures).toBe("number");
    expect(result.rows_updated).toBe(
      result.rows_inserted +
        result.rows_updated_changed +
        result.delivery_url_refreshed +
        result.tombstoned_explicit +
        result.tombstoned_vanished,
    );

    // Exactly one mirror attempt happened.
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(1);

    // Parity: the admitted row is EXACTLY the production hero resolver's pick.
    const expectedHero = selectHeroPhoto(pool);
    expect(expectedHero?.media_key).toBe("MK-7");
    const mirrorWrites = mockListingMediaUpdate.mock.calls.map(
      (c) => (c[0] as { where: { media_key: string } }).where.media_key,
    );
    expect(mirrorWrites).toEqual(["MK-7"]);

    // Blocker-1: the 9 non-hero rejections are DETERMINISTIC ⇒ every one is
    // POLICY-PARKED in ONE batched updateMany, so none of them can ever refill
    // the candidate set.
    //
    // CONTRACT INVERTED (writer cutover). This previously asserted the park
    // wrote `r2_attempts = 9` + `r2_last_attempt_at`. Both were the overload:
    // a POLICY decision recorded in the FAILURE counter, plus a cooldown stamp
    // for an attempt that was never made. The park now writes its own column.
    // Batching, the id set and the parked COUNT are unchanged — only the
    // durable representation of the decision changed.
    expect(result.mirror_rejected_policy_parked).toBe(9);
    expect(mockListingMediaUpdateMany).toHaveBeenCalledTimes(1);
    const park = mockListingMediaUpdateMany.mock.calls[0][0] as {
      where: { id: { in: bigint[] } };
      data: { r2_policy_excluded_at?: Date; r2_attempts?: number; r2_last_attempt_at?: Date };
    };
    expect(park.where.id.in.map(Number).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 8, 9, 10,
    ]);
    expect(park.data.r2_policy_excluded_at).toBeInstanceOf(Date);
    expect(park.data.r2_attempts).toBeUndefined();
    expect(park.data.r2_last_attempt_at).toBeUndefined();
  });

  it("hero parity with computeListingMediaSummary (the primary_photo_url source)", () => {
    const rows = [
      makePoolRow(1, FEED_DISPLAYABLE, { order: 3 }),
      makePoolRow(2, FEED_DISPLAYABLE, { order: 1 }),
      makePoolRow(3, FEED_DISPLAYABLE, { order: 2, media_type: "FloorPlan" }),
      makePoolRow(4, FEED_DISPLAYABLE, { order: 0, status: "deleted" }),
    ];
    const hero = selectHeroPhoto(rows);
    const summary = computeListingMediaSummary(rows);
    // Same function family, same pick: lowest-order ACTIVE Photo (MK-2).
    expect(hero?.media_key).toBe("MK-2");
    expect(summary.primary_photo_url).toBe(hero?.media_url_original);
  });

  it("fail-closed: if the per-listing hero lookup throws, NOTHING is admitted (no crash, retried next firing)", async () => {
    const pool = [
      makePoolRow(1, FEED_DISPLAYABLE),
      makePoolRow(2, FEED_DISPLAYABLE),
    ];
    installPool(pool);
    // Override: hero reads reject; backlog reads still work.
    const base = mockListingMediaFindMany.getMockImplementation()!;
    mockListingMediaFindMany.mockImplementation(async (args: unknown) => {
      const a = args as { where?: { listing_id?: string; status?: string } };
      if (a?.where?.listing_id && a.where.status === undefined) {
        throw new Error("hero read failed");
      }
      return base(args);
    });
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(makeOptions(mirrorDeps));

    expect(result.mirror_allowed).toBe(0);
    expect(result.mirror_rejected_policy).toBe(2);
    expect(result.r2_mirrored).toBe(0);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(0);
    // Policy rejection is NOT a failure — no r2_failed, run stays ok.
    expect(result.r2_failed).toBe(0);
    expect(result.status).toBe("ok");
    // Blocker-1 boundary: a TRANSIENT rejection (hero unknown — lookup
    // failed) is NOT parked. Parking a transient state could permanently
    // exclude the actual hero; these rows re-surface next firing instead.
    expect(result.mirror_rejected_policy_parked).toBe(0);
    expect(mockListingMediaUpdateMany).not.toHaveBeenCalled();
  });
});

// ─── Rule 1: Mallan-owned ⇒ complete active set ──────────────────────────

describe("R2-1 — Mallan-owned listing mirrors its COMPLETE active media set", () => {
  it("10 photos + 3 floor plans ⇒ all 13 admitted (no hero restriction, no hero queries)", async () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => makePoolRow(i + 1, MALLAN_SL)),
      ...Array.from({ length: 3 }, (_, i) =>
        makePoolRow(i + 11, MALLAN_SL, { media_type: "FloorPlan" }),
      ),
    ];
    const { heroQueries } = installPool(pool);
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(makeOptions(mirrorDeps));

    expect(result.mirror_allowed).toBe(13);
    expect(result.mirror_rejected_policy).toBe(0);
    expect(result.r2_mirrored).toBe(13);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(13);
    // all_active scope never needs a hero lookup.
    expect(heroQueries()).toBe(0);
    expect(result.mirror_rejected_policy_parked).toBe(0);
  });

  it("Blocker-1b: 10 photos + 3 floor plans + 2 videos + 1 virtual tour ⇒ EXACTLY 13 admitted (videos/tours rejected + parked, never silently admitted)", async () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => makePoolRow(i + 1, MALLAN_SL)),
      ...Array.from({ length: 3 }, (_, i) =>
        makePoolRow(i + 11, MALLAN_SL, { media_type: "FloorPlan" }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        makePoolRow(i + 14, MALLAN_SL, { media_type: "Video" }),
      ),
      makePoolRow(16, MALLAN_SL, { media_type: "VirtualTour" }),
    ];
    installPool(pool);
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(makeOptions(mirrorDeps));

    // The approved Mallan retention set is EXACTLY Photo + FloorPlan.
    expect(MALLAN_MIRROR_MEDIA_TYPES).toEqual(["Photo", "FloorPlan"]);
    expect(result.mirror_allowed).toBe(13);
    expect(result.r2_mirrored).toBe(13);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(13);
    // The 3 disallowed rows (2 Videos + 1 VirtualTour) are rejected AND
    // parked (deterministic media_type mismatch — the DB-side where excludes
    // them in production; if one is ever fetched it must not loop).
    expect(result.mirror_rejected_policy).toBe(3);
    expect(result.mirror_rejected_policy_parked).toBe(3);
    const park = mockListingMediaUpdateMany.mock.calls[0][0] as {
      where: { id: { in: bigint[] } };
      data: { r2_policy_excluded_at?: Date; r2_attempts?: number };
    };
    expect(park.where.id.in.map(Number).sort((a, b) => a - b)).toEqual([14, 15, 16]);
    // CONTRACT INVERTED (writer cutover): rejected videos/tours are still parked
    // in one batch, but the decision no longer masquerades as a failure count.
    expect(park.data.r2_policy_excluded_at).toBeInstanceOf(Date);
    expect(park.data.r2_attempts).toBeUndefined();
  });

  it("rls_eligible === false (website-only) is ALSO Mallan-owned ⇒ all active admitted", async () => {
    const websiteOnly: MirrorPolicyListing = {
      ...FEED_DISPLAYABLE,
      listing_id: "COMM-0001", // no SL-/RL- prefix — rls_eligible is the signal
      rls_eligible: false,
    };
    const pool = [
      makePoolRow(1, websiteOnly),
      makePoolRow(2, websiteOnly, { media_type: "FloorPlan" }),
    ];
    installPool(pool);
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(makeOptions(mirrorDeps));

    expect(result.mirror_allowed).toBe(2);
    expect(result.mirror_rejected_policy).toBe(0);
  });
});

// ─── Rule 4: non-displayable / terminal third-party ⇒ nothing admitted ───

describe("R2-1 — non-admissible third-party listings admit ZERO media (fail-closed in code)", () => {
  it("non-displayable third-party listing ⇒ 0 admitted even when rows reach the candidate set", async () => {
    const pool = [
      makePoolRow(1, FEED_NON_DISPLAYABLE),
      makePoolRow(2, FEED_NON_DISPLAYABLE),
      makePoolRow(3, FEED_NON_DISPLAYABLE),
    ];
    installPool(pool);
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(makeOptions(mirrorDeps));

    expect(result.mirror_allowed).toBe(0);
    expect(result.mirror_rejected_policy).toBe(3);
    expect(result.r2_mirrored).toBe(0);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(0);
    // scope 'none' is listing-level and MUTABLE (only reachable via a
    // select/re-check race or where drift) ⇒ rejected but NOT parked.
    expect(result.mirror_rejected_policy_parked).toBe(0);
    expect(mockListingMediaUpdateMany).not.toHaveBeenCalled();
  });

  it("terminal-status (Closed) third-party listing ⇒ 0 admitted (display 24h grace does NOT grant mirror admission)", async () => {
    const pool = [
      makePoolRow(1, FEED_TERMINAL),
      makePoolRow(2, FEED_TERMINAL),
      makePoolRow(3, FEED_TERMINAL, { media_type: "FloorPlan" }),
    ];
    installPool(pool);
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(makeOptions(mirrorDeps));

    expect(result.mirror_allowed).toBe(0);
    expect(result.mirror_rejected_policy).toBe(3);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(0);
  });

  it("backlog row with NO listing relation ⇒ fail-closed 'none'", async () => {
    const pool = [
      makePoolRow(1, FEED_DISPLAYABLE, {
        listing: undefined as unknown as MirrorPolicyListing,
      }),
    ];
    installPool(pool);
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(makeOptions(mirrorDeps));

    expect(result.mirror_allowed).toBe(0);
    expect(result.mirror_rejected_policy).toBe(1);
  });
});

// ─── Blocker-1: starvation proof + policy-parking convergence ────────────

describe("R2-1 Blocker-1 — parked rejections can NEVER refill the bounded candidate batch (starvation proof)", () => {
  // The bounded candidate batch (#533): Phase 3 fetches R2_MIRROR_CONCURRENCY
  // (= 5) oldest-first candidates per iteration; this test additionally
  // bounds each run to ONE candidate batch (backlogFetchLimitPerRun: 1) —
  // the worst case, where pre-fix the same 5 oldest rejected rows would fill
  // the batch on EVERY run forever and the hero would never be reached.
  const CAP = 5;

  it("run 1: batch fills with non-heroes → ALL parked, zero mirrored; run 2: hero fetched + mirrored; run 3: nothing returns", async () => {
    // 6 non-hero photos (ids 1-6) precede the hero (id 7, preferred) in
    // created_at (id) order — MORE non-heroes than the cap.
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => makePoolRow(i + 1, FEED_DISPLAYABLE)),
      makePoolRow(7, FEED_DISPLAYABLE, { preferred_photo_yn: true }),
    ];
    const harness = installPool(pool, { backlogFetchLimitPerRun: 1 });
    const mirrorDeps = makeMirrorDeps();
    expect(selectHeroPhoto(pool)?.media_key).toBe("MK-7");

    // ── RUN 1: the only candidate batch is ids 1-5 — all non-hero.
    const run1 = await runMediaSync(makeOptions(mirrorDeps, { backlogBatchLimit: CAP, parkedRecoveryQuota: 0 }));
    expect(run1.mirror_allowed).toBe(0);
    expect(run1.r2_mirrored).toBe(0);
    expect(run1.mirror_rejected_policy).toBe(CAP);
    // Blocker-1: every rejection is parked in ONE updateMany (not stateless).
    expect(run1.mirror_rejected_policy_parked).toBe(CAP);
    expect(mockListingMediaUpdateMany).toHaveBeenCalledTimes(1);
    const park1 = mockListingMediaUpdateMany.mock.calls[0][0] as {
      where: { id: { in: bigint[] } };
      data: { r2_policy_excluded_at?: Date; r2_attempts?: number; r2_last_attempt_at?: Date };
    };
    expect(park1.where.id.in.map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    // CONTRACT INVERTED (writer cutover). The STARVATION GUARANTEE this test
    // exists to prove is unchanged — parked rows must never refill the bounded
    // candidate set. Only the mechanism changed: the explicit policy column now
    // carries the exclusion instead of the failure counter's side effect.
    expect(park1.data.r2_policy_excluded_at).toBeInstanceOf(Date);
    expect(park1.data.r2_attempts).toBeUndefined();
    expect(park1.data.r2_last_attempt_at).toBeUndefined();

    // ── RUN 2: parked state persisted ⇒ the EXISTING backlog predicate
    // (r2_attempts IS NULL OR < R2_RETRY_EXHAUSTED_THRESHOLD) excludes rows
    // 1-5. The batch is now [6, 7]: the hero is fetched and mirrored.
    harness.newRun();
    const run2 = await runMediaSync(makeOptions(mirrorDeps, { backlogBatchLimit: CAP, parkedRecoveryQuota: 0 }));
    expect(run2.mirror_allowed).toBe(1);
    expect(run2.r2_mirrored).toBe(1);
    const run2MirrorWrites = mockListingMediaUpdate.mock.calls.map(
      (c) => (c[0] as { where: { media_key: string } }).where.media_key,
    );
    expect(run2MirrorWrites).toEqual(["MK-7"]); // the canonical hero, mirrored
    expect(run2.mirror_rejected_policy_parked).toBe(1); // row 6 parked

    // ── RUN 3: convergence — heroes mirrored, rejects parked; the backlog
    // SELECT returns NOTHING. Parked rows never reappear in any fetch.
    harness.newRun();
    const run3 = await runMediaSync(makeOptions(mirrorDeps, { backlogBatchLimit: CAP, parkedRecoveryQuota: 0 }));
    expect(run3.mirror_allowed).toBe(0);
    expect(run3.mirror_rejected_policy).toBe(0); // no parked row was re-fetched
    expect(run3.mirror_rejected_policy_parked).toBe(0);
    expect(run3.r2_mirrored).toBe(0);
    expect(mockListingMediaUpdateMany).toHaveBeenCalledTimes(2); // no run-3 flush

    // Convergence math: with R rejected rows ahead of the heroes and a
    // candidate cap C per run, every run parks up to C rejects, so heroes are
    // reachable within ceil(R/C) + 1 runs. Here R=6, C=5 ⇒ bound 3 runs; the
    // hero was actually mirrored in run 2 (≤ bound). Pre-fix (stateless
    // rejection) the bound was infinite.
    expect(Math.ceil(6 / CAP) + 1).toBe(3);
  });

  it("gallery rows of a listing whose hero is ALREADY mirrored are PARKED, not silently skipped", async () => {
    const pool = [
      // The canonical hero — already mirrored ⇒ not in the backlog.
      makePoolRow(1, FEED_DISPLAYABLE, {
        preferred_photo_yn: true,
        r2_key: "photos/RLS20099999/1.jpg",
        media_url_cached: "https://r2.example.com/photos/RLS20099999/1.jpg",
      }),
      // Remaining gallery rows — still missing R2 state, so they ARE fetched.
      makePoolRow(2, FEED_DISPLAYABLE),
      makePoolRow(3, FEED_DISPLAYABLE),
      makePoolRow(4, FEED_DISPLAYABLE),
    ];
    installPool(pool);
    const mirrorDeps = makeMirrorDeps();

    const result = await runMediaSync(makeOptions(mirrorDeps));

    // The resolver still identifies row 1 as hero (mirror state is not a
    // hero input), so rows 2-4 are deterministic non-hero rejections ⇒ ALL
    // parked. Nothing is mirrored, and nothing is left to loop.
    expect(result.mirror_allowed).toBe(0);
    expect(result.r2_mirrored).toBe(0);
    expect(result.mirror_rejected_policy).toBe(3);
    expect(result.mirror_rejected_policy_parked).toBe(3);
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(0);
    expect(mockListingMediaUpdateMany).toHaveBeenCalledTimes(1);
    const park = mockListingMediaUpdateMany.mock.calls[0][0] as {
      where: { id: { in: bigint[] } };
      data: { r2_policy_excluded_at?: Date; r2_attempts?: number };
    };
    expect(park.where.id.in.map(Number).sort((a, b) => a - b)).toEqual([2, 3, 4]);
    // CONTRACT INVERTED (writer cutover) — same parked ids, new durable column.
    expect(park.data.r2_policy_excluded_at).toBeInstanceOf(Date);
    expect(park.data.r2_attempts).toBeUndefined();
  });
});

describe("R2-1 Blocker-1 — R2_POLICY_PARKED_ATTEMPTS sentinel semantics", () => {
  it("is 9: ABOVE the RC3 exhaustion threshold (8) so the existing backlog predicate excludes it, and DISTINCT from 8 for forensics", () => {
    expect(R2_POLICY_PARKED_ATTEMPTS).toBe(9);
    expect(R2_RETRY_EXHAUSTED_THRESHOLD).toBe(8);
    expect(R2_POLICY_PARKED_ATTEMPTS).toBeGreaterThan(R2_RETRY_EXHAUSTED_THRESHOLD);
  });

  it("a policy-parked row fails the backlog attempts predicate (r2_attempts < threshold) — parked means NEVER selected again", () => {
    expect(R2_POLICY_PARKED_ATTEMPTS < R2_RETRY_EXHAUSTED_THRESHOLD).toBe(false);
    const where = buildR2BacklogWhere(new Date(), []) as {
      AND: Array<{ OR?: Array<Record<string, unknown>> }>;
    };
    const attemptsMember = where.AND.find(
      (m) =>
        Array.isArray(m.OR) &&
        m.OR.some((o) => JSON.stringify(o).includes("r2_attempts")),
    );
    expect(attemptsMember?.OR).toEqual([
      { r2_attempts: null },
      { r2_attempts: { lt: R2_RETRY_EXHAUSTED_THRESHOLD } },
    ]);
  });
});

// ─── decideMirrorAdmissionScope — pure policy table ──────────────────────

describe("R2-1 — decideMirrorAdmissionScope", () => {
  it("SL-/RL- prefixes ⇒ all_active", () => {
    for (const p of MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES) {
      expect(
        decideMirrorAdmissionScope({ ...FEED_DISPLAYABLE, listing_id: `${p}X` }),
      ).toBe("all_active");
    }
  });

  it("rls_eligible false ⇒ all_active; displayable feed ⇒ hero_only", () => {
    expect(
      decideMirrorAdmissionScope({ ...FEED_DISPLAYABLE, rls_eligible: false }),
    ).toBe("all_active");
    expect(decideMirrorAdmissionScope(FEED_DISPLAYABLE)).toBe("hero_only");
  });

  it("every blocked gate ⇒ none (fail-closed, including nulls)", () => {
    expect(decideMirrorAdmissionScope(FEED_NON_DISPLAYABLE)).toBe("none");
    expect(decideMirrorAdmissionScope(FEED_TERMINAL)).toBe("none");
    expect(
      decideMirrorAdmissionScope({ ...FEED_DISPLAYABLE, owner_opt_out: true }),
    ).toBe("none");
    expect(
      decideMirrorAdmissionScope({ ...FEED_DISPLAYABLE, participant_only: true }),
    ).toBe("none");
    expect(
      decideMirrorAdmissionScope({
        ...FEED_DISPLAYABLE,
        internet_entire_listing_display_yn: false,
      }),
    ).toBe("none");
    // Fail-closed on missing/unknown flags:
    expect(
      decideMirrorAdmissionScope({ ...FEED_DISPLAYABLE, idx_display_yn: null }),
    ).toBe("none");
    expect(decideMirrorAdmissionScope(null)).toBe("none");
    expect(decideMirrorAdmissionScope(undefined)).toBe("none");
  });

  it("NEVER uses agent_id / owner_client_id — extra agent linkage cannot change the scope", () => {
    const withAgent = {
      ...FEED_DISPLAYABLE,
      agent_id: 123n,
      owner_client_id: 456n,
    } as MirrorPolicyListing;
    // Agent linkage does NOT make a feed listing Mallan-owned.
    expect(decideMirrorAdmissionScope(withAgent)).toBe("hero_only");
    const blockedWithAgent = {
      ...FEED_NON_DISPLAYABLE,
      agent_id: 123n,
    } as MirrorPolicyListing;
    expect(decideMirrorAdmissionScope(blockedWithAgent)).toBe("none");
  });

  it("source-scan: lib/idx/media-sync.ts never references agent_id / owner_client_id", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "media-sync.ts"),
      "utf8",
    );
    // The identifiers may appear ONLY inside comments (which forbid them).
    // Strip comments and require zero remaining occurrences in CODE.
    const noComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "")
      .replace(/[ \t]\/\/[^\n]*/g, "");
    expect(noComments).not.toContain("agent_id");
    expect(noComments).not.toContain("owner_client_id");
  });
});

// ─── DB-side where builders ──────────────────────────────────────────────

describe("R2-1 — DB-side admission where-shapes", () => {
  it("buildMallanOwnedListingWhere derives startsWith branches from the canonical prefix export + rls_eligible false", () => {
    const where = buildMallanOwnedListingWhere() as { OR: unknown[] };
    expect(where.OR).toEqual([
      ...MALLAN_EXCLUSIVE_LISTING_ID_PREFIXES.map((p) => ({
        listing_id: { startsWith: p },
      })),
      { rls_eligible: false },
    ]);
  });

  it("buildR2MirrorPolicyMediaWhere: Mallan branch is EXACTLY Photo+FloorPlan; feed branch is Photo-only + display-gated (Blocker-1a/1b in-query restriction)", () => {
    const where = buildR2MirrorPolicyMediaWhere() as {
      OR: Array<Record<string, unknown>>;
    };
    expect(where.OR).toHaveLength(2);
    const [mallanBranch, feedBranch] = where.OR;
    // Blocker-1b: the Mallan branch restricts media_type IN-QUERY to the
    // exact approved retention set — videos / virtual tours are never
    // candidates and cannot occupy the bounded candidate batch.
    expect(mallanBranch.media_type).toEqual({ in: ["Photo", "FloorPlan"] });
    expect(MALLAN_MIRROR_MEDIA_TYPES).toEqual(["Photo", "FloorPlan"]);
    expect(mallanBranch).toHaveProperty("listing");
    // Blocker-1a: the feed branch is Photo-only — floorplans / videos /
    // virtual tours of feed listings are NEVER candidates.
    expect(feedBranch.media_type).toEqual({ in: ["Photo"] });
    expect(FEED_MIRROR_MEDIA_TYPES).toEqual(["Photo"]);
    const feedListing = feedBranch.listing as Record<string, unknown>;
    // The production search display gate + active statuses, fail-closed.
    expect(feedListing.idx_display_yn).toBe(true);
    expect(feedListing.owner_opt_out).toBe(false);
    expect(feedListing.participant_only).toBe(false);
    expect(feedListing.internet_entire_listing_display_yn).toBe(true);
    expect(feedListing.status).toBeDefined();
  });

  it("buildR2BacklogWhere ALWAYS carries the policy filter in AND (the unscoped feed-wide mirror is unreachable)", () => {
    const where = buildR2BacklogWhere(new Date("2026-07-16T00:00:00Z"), []) as {
      AND: Array<Record<string, unknown>>;
    };
    const policyMember = where.AND.find(
      (m) =>
        Array.isArray(m.OR) &&
        (m.OR as Array<Record<string, unknown>>).some((o) => "listing" in o),
    );
    expect(policyMember).toEqual(buildR2MirrorPolicyMediaWhere());
  });

  it("no where-shape ever filters on agent_id / owner_client_id (deep scan)", () => {
    const json = JSON.stringify({
      backlog: buildR2BacklogWhere(new Date(), []),
      policy: buildR2MirrorPolicyMediaWhere(),
      owned: buildMallanOwnedListingWhere(),
    });
    expect(json).not.toContain("agent_id");
    expect(json).not.toContain("owner_client_id");
  });
});
