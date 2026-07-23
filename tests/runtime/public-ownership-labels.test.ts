/**
 * PUBLIC OWNERSHIP LABELS (Maya directive 2026-07-23).
 *
 * BUILDING OWNERSHIP determines the ownership label; TRANSACTION TYPE
 * determines For Sale / For Rent — and never overrides ownership.
 * One canonical classifier (lib/listings/ownership.ts) + one canonical DTO
 * field pair (ownershipLabel / transactionLabel); components render the
 * fields and never re-derive ownership.
 *
 * Also pins the NEIGHBORHOOD TAB FILTER FIX: the `propertyType` query param
 * (sent by the Condos/Co-ops tabs) was honored only by the Trestle fallback
 * and silently ignored on the production DB path — every tab returned the
 * same listings. The DB path now filters against the canonical label.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  classifyOwnershipSignals,
  deriveOwnershipLabel,
  deriveTransactionLabel,
  matchesOwnershipFilter,
} from "@/lib/listings/ownership";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ─── 1. The seven required examples ────────────────────────────────────────

describe("canonical rule — all seven required examples", () => {
  const cases: Array<[string, string | null, string, string, string]> = [
    // [commonInterest, subType, listingType, expected transaction, expected ownership]
    ["Condominium", "Apartment", "rent", "For Rent", "Condo"],
    ["StockCooperative", "Apartment", "rent", "For Rent", "Co-op"],
    ["Condop", "Apartment", "rent", "For Rent", "Condop"],
    ["RentalBuilding", "Apartment", "rent", "For Rent", "Rental Building"],
    ["Condominium", "Apartment", "sale", "For Sale", "Condo"],
    ["StockCooperative", "Apartment", "sale", "For Sale", "Co-op"],
    ["Condop", "Apartment", "sale", "For Sale", "Condop"],
  ];
  it.each(cases)(
    "CommonInterest=%s subType=%s type=%s → %s · %s",
    (ci, sub, type, tx, own) => {
      expect(deriveTransactionLabel(type)).toBe(tx);
      expect(deriveOwnershipLabel({ commonInterest: ci, propertySubType: sub, listingType: type })).toBe(own);
    },
  );
});

// ─── 2. Conflicting data + fallbacks ───────────────────────────────────────

describe("conflicts + fallbacks — transaction type never overrides ownership", () => {
  it("rent + Condominium → Condo (never Rental Building, never Apartment)", () => {
    expect(deriveOwnershipLabel({ commonInterest: "Condominium", listingType: "rent" })).toBe("Condo");
  });
  it("rent + Stock Cooperative (spaced variant) → Co-op", () => {
    expect(deriveOwnershipLabel({ commonInterest: "Stock Cooperative", listingType: "rent" })).toBe("Co-op");
  });
  it("rent + Condop → Condop", () => {
    expect(deriveOwnershipLabel({ commonInterest: "Condop", listingType: "rent" })).toBe("Condop");
  });
  it("rent + NO ownership form anywhere → Rental Building (never 'Apartment')", () => {
    expect(deriveOwnershipLabel({ propertySubType: "Apartment", listingType: "rent" })).toBe("Rental Building");
  });
  it("building-level fallbacks: buildingCommonInterest and OwnershipType chains work", () => {
    expect(classifyOwnershipSignals({ buildingCommonInterest: "Condominium" })).toBe("Condo");
    expect(classifyOwnershipSignals({ ownershipType: "Stock Cooperative" })).toBe("Co-op");
    expect(classifyOwnershipSignals({ buildingOwnershipType: "Apartment Building" })).toBe("Rental Building");
  });
  it("structural forms stay themselves (never forced into the 4 ownership forms)", () => {
    expect(deriveOwnershipLabel({ propertySubType: "Townhouse", listingType: "sale" })).toBe("Townhouse");
    expect(deriveOwnershipLabel({ propertySubType: "Single Family Residence", listingType: "sale" })).toBe("House");
    expect(deriveOwnershipLabel({ propertySubType: "Multi Family", listingType: "sale" })).toBe("Multi-Family");
  });
  it("propertySubType is NOT replaced — it remains a separate DTO concept", () => {
    const dto = read("lib/idx/public-dto.ts");
    expect(dto).toContain("propertySubType: listing.propertySubType");
    expect(dto).toContain("ownershipLabel: deriveOwnershipLabel(");
  });
});

// ─── 3. DTO consistency across DB and Cotality/Trestle sources ─────────────

describe("DTO consistency — both builders emit the SAME canonical fields", () => {
  it("both DTO builders derive ownershipLabel + transactionLabel via the ONE canonical module", () => {
    const db = read("lib/idx/db-to-public-dto.ts");
    const tr = read("lib/idx/public-dto.ts");
    for (const src of [db, tr]) {
      expect(src).toContain("deriveOwnershipLabel(");
      expect(src).toContain("deriveTransactionLabel(");
      expect(src).toMatch(/from '@\/lib\/listings\/ownership'/);
    }
  });

  it("no React component re-derives ownership (components render DTO fields only)", () => {
    const components = [
      "app/components/neighborhoods/LiveListingsWidget.tsx",
      "app/components/SearchListingCard.tsx",
      "app/components/FeaturedListings.tsx",
      "app/components/SimilarListings.tsx",
    ];
    for (const rel of components) {
      const src = read(rel);
      expect(src).not.toContain("deriveOwnershipLabel");
      expect(src).not.toContain("classifyOwnershipSignals");
      expect(src).toContain("ownershipLabel");
    }
  });
});

// ─── 4. The neighborhood tab-filter fix ────────────────────────────────────

describe("neighborhood tab filter — propertyType param now honored on the DB path", () => {
  it("SOURCE: the DB post-filters read propertyType and match the canonical label (was silently ignored)", () => {
    const src = read("lib/search/public-listing-db.ts");
    expect(src).toContain('params.get("propertyType")');
    expect(src).toContain("matchesOwnershipFilter(");
  });

  it("BEHAVIORAL: Co-ops tab selects ONLY co-ops; Condo excludes Condop; empty param passes all", () => {
    const mk = (label: string | null) => ({ ownershipLabel: label });
    expect(matchesOwnershipFilter("Co-op", "Co-op" as never)).toBe(true);
    expect(matchesOwnershipFilter("Co-op", "Condo" as never)).toBe(false);
    expect(matchesOwnershipFilter("Condo", "Condop" as never)).toBe(false); // exact — no substring bleed
    expect(matchesOwnershipFilter("Condop", "Condop" as never)).toBe(true);
    expect(matchesOwnershipFilter(null, "Condo" as never)).toBe(true);
    void mk;
  });

  it("BEHAVIORAL: applyPublicListingPostFilters filters a mixed set to the requested ownership", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { applyPublicListingPostFilters } = require("@/lib/search/public-listing-db");
    const listings = [
      { id: "a", propertyType: "Condo", ownershipLabel: "Condo" },
      { id: "b", propertyType: "Co-op", ownershipLabel: "Co-op" },
      { id: "c", propertyType: "Condop", ownershipLabel: "Condop" },
      { id: "d", propertyType: "Apartment", ownershipLabel: "Rental Building" },
    ];
    const params = (q: string) => new URLSearchParams(q);
    const ids = (r: Array<{ id: string }>) => r.map((x) => x.id);
    expect(ids(applyPublicListingPostFilters(listings, new Map(), params("propertyType=Co-op")))).toEqual(["b"]);
    expect(ids(applyPublicListingPostFilters(listings, new Map(), params("propertyType=Condo")))).toEqual(["a"]);
    expect(ids(applyPublicListingPostFilters(listings, new Map(), params("propertyType=Rental+Building")))).toEqual(["d"]);
    expect(ids(applyPublicListingPostFilters(listings, new Map(), params("")))).toEqual(["a", "b", "c", "d"]);
    // precedence: ownershipTypes wins over propertyType (same as the Trestle path)
    expect(
      ids(applyPublicListingPostFilters(listings, new Map(), params("propertyType=Co-op&ownershipTypes=Condo"))),
    ).toEqual(["a"]);
  });
});

// ─── 4b. DB-path filter proof with EXACT params + listing IDs (Maya) ──────

describe("DB-first path filter proof — exact request parameters and returned listing IDs", () => {
  // Realistic RLS-style fixture set: 2 condos, 2 co-ops, 1 condop, 1 rental-
  // building rental — the composition of a real neighborhood result page.
  const FIXTURES = [
    { id: "RLS20000001", propertyType: "Condo", ownershipLabel: "Condo" },
    { id: "RLS20000002", propertyType: "Condo", ownershipLabel: "Condo" },
    { id: "RLS20000003", propertyType: "Co-op", ownershipLabel: "Co-op" },
    { id: "RLS20000004", propertyType: "Co-op", ownershipLabel: "Co-op" },
    { id: "RLS20000005", propertyType: "Condop", ownershipLabel: "Condop" },
    { id: "RLS20000006", propertyType: "Apartment", ownershipLabel: "Rental Building" },
  ];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { applyPublicListingPostFilters } = require("@/lib/search/public-listing-db");
  const run = (qs: string) =>
    applyPublicListingPostFilters(FIXTURES, new Map(), new URLSearchParams(qs)).map((l: { id: string }) => l.id);

  it("params: propertyType=Condo → ONLY [RLS20000001, RLS20000002] (Condop does NOT leak)", () => {
    expect(run("propertyType=Condo")).toEqual(["RLS20000001", "RLS20000002"]);
  });

  it("params: propertyType=Co-op → ONLY [RLS20000003, RLS20000004]", () => {
    expect(run("propertyType=Co-op")).toEqual(["RLS20000003", "RLS20000004"]);
  });

  it("the Condo and Co-op result sets are fully DISTINCT (the production defect: they were identical)", () => {
    const condos = new Set(run("propertyType=Condo"));
    const coops = run("propertyType=Co-op");
    expect(coops.some((id: string) => condos.has(id))).toBe(false);
  });

  it("params: propertyType=Condop → ONLY [RLS20000005]; propertyType=Rental Building → ONLY [RLS20000006]", () => {
    expect(run("propertyType=Condop")).toEqual(["RLS20000005"]);
    expect(run("propertyType=Rental+Building")).toEqual(["RLS20000006"]);
  });

  it("propertyType is NOT silently ignored: filtered results differ from the unfiltered set", () => {
    const all = run("");
    expect(all).toHaveLength(6);
    expect(run("propertyType=Condo")).not.toEqual(all);
  });
});

// ─── 5. Surface rendering pins ─────────────────────────────────────────────

describe("surface pins — every required public surface renders the canonical fields", () => {
  it("neighborhood cards: label near the price + NEVER-floorplan thumbnail", () => {
    const src = read("app/components/neighborhoods/LiveListingsWidget.tsx");
    expect(src).toContain("listing.transactionLabel || (isRental ? 'For Rent' : 'For Sale')");
    expect(src).toMatch(/listing\.ownershipLabel \? ` · \$\{listing\.ownershipLabel\}` : ''/);
    expect(src).toContain("getSearchThumbnail(listing.media)");
    expect(src).not.toContain("getPrimaryPhoto(");
  });

  it("search cards: ownership-first type line", () => {
    const src = read("app/components/SearchListingCard.tsx");
    expect(src).toContain("listing.ownershipLabel || listing.propertyType");
  });

  it("featured cards: ownership-first, subtype preserved as fallback", () => {
    const src = read("app/components/FeaturedListings.tsx");
    expect(src).toContain("listing.ownershipLabel || listing.propertySubType || listing.propertyType");
  });

  it("similar cards: ownership-first", () => {
    const src = read("app/components/SimilarListings.tsx");
    expect(src).toMatch(/ownershipLabel \|\|/);
  });

  it("listing detail: facts type is ownership-first; metadata descriptions use the canonical label; isCoop is canonical", () => {
    const src = read("app/listing/[...slug]/page.tsx");
    expect(src).toContain("const displayPropertyType = listing.ownershipLabel ||");
    expect((src.match(/ownershipLabel \|\| listing\.propertyType\} in/g) ?? []).length).toBe(3);
    expect(src).toContain("listing.ownershipLabel === 'Co-op'");
    expect(src).toContain("ownershipLabel: deriveOwnershipLabel({");
  });

  it("display adapter passes the canonical pair through to card consumers", () => {
    const src = read("lib/idx/display-adapter.ts");
    expect(src).toContain("ownershipLabel: dto.ownershipLabel ?? null");
    expect(src).toContain("transactionLabel: dto.transactionLabel");
  });
});

// ─── 6. COMPLETE TAXONOMY (Maya 2026-07-23 CHANGES-REQUIRED round) ─────────
// Production inventory (read-only census, 2026-07-23): CommonInterest ∈
// {Condominium, StockCooperative, Condop, RentalBuilding, None};
// PropertySubType ∈ {Apartment, MultiFamily, SingleFamilyResidence, Duplex,
// Loft, Triplex, MixedUse, Townhouse} — space-less PascalCase. Loft/Duplex/
// Triplex are UNIT forms and stay propertySubType; the building-form taxonomy
// is Condo · Co-op · Condop · Rental Building · Townhouse · House ·
// Multi-Family · Mixed-Use.

describe("complete taxonomy — classifier covers every live building form", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { deriveOwnershipLabel } = require("@/lib/listings/ownership");

  it("live PascalCase sub-types classify structurally (SingleFamilyResidence → House, MultiFamily → Multi-Family, MixedUse → Mixed-Use, Townhouse → Townhouse)", () => {
    expect(deriveOwnershipLabel({ propertySubType: "SingleFamilyResidence" })).toBe("House");
    expect(deriveOwnershipLabel({ propertySubType: "MultiFamily" })).toBe("Multi-Family");
    expect(deriveOwnershipLabel({ propertySubType: "MixedUse" })).toBe("Mixed-Use");
    expect(deriveOwnershipLabel({ propertySubType: "Townhouse" })).toBe("Townhouse");
  });

  it("ownership signals beat structural sub-type; CommonInterest='None' is not a signal", () => {
    expect(deriveOwnershipLabel({ commonInterest: "Condominium", propertySubType: "Duplex" })).toBe("Condo");
    expect(deriveOwnershipLabel({ commonInterest: "None", propertySubType: "MultiFamily" })).toBe("Multi-Family");
    expect(deriveOwnershipLabel({ commonInterest: "None", propertySubType: "SingleFamilyResidence" })).toBe("House");
  });
});

describe("full-taxonomy DB-path proof — exact request parameters and returned listing IDs", () => {
  // 12-fixture neighborhood: every building form + rentals inside condo/co-op.
  const FULL = [
    { id: "RLS20000001", listingType: "sale", propertyType: "Condo", ownershipLabel: "Condo" },
    { id: "RLS20000002", listingType: "sale", propertyType: "Condo", ownershipLabel: "Condo" },
    { id: "RLS20000003", listingType: "sale", propertyType: "Co-op", ownershipLabel: "Co-op" },
    { id: "RLS20000004", listingType: "sale", propertyType: "Co-op", ownershipLabel: "Co-op" },
    { id: "RLS20000005", listingType: "sale", propertyType: "Condop", ownershipLabel: "Condop" },
    { id: "RLS20000006", listingType: "rent", propertyType: "Apartment", ownershipLabel: "Rental Building" },
    { id: "RLS20000007", listingType: "sale", propertyType: "Townhouse", ownershipLabel: "Townhouse" },
    { id: "RLS20000008", listingType: "sale", propertyType: "SingleFamilyResidence", ownershipLabel: "House" },
    { id: "RLS20000009", listingType: "sale", propertyType: "MultiFamily", ownershipLabel: "Multi-Family" },
    { id: "RLS20000010", listingType: "sale", propertyType: "MixedUse", ownershipLabel: "Mixed-Use" },
    { id: "RLS20000011", listingType: "rent", propertyType: "Condo", ownershipLabel: "Condo" },
    { id: "RLS20000012", listingType: "rent", propertyType: "Co-op", ownershipLabel: "Co-op" },
  ];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { applyPublicListingPostFilters } = require("@/lib/search/public-listing-db");
  const run = (qs: string, rows: typeof FULL = FULL) =>
    applyPublicListingPostFilters(rows, new Map(), new URLSearchParams(qs)).map((l: { id: string }) => l.id);
  // `type` is a Prisma-level where clause upstream of the post-filter; the
  // combined-selection runs model it by pre-narrowing on listingType exactly
  // as buildPublicListingDbSearch does.
  const rentOnly = FULL.filter((l) => l.listingType === "rent");
  const saleOnly = FULL.filter((l) => l.listingType === "sale");

  it("params: propertyType=Townhouse → ONLY [RLS20000007]", () => {
    expect(run("propertyType=Townhouse")).toEqual(["RLS20000007"]);
  });

  it("params: propertyType=House → ONLY [RLS20000008]", () => {
    expect(run("propertyType=House")).toEqual(["RLS20000008"]);
  });

  it("params: propertyType=Multi-Family → ONLY [RLS20000009] (not hidden inside All)", () => {
    expect(run("propertyType=Multi-Family")).toEqual(["RLS20000009"]);
  });

  it("params: propertyType=Mixed-Use → ONLY [RLS20000010]", () => {
    expect(run("propertyType=Mixed-Use")).toEqual(["RLS20000010"]);
  });

  it("params: propertyType=Condo includes RENTALS in condos → [RLS20000001, RLS20000002, RLS20000011]", () => {
    expect(run("propertyType=Condo")).toEqual(["RLS20000001", "RLS20000002", "RLS20000011"]);
  });

  it("COMBINED params: type=rent + propertyType=Condo → ONLY [RLS20000011] (rental in a condo)", () => {
    expect(run("type=rent&propertyType=Condo", rentOnly)).toEqual(["RLS20000011"]);
  });

  it("COMBINED params: type=rent + propertyType=Co-op → ONLY [RLS20000012] (rental in a co-op)", () => {
    expect(run("type=rent&propertyType=Co-op", rentOnly)).toEqual(["RLS20000012"]);
  });

  it("COMBINED params: type=sale + propertyType=Condo → ONLY [RLS20000001, RLS20000002]", () => {
    expect(run("type=sale&propertyType=Condo", saleOnly)).toEqual(["RLS20000001", "RLS20000002"]);
  });

  it("every building-form filter returns a disjoint, non-empty set; union of forms covers all 12", () => {
    const forms = ["Condo", "Co-op", "Condop", "Rental Building", "Townhouse", "House", "Multi-Family", "Mixed-Use"];
    const seen = new Set<string>();
    for (const f of forms) {
      const ids = run(`propertyType=${encodeURIComponent(f)}`);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(12);
  });
});

// ─── 7. Neighborhood two-row filter UI (transaction × building form) ───────

describe("neighborhood widget — two-row combinable filter taxonomy", () => {
  const src = read("app/components/neighborhoods/LiveListingsWidget.tsx");

  it("ROW 1 (transaction) exposes All / For Sale / For Rent", () => {
    expect(src).toContain("TRANSACTION_TABS");
    expect(src).toContain("label: 'For Sale'");
    expect(src).toContain("label: 'For Rent'");
  });

  it("ROW 2 (building form) exposes the COMPLETE taxonomy — nothing hidden inside All", () => {
    expect(src).toContain("PROPERTY_TYPE_TABS");
    for (const pin of [
      "propertyType: 'Condo'",
      "propertyType: 'Co-op'",
      "propertyType: 'Condop'",
      "propertyType: 'Rental Building'",
      "propertyType: 'Townhouse'",
      "propertyType: 'House'",
      "propertyType: 'Multi-Family'",
      "propertyType: 'Mixed-Use'",
    ]) {
      expect(src).toContain(pin);
    }
    expect(src).toContain("label: 'House / Single-Family'");
  });

  it("rows are combinable: one query carries BOTH type and propertyType (For Rent + Condo → rentals in condos)", () => {
    expect(src).toMatch(/params\.set\('type', /);
    expect(src).toMatch(/params\.set\('propertyType', /);
  });

  it("mobile: both filter rows scroll horizontally instead of dropping categories", () => {
    expect((src.match(/overflow-x-auto/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

// ─── 8. Trestle fallback path honors the full taxonomy ─────────────────────

describe("Trestle fallback path — full taxonomy is filterable, fail-closed on OData limits", () => {
  it("Rental Building pushes via CommonInterest (safe); structural forms are NOT pushed as PropertySubType (502)", () => {
    const src = read("lib/search/public-listing-trestle.ts");
    expect(src).toContain(`"Rental Building": "RentalBuilding"`);
    expect(src).not.toContain("PropertySubType eq 'Townhouse'");
  });

  it("route post-filters propertyType against the canonical classifier BEFORE pagination", () => {
    const src = read("app/api/listings/route.ts");
    expect(src).toContain("deriveOwnershipLabel");
    expect(src).toContain("matchesOwnershipFilter");
    expect(src).toMatch(/hasPostFilter = .*propertyType/s);
  });
});
