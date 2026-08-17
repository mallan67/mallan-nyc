/**
 * E-0 — PROVIDER MEDIA DISPLAY AUTHORIZATION.
 *
 * ── THE PROVIDER CONTRACT THIS ENCODES (live, read-only, 2026-08-17) ────────
 * `Media.InternetEntireListingDisplayYN` — `Edm.Boolean`, filterable, sortable,
 * populated on 5,000/5,000 sampled rows. Feed-wide at probe time:
 *   eq false = 278,927   eq true = 1,690,352   eq null = 62
 *
 * SEMANTICS ESTABLISHED BY BEHAVIOUR, NOT BY THE FIELD'S NAME:
 *   - Across 4,132 listings, ZERO carried a MIX of true and false media
 *     (4,066 uniformly true, 35 uniformly false) ⇒ it is a LISTING-level
 *     display flag denormalised onto every media row, NOT a per-photo ACL.
 *   - 55/55 sampled listings whose media is `false` were ABSENT from the
 *     Property feed ⇒ under normal sync those rows are unreachable, because
 *     every Mallan media fetch is keyed on a listing obtained from Property.
 *
 * NO VIOLATION COUNT IS CLAIMED. The residual risk this closes is narrow and
 * specific: a listing delivered by Property at sync time and LATER withdrawn
 * from that feed, whose Media rows persist carrying `false`. Nothing else in
 * the pipeline can observe that transition, because before this change no fetch
 * path requested the field.
 *
 * NULL IS NOT SUPPRESSION. Only an explicit `false` blocks — the same IDX Plus
 * pre-filter rule `computeGateColumns` applies to the Property-side gates.
 */

interface ListingMediaRow {
  id?: bigint;
  listing_id: string;
  media_key?: string | null;
  media_url_original?: string | null;
  status?: string;
}

const mockFindUnique = jest.fn<Promise<ListingMediaRow | null>, [unknown]>();
const mockCreate = jest.fn<Promise<unknown>, [unknown]>();
const mockUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockUpdateMany = jest.fn<Promise<{ count: number }>, [unknown]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      findUnique: (a: unknown) => mockFindUnique(a),
      create: (a: unknown) => mockCreate(a),
      update: (a: unknown) => mockUpdate(a),
      updateMany: (a: unknown) => mockUpdateMany(a),
    },
  },
}));

import * as fs from "node:fs";
import * as path from "node:path";
import { upsertListingMedia, type UpsertListingMediaInput } from "../media-sync";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const row = (over: Partial<UpsertListingMediaInput> = {}): UpsertListingMediaInput => ({
  MediaKey: "MK-1",
  ResourceRecordKey: "1147686760",
  ResourceRecordID: "RLS20063016",
  MediaURL: "https://api.cotality.com/trestle/Media/Property/DOCUMENT-Jpeg/1/1/a/b/c",
  MediaCategory: "Photo",
  MediaClassification: "PHOTO",
  MediaStatus: "Active",
  Order: 1,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFindUnique.mockResolvedValue(null); // every row is an INSERT unless stated
  mockCreate.mockResolvedValue({});
  mockUpdate.mockResolvedValue({});
  mockUpdateMany.mockResolvedValue({ count: 0 });
});

describe("E-0 — upsertListingMedia refuses provider-unauthorized media", () => {
  it("rejects a row flagged InternetEntireListingDisplayYN=false and never writes it", async () => {
    const res = await upsertListingMedia("RLS20063016", [
      row({ MediaKey: "MK-1", InternetEntireListingDisplayYN: false }),
    ]);

    expect(res.skippedUnauthorizedDisplay).toBe(1);
    expect(res.inserted).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    // It is an AUTHORIZATION refusal, not a malformed row — the two counters
    // must never be conflated.
    expect(res.skippedInvalid).toBe(0);
  });

  it("admits true and null/absent — null is NOT suppression", async () => {
    const res = await upsertListingMedia("RLS20063016", [
      row({ MediaKey: "MK-t", InternetEntireListingDisplayYN: true }),
      row({ MediaKey: "MK-n", InternetEntireListingDisplayYN: null }),
      row({ MediaKey: "MK-a" }), // field absent entirely
    ]);

    expect(res.skippedUnauthorizedDisplay).toBe(0);
    expect(res.inserted).toBe(3);
  });

  it("a suppressed row cannot become hero merely by carrying Order=1", async () => {
    // Authorization must precede hero/order handling: an ineligible row must not
    // win hero selection just because it sorts first.
    const res = await upsertListingMedia("RLS20063016", [
      row({ MediaKey: "MK-hero", Order: 1, PreferredPhotoYN: true, InternetEntireListingDisplayYN: false }),
      row({ MediaKey: "MK-ok", Order: 2, InternetEntireListingDisplayYN: true }),
    ]);

    expect(res.skippedUnauthorizedDisplay).toBe(1);
    expect(res.inserted).toBe(1);
    const written = mockCreate.mock.calls.map((c) => (c[0] as { data: { media_key: string } }).data.media_key);
    expect(written).toEqual(["MK-ok"]);
    expect(written).not.toContain("MK-hero");
  });

  it("mixed sets degrade to the conservative per-row reading", async () => {
    // Live evidence says the flag is listing-level (0 of 4,132 listings mixed),
    // so this case should not occur. If it ever does, per-row enforcement blocks
    // only the flagged rows rather than over-blocking authorized photos.
    const res = await upsertListingMedia("RLS20063016", [
      row({ MediaKey: "A", InternetEntireListingDisplayYN: true }),
      row({ MediaKey: "B", InternetEntireListingDisplayYN: false }),
      row({ MediaKey: "C", InternetEntireListingDisplayYN: true }),
    ]);
    expect(res.inserted).toBe(2);
    expect(res.skippedUnauthorizedDisplay).toBe(1);
  });

  it("the input ledger still balances with the new bucket", async () => {
    const input = [
      row({ MediaKey: "A", InternetEntireListingDisplayYN: true }),
      row({ MediaKey: "B", InternetEntireListingDisplayYN: false }),
      row({ MediaKey: "C", MediaURL: null }), // invalid
      row({ MediaKey: "D", MediaStatus: "Deleted" }), // delete signal
    ];
    const r = await upsertListingMedia("RLS20063016", input);
    const ledger =
      r.inserted + r.updatedChanged + r.skippedUnchanged +
      r.skippedInvalid + r.skippedUnauthorizedDisplay + r.deleteSignalsReceived;
    expect(ledger).toBe(input.length);
  });
});

describe("E-0 — every live Cotality Media fetch path requests the field", () => {
  // Requesting is a precondition for enforcing: a path that omits the field
  // from `$select` receives `undefined` and silently authorizes everything.
  const paths: Array<[string, string]> = [
    ["lib/idx/media-sync.ts", "defaultFetchMedia (canonical persistence path)"],
    ["lib/idx/fetch.ts", "fetchListingMedia + $expand=Media"],
    ["lib/idx/sync.ts", "batch-media x3"],
    ["app/api/media/batch/route.ts", "media batch route x2"],
    ["app/api/idx/search/route.ts", "search card backfill"],
    ["app/api/agents/[slug]/listings/route.ts", "agent page cards"],
  ];

  it.each(paths)("%s requests InternetEntireListingDisplayYN (%s)", (rel) => {
    expect(read(rel)).toContain("InternetEntireListingDisplayYN");
  });

  it("every media field-list literal that names MediaURL also names the auth field", () => {
    // Catches a NEW fetch path being added without authorization.
    //
    // Matches STRING LITERALS rather than `$select`-to-end-of-line: the
    // canonical path in media-sync.ts puts `"$select",` and the field list on
    // separate lines, so a line-scoped regex silently matches nothing and the
    // guard passes vacuously. A field list is a literal containing `MediaURL`
    // AND a comma (excludes bare `"MediaURL"` field-name references).
    let listsChecked = 0;
    for (const [rel] of paths) {
      let src = read(rel);

      // EXCLUDE the dead `backfillEmptyMedia` writer in sync.ts. It has no
      // caller and `media-key-write-suppression.test.ts` pins it as
      // out-of-scope, so E-0 is deliberately NOT applied to it — authorizing
      // unreachable code would widen the PR for zero live effect. Excluded
      // here rather than silently tolerated, so the sweep stays exhaustive
      // over paths that can actually execute.
      if (rel === "lib/idx/sync.ts") {
        const dead = src.indexOf("export async function backfillEmptyMedia");
        if (dead !== -1) {
          const after = src.indexOf("\nexport ", dead + 1);
          src = src.slice(0, dead) + (after === -1 ? "" : src.slice(after));
        }
      }

      const literals = [
        ...(src.match(/"[^"\n]*MediaURL[^"\n]*"/g) || []),
        ...(src.match(/'[^'\n]*MediaURL[^'\n]*'/g) || []),
      ].filter((s) => s.includes(","));

      expect(literals.length).toBeGreaterThan(0);
      for (const literal of literals) {
        expect(literal).toContain("InternetEntireListingDisplayYN");
      }
      listsChecked += literals.length;
    }
    // Pin the count so a path deleted (rather than fixed) is also caught.
    // 9 = 10 live field lists minus the pinned-dead backfillEmptyMedia one.
    expect(listsChecked).toBe(9);
  });

  it("fetchListingMedia refuses suppressed rows, not merely requests them", () => {
    const src = read("lib/idx/fetch.ts");
    expect(src).toContain("InternetEntireListingDisplayYN !== false");
  });
});
