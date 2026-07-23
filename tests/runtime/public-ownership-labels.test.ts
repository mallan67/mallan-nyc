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
