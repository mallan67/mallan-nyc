/**
 * EVERY provider token in the Search map must be LIVE-PRESENT.
 *
 * Enum membership is NOT sufficient. A token can be a perfectly valid member of
 * the live Cotality enum and still appear on zero listings — `Skyline`,
 * `Downtown` and `Remodeled` all are. A filter built on one matches nothing and
 * fails silently, which is indistinguishable to a user from "no results".
 *
 * The census in `data/cotality-live-token-census.json` is EXHAUSTIVE (every
 * Active row followed through `@odata.nextLink`, coverage complete) and is
 * DATED EVIDENCE, not authority — regenerate it and diff, never treat it as the
 * provider contract. Its job here is to stop a stale literal from being
 * reintroduced without anyone noticing.
 *
 * Stale tokens this guards, all found live-absent on 2026-08-19:
 *   RoofDeck · OnCommonFloor · UnitYes · Park · WalkInCloset · HighCeiling
 *   WasherDryer · Skyline · Downtown · Renovated · GutRenovated · NewlyRenovated
 *   NaturalLight · Quiet · NoFee · OwnerPays
 */
import census from "@/data/cotality-live-token-census.json";
import { AMENITY_TOKENS } from "@/lib/search/canonical/amenity-vocabulary";
import {
  UNSUPPORTED_AMENITY_KEYS,
  isAmenityExecutable,
  amenityRefusalReason,
} from "@/lib/search/canonical/field-registry";
import { satisfiedAmenityKeys } from "@/lib/search/canonical/amenity-match";

const tokens = census.tokens as Record<string, Record<string, number>>;

describe("amenity tokens are present in the live feed, not merely valid", () => {
  it("the census it guards against is exhaustive", () => {
    expect(census.coverage_complete).toBe(true);
    expect(census.rows_read).toBe(census.provider_declared);
  });

  it.each(
    Object.keys(AMENITY_TOKENS).filter(
      (k) => !UNSUPPORTED_AMENITY_KEYS.has(k) && AMENITY_TOKENS[k].match !== "isTrue",
    ),
  )("%s matches at least one live-present token", (key) => {
    const mapping = AMENITY_TOKENS[key];
    const fields = mapping.field.split(",").map((f) => f.trim());
    const livePresent = mapping.values.filter((v) =>
      fields.some((f) => (tokens[f]?.[v] ?? 0) > 0),
    );
    // Every value must be live-present — a dead literal ORed alongside a live
    // one is invisible until the live one is removed.
    expect(livePresent.sort()).toEqual([...mapping.values].sort());
    expect(livePresent.length).toBeGreaterThan(0);
  });

  it("known-stale literals are gone from the map entirely", () => {
    const serialized = JSON.stringify(AMENITY_TOKENS);
    for (const stale of [
      "UnitYes", "OnCommonFloor", "WalkInCloset\"", "HighCeiling\"",
      "GutRenovated", "NewlyRenovated", "NaturalLight", "NoFee", "OwnerPays",
    ]) {
      expect(serialized).not.toContain(stale);
    }
  });

  it("an amenity with no live-present token is classified unavailable", () => {
    // `renovated` points at `Remodeled` — a real live enum member with ZERO
    // live rows. It must be unavailable rather than silently matching nothing.
    expect(tokens.InteriorFeatures?.Remodeled ?? 0).toBe(0);
    expect(UNSUPPORTED_AMENITY_KEYS.has("renovated")).toBe(true);
  });
});

/**
 * SEMANTIC LEAK GUARD — a matching token must not become a stronger fact.
 *
 * Mechanical matchability and business-semantic validity are separate gates.
 * `Concierge` is live, populated on 1,523 listings, and matches the `doorman`
 * token list cleanly. It is still not a doorman.
 *
 * The derivation therefore stores the OBSERVATION and withholds the CONCLUSION,
 * so no evidence is lost and no unproven equivalence enters the projection.
 */
describe("semantically unproven tokens never become canonical conclusions", () => {
  const derive = (payload: Record<string, unknown>) => satisfiedAmenityKeys(payload, null);

  it("Concierge yields concierge-present, NEVER doorman", () => {
    const keys = derive({ BuildingFeatures: "Concierge,Elevators" });
    expect(keys).toContain("concierge-present");
    expect(keys).not.toContain("doorman");
    // the proven amenity alongside it is unaffected
    expect(keys).toContain("elevator");
  });

  it("GarageYN yields garage-present, NEVER generic parking", () => {
    const keys = derive({ GarageYN: true });
    expect(keys).toContain("garage-present");
    expect(keys).not.toContain("garage");
  });

  it("City views yield city-view-present, NEVER skyline-views", () => {
    const keys = derive({ View: "City,CityLights" });
    expect(keys).toContain("city-view-present");
    expect(keys).not.toContain("skyline-views");
  });

  it("refuses to EXECUTE an unproven amenity, with a reason", () => {
    for (const key of ["doorman", "garage", "skyline-views"]) {
      expect(isAmenityExecutable(key)).toBe(false);
      expect(amenityRefusalReason(key)).toBe("SEMANTIC_EQUIVALENCE_UNPROVEN");
    }
  });

  it("distinguishes an unproven amenity from an unbacked one", () => {
    // Different causes must not collapse — one is a missing proof, the other a
    // missing token.
    expect(amenityRefusalReason("doorman")).toBe("SEMANTIC_EQUIVALENCE_UNPROVEN");
    expect(amenityRefusalReason("no-fee")).toBe("NO_LIVE_TOKEN");
    expect(amenityRefusalReason("elevator")).toBeNull();
  });

  it("still executes amenities whose meaning IS established", () => {
    for (const key of ["elevator", "dishwasher", "pet-friendly", "washer-dryer"]) {
      expect(isAmenityExecutable(key)).toBe(true);
    }
  });
});
