/**
 * P1C2 — crm: namespace guard on tombstoneVanished (behavioral RED→GREEN).
 *
 * CRM-owned media rows live in the same `listing_media` table as Trestle feed
 * rows, in the `crm:` media_key namespace that `lib/media/crm-media.ts:2-7`
 * promises the Trestle sync never prunes. Before P1C2, `tombstoneVanished`
 * tombstoned "every active row absent from the complete Trestle set" with NO
 * crm: exclusion — and CRM rows are absent from every Trestle set BY DESIGN,
 * so the first complete sync of a listing deleted the agent's uploads.
 *
 * Under test:
 *   1. non-empty complete set → the vanished-row updateMany excludes crm: keys.
 *   2. empty complete set (tombstone-everything branch) → same exclusion.
 *   3. explicit MediaStatus='Deleted' branch unchanged (IN-list of Trestle
 *      keys — inherently crm:-safe; regression guard on the where shape).
 *
 * Mock-prisma call-shape assertions, same pattern as media-sync-upsert.test.ts.
 */

import type { UpsertListingMediaInput } from "../media-sync";
import { CRM_MEDIA_KEY_PREFIX } from "@/lib/media/crm-media";

const mockFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockCreate = jest.fn<Promise<unknown>, [unknown]>();
const mockUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockUpdateMany = jest.fn<
  Promise<{ count: number }>,
  [{ where: Record<string, unknown>; data: Record<string, unknown> }]
>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findUnique: (args: unknown) => mockFindUnique(args),
      create: (args: unknown) => mockCreate(args),
      update: (args: unknown) => mockUpdate(args),
      updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) =>
        mockUpdateMany(args),
    },
  },
}));

import { upsertListingMedia } from "../media-sync";

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateMany.mockResolvedValue({ count: 0 });
});

function makeRow(overrides: Partial<UpsertListingMediaInput> = {}): UpsertListingMediaInput {
  return {
    MediaKey: "MK-1",
    ResourceRecordKey: "RRK-100",
    ResourceRecordID: "RLS20012345",
    MediaURL: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc",
    MediaCategory: "Photo",
    MediaStatus: "Active",
    Order: 1,
    PreferredPhotoYN: false,
    ModificationTimestamp: "2026-05-08T12:00:00Z",
    ...overrides,
  };
}

/** The vanished-row tombstone calls = updateMany calls whose where has no `media_key.in`. */
function vanishedCalls() {
  return mockUpdateMany.mock.calls.filter(([args]) => {
    const mk = (args.where as { media_key?: { in?: unknown } }).media_key;
    return !(mk && typeof mk === "object" && "in" in (mk as object));
  });
}

describe("P1C2 — tombstoneVanished must never tombstone crm: rows", () => {
  it("non-empty complete set: the vanished-row where excludes the crm: namespace", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    await upsertListingMedia("RLS20012345", [makeRow()], { tombstoneVanished: true });

    const calls = vanishedCalls();
    expect(calls).toHaveLength(1);
    const where = calls[0][0].where as {
      NOT?: { media_key?: { startsWith?: string } };
      media_key?: { notIn?: string[] };
    };
    expect(where.NOT?.media_key?.startsWith).toBe(CRM_MEDIA_KEY_PREFIX);
    // Trestle vanished-key semantics preserved alongside the guard.
    expect(where.media_key?.notIn).toEqual(["MK-1"]);
  });

  it("empty complete set (tombstone-everything branch): crm: rows still excluded", async () => {
    await upsertListingMedia("RLS20012345", [], { tombstoneVanished: true });

    const calls = vanishedCalls();
    expect(calls).toHaveLength(1);
    const where = calls[0][0].where as {
      listing_id?: string;
      status?: string;
      NOT?: { media_key?: { startsWith?: string } };
    };
    expect(where.listing_id).toBe("RLS20012345");
    expect(where.status).toBe("active");
    expect(where.NOT?.media_key?.startsWith).toBe(CRM_MEDIA_KEY_PREFIX);
  });

  it("explicit MediaStatus='Deleted' branch unchanged (IN-list, inherently crm:-safe)", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(undefined);

    await upsertListingMedia("RLS20012345", [
      makeRow({ MediaKey: "MK-GONE", MediaStatus: "Deleted" }),
    ]);

    const explicitCalls = mockUpdateMany.mock.calls.filter(([args]) => {
      const mk = (args.where as { media_key?: { in?: unknown } }).media_key;
      return !!(mk && typeof mk === "object" && "in" in (mk as object));
    });
    expect(explicitCalls).toHaveLength(1);
    expect(explicitCalls[0][0].where).toEqual({
      listing_id: "RLS20012345",
      status: "active",
      media_key: { in: ["MK-GONE"] },
    });
  });
});
