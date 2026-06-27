/// <reference types="jest" />
/**
 * H1 Tier-1 dual-write — runtime side-effect tests for the helper itself.
 *
 * Verifies:
 * - Helper reads the listing row by listing_id (correct WHERE clause)
 * - Helper passes the canonical builder's input shape (no manual SQL)
 * - Helper upserts via prisma.listingSearchProjection.upsert
 * - Helper silently no-ops when the listing was deleted
 * - Helper propagates errors from the upsert (does NOT swallow)
 *
 * These cover the helper's contract. The 5 caller-site tests live in
 * lib/search/__tests__/h1-dual-write-tier1.test.ts (static guards).
 */

import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";

interface MockListing {
  listing_id: string;
  status: string | null;
  listing_type: string | null;
  property_type: string | null;
  property_sub_type: string | null;
  list_price: number | string | null;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  bathrooms_half: number | null;
  living_area: number | string | null;
  borough: string | null;
  neighborhood: string | null;
  city: string | null;
  postal_code: string | null;
  rls_eligible: boolean | null;
  commercial_sub_type: string | null;
  idx_display_yn: boolean | null;
  internet_entire_listing_display_yn: boolean | null;
  internet_address_display_yn: boolean | null;
  participant_only: boolean | null;
  agent_id: bigint | number | null;
  modification_timestamp: Date | string | null;
  address: Record<string, unknown> | null;
  features: Record<string, unknown> | null;
  media: unknown[] | null;
}

function makeListingFixture(overrides: Partial<MockListing> = {}): MockListing {
  return {
    listing_id: "RLS-TEST-001",
    status: "Active",
    listing_type: "rent",
    property_type: "ResidentialLease",
    property_sub_type: "Apartment",
    list_price: 3300,
    bedrooms_total: 1,
    bathrooms_full: 1,
    bathrooms_half: 0,
    living_area: 600,
    borough: "Manhattan",
    neighborhood: "Lenox Hill",
    city: "New York City",
    postal_code: "10021",
    rls_eligible: true,
    commercial_sub_type: null,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    participant_only: false,
    agent_id: null,
    modification_timestamp: new Date("2026-05-05T03:30:37.588Z"),
    address: { StreetNumber: "1018", StreetName: "Lexington" },
    features: { PublicRemarks: "Sunny studio" },
    media: [],
    ...overrides,
  };
}

interface PrismaMock {
  listing: { findUnique: jest.Mock };
  listingSearchProjection: { upsert: jest.Mock };
}

function makePrismaMock(listing: MockListing | null): PrismaMock {
  return {
    listing: {
      findUnique: jest.fn(async () => listing),
    },
    listingSearchProjection: {
      upsert: jest.fn(async (args) => args),
    },
  };
}

describe("dualWriteProjectionForListingId — runtime contract", () => {
  it("reads listings by listing_id and upserts a projection row", async () => {
    const prisma = makePrismaMock(makeListingFixture());

    await dualWriteProjectionForListingId(
      prisma as unknown as Parameters<typeof dualWriteProjectionForListingId>[0],
      "RLS-TEST-001",
    );

    // findUnique called with correct where clause
    expect(prisma.listing.findUnique).toHaveBeenCalledTimes(1);
    const findArgs = prisma.listing.findUnique.mock.calls[0][0];
    expect(findArgs.where).toEqual({ listing_id: "RLS-TEST-001" });

    // upsert called with canonical payload shape (where + create + update)
    expect(prisma.listingSearchProjection.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = prisma.listingSearchProjection.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ listing_id: "RLS-TEST-001" });
    expect(upsertArgs.create).toBeDefined();
    expect(upsertArgs.update).toBeDefined();
  });

  it("upserts a full-fidelity projection row matching canonical builder output", async () => {
    const prisma = makePrismaMock(makeListingFixture());

    await dualWriteProjectionForListingId(
      prisma as unknown as Parameters<typeof dualWriteProjectionForListingId>[0],
      "RLS-TEST-001",
    );

    const data = prisma.listingSearchProjection.upsert.mock.calls[0][0].create;
    // Spot-check the canonical fields the projection schema expects
    expect(data.listing_id).toBe("RLS-TEST-001");
    expect(data.mls_status).toBe("Active");
    expect(data.listing_type).toBe("rent");
    expect(data.property_type).toBe("ResidentialLease");
    expect(data.borough).toBe("Manhattan");
    expect(data.neighborhood).toBe("Lenox Hill");
    expect(data.is_rental).toBe(true);
    expect(data.is_commercial).toBe(false);
    expect(data.rls_eligible).toBe(true);
    expect(data.idx_display_yn).toBe(true);
    expect(data.internet_entire_listing_display_yn).toBe(true);
    expect(data.internet_address_display_yn).toBe(true);
    expect(data.participant_only_yn).toBe(false);
    // searchable_text should be derived (lowercased address parts + neighborhood/city)
    expect(data.searchable_text).toContain("lexington");
    expect(data.searchable_text).toContain("lenox hill");
  });

  it("silently no-ops if the listing was deleted between the caller's write and this call", async () => {
    const prisma = makePrismaMock(null); // findUnique → null

    await expect(
      dualWriteProjectionForListingId(
        prisma as unknown as Parameters<typeof dualWriteProjectionForListingId>[0],
        "RLS-MISSING-999",
      ),
    ).resolves.toBeUndefined();

    expect(prisma.listing.findUnique).toHaveBeenCalledTimes(1);
    // Critical: upsert must NOT be called when listing is null
    expect(prisma.listingSearchProjection.upsert).not.toHaveBeenCalled();
  });

  it("propagates upsert errors (does NOT swallow them)", async () => {
    const prisma = makePrismaMock(makeListingFixture());
    prisma.listingSearchProjection.upsert = jest.fn(async () => {
      throw new Error("simulated DB error during projection upsert");
    });

    await expect(
      dualWriteProjectionForListingId(
        prisma as unknown as Parameters<typeof dualWriteProjectionForListingId>[0],
        "RLS-TEST-001",
      ),
    ).rejects.toThrow(/simulated DB error/);
  });

  it("propagates findUnique errors (does NOT swallow them)", async () => {
    const prisma: PrismaMock = {
      listing: {
        findUnique: jest.fn(async () => {
          throw new Error("simulated DB error during listing lookup");
        }),
      },
      listingSearchProjection: { upsert: jest.fn() },
    };

    await expect(
      dualWriteProjectionForListingId(
        prisma as unknown as Parameters<typeof dualWriteProjectionForListingId>[0],
        "RLS-TEST-001",
      ),
    ).rejects.toThrow(/simulated DB error/);

    // Critical: upsert must NOT be called if findUnique threw
    expect(prisma.listingSearchProjection.upsert).not.toHaveBeenCalled();
  });

  it("derives is_exclusive by the Mallan-exclusive rule (SL-/RL- or rls_eligible=false), NOT from agent_id (F13)", async () => {
    // A third-party IDX row stamped with agent_id (as syncAgentHistory does)
    // must NOT be flagged exclusive — listing_id "RLS-TEST-001", rls_eligible true.
    const thirdParty = makePrismaMock(
      makeListingFixture({ listing_id: "RLS-TEST-001", rls_eligible: true, agent_id: 42n, listing_type: "sale" }),
    );
    await dualWriteProjectionForListingId(
      thirdParty as unknown as Parameters<typeof dualWriteProjectionForListingId>[0],
      "RLS-TEST-001",
    );
    const thirdPartyData = thirdParty.listingSearchProjection.upsert.mock.calls[0][0].create;
    expect(thirdPartyData.is_exclusive).toBe(false);
    expect(thirdPartyData.is_rental).toBe(false);

    // A genuine CRM exclusive (SL- prefix) is exclusive even with no agent_id.
    const exclusive = makePrismaMock(
      makeListingFixture({ listing_id: "SL-0004", rls_eligible: true, agent_id: null, listing_type: "sale" }),
    );
    await dualWriteProjectionForListingId(
      exclusive as unknown as Parameters<typeof dualWriteProjectionForListingId>[0],
      "SL-0004",
    );
    const exclusiveData = exclusive.listingSearchProjection.upsert.mock.calls[0][0].create;
    expect(exclusiveData.is_exclusive).toBe(true);
  });

  it("preserves null gate fields rather than coercing to true (fail-closed contract)", async () => {
    const prisma = makePrismaMock(
      makeListingFixture({
        idx_display_yn: null,
        internet_entire_listing_display_yn: null,
        internet_address_display_yn: null,
      }),
    );

    await dualWriteProjectionForListingId(
      prisma as unknown as Parameters<typeof dualWriteProjectionForListingId>[0],
      "RLS-TEST-001",
    );

    const data = prisma.listingSearchProjection.upsert.mock.calls[0][0].create;
    // Reader-side gate evaluator treats null as "not displayable" (fail-closed).
    // The builder must round-trip null verbatim, never coerce to true.
    expect(data.idx_display_yn).toBeNull();
    expect(data.internet_entire_listing_display_yn).toBeNull();
    expect(data.internet_address_display_yn).toBeNull();
  });
});
