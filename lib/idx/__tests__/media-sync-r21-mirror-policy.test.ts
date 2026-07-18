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
      count: (args: unknown) => mockListingMediaCount(args),
    },
    listing: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
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
  MAX_FEED_MIRROR_PHOTOS_PER_LISTING,
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
    media_modification_ts: null,
    modification_ts: null,
    listing,
    ...overrides,
  };
}

/**
 * Install an in-memory DB: backlog queries page through `pool` honoring
 * `take` + `id: { notIn }`; per-listing hero reads (where.listing_id, no
 * status/OR) return the listing's rows from `pool`.
 */
function installPool(pool: PoolRow[]): { heroQueries: () => number } {
  let heroQueryCount = 0;
  mockListingMediaFindMany.mockImplementation(async (args: unknown) => {
    const a = args as {
      where?: { status?: string; OR?: unknown[]; listing_id?: string; id?: { notIn?: bigint[] } };
      take?: number;
    };
    if (a?.where?.status === "active" && Array.isArray(a.where.OR)) {
      const excluded = new Set((a.where.id?.notIn ?? []).map(String));
      return pool
        .filter((r) => !excluded.has(String(r.id)))
        .slice(0, a.take ?? 5);
    }
    if (a?.where?.listing_id) {
      heroQueryCount++;
      return pool.filter((r) => r.listing_id === a.where!.listing_id);
    }
    return [];
  });
  return { heroQueries: () => heroQueryCount };
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

function makeOptions(mirrorDeps: MirrorMediaToR2Deps) {
  return {
    fetchDeps: {
      fetchProperties: jest.fn().mockResolvedValue([]), // Phase 1 idle
      fetchMedia: jest.fn().mockResolvedValue([]),
    },
    mirrorDeps,
  };
}

beforeEach(() => {
  mockMediaSyncFindUnique.mockReset().mockResolvedValue(null);
  mockMediaSyncUpsert.mockReset().mockResolvedValue(undefined);
  mockListingMediaFindMany.mockReset().mockResolvedValue([]);
  mockListingMediaUpdate.mockReset().mockResolvedValue(undefined);
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

    // Exactly one mirror attempt happened.
    expect((mirrorDeps.existsInR2 as jest.Mock).mock.calls.length).toBe(1);

    // Parity: the admitted row is EXACTLY the production hero resolver's pick.
    const expectedHero = selectHeroPhoto(pool);
    expect(expectedHero?.media_key).toBe("MK-7");
    const mirrorWrites = mockListingMediaUpdate.mock.calls.map(
      (c) => (c[0] as { where: { media_key: string } }).where.media_key,
    );
    expect(mirrorWrites).toEqual(["MK-7"]);
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

  it("buildR2MirrorPolicyMediaWhere: Mallan branch takes ANY media_type; feed branch is Photo-only + display-gated", () => {
    const where = buildR2MirrorPolicyMediaWhere() as {
      OR: Array<Record<string, unknown>>;
    };
    expect(where.OR).toHaveLength(2);
    const [mallanBranch, feedBranch] = where.OR;
    expect(mallanBranch).not.toHaveProperty("media_type");
    expect(mallanBranch).toHaveProperty("listing");
    expect(feedBranch.media_type).toBe("Photo");
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
