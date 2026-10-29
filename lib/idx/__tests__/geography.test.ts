/**
 * Live Cotality geography resolver (lib/idx/geography.ts) — unit tests on a small inventory.
 * The inventory shape mirrors Cotality's own groupby((CityRegion,SubdivisionName)) result,
 * where both fields are free text filled by RLS brokers (verified live 2026-10-26).
 */
import { boroughDisplay, geoKey, inventoryFromPairs, resolveBorough, resolveNeighborhoods } from "@/lib/idx/geography";

const geo = inventoryFromPairs([
  { borough: "Manhattan", name: "Soho", sale: 2 },
  { borough: "Manhattan", name: "SOHO", sale: 1 },
  { borough: "Manhattan", name: "SoHo", sale: 9 },
  { borough: "Manhattan", name: "Upper East Side", sale: 400, rental: 20 },
  { borough: "Brooklyn", name: "Bedford-Stuyvesant", sale: 100 },
  { borough: "Brooklyn", name: "Bedford - Stuyvesant", sale: 10 },
  { borough: "Brooklyn", name: "BED-STUY" }, // a live spelling that is itself shorthand
  { borough: "Manhattan", name: "Bedford-Stuyvesant" }, // mis-filed by a broker
  { borough: "Queens", name: "Long Island City", sale: 200 },
  { borough: "StatenIsland", name: "St. George", sale: 3 },
  { borough: "Bronx", name: "BAYCHESTER" },
  { borough: "Manhattan", name: "OTHER", sale: 50 },
  { borough: "Brooklyn", name: "Brooklyn", sale: 5 },
  { borough: "Queens", name: "null" },
]);

describe("normalisation", () => {
  it("ignores case and punctuation", () => {
    expect(geoKey("Bedford - Stuyvesant")).toBe("bedfordstuyvesant");
    expect(geoKey("St. George")).toBe("stgeorge");
    expect(geoKey("  HELL'S Kitchen ")).toBe("hellskitchen");
  });
  it("shows Cotality's StatenIsland with a space and leaves other values as delivered", () => {
    expect(boroughDisplay("StatenIsland")).toBe("Staten Island");
    expect(boroughDisplay("Manhattan")).toBe("Manhattan");
    expect(boroughDisplay("Somewhere")).toBe("Somewhere");
  });
});

describe("inventory", () => {
  it("lists the live boroughs and keeps every live spelling behind one catalog entry", () => {
    expect(geo.boroughs.map((b) => b.value)).toEqual(["Bronx", "Brooklyn", "Manhattan", "Queens", "StatenIsland"]);
    expect(geo.byKey.soho).toEqual(["Soho", "SOHO", "SoHo"]);
    const soho = geo.catalog.find((c) => c.key === "soho")!;
    expect(soho.name).toBe("SoHo"); // the most-listed spelling is shown
    expect(soho.spellings).toHaveLength(3);
    expect(soho.onMarketSale).toBe(12);
  });
  it("files a name under the borough with most listings when brokers disagree", () => {
    const bedStuy = geo.catalog.find((c) => c.key === "bedfordstuyvesant")!;
    expect(bedStuy.borough).toBe("Brooklyn");
    expect(bedStuy.boroughDisplay).toBe("Brooklyn");
  });
  it("leaves placeholders and borough names out of the neighborhood catalog", () => {
    expect(geo.catalog.map((c) => c.key)).not.toContain("other");
    expect(geo.catalog.map((c) => c.key)).not.toContain("brooklyn");
    expect(geo.catalog.map((c) => c.key)).not.toContain("null");
  });
});

describe("resolver", () => {
  it("sends every exact live spelling for a typed name, whatever the case or punctuation", () => {
    expect(resolveNeighborhoods(geo, "soho").exact).toEqual(["Soho", "SOHO", "SoHo"]);
    expect(resolveNeighborhoods(geo, "Bedford Stuyvesant").exact).toEqual(["Bedford-Stuyvesant", "Bedford - Stuyvesant", "BED-STUY"]);
    expect(resolveNeighborhoods(geo, "st george").exact).toEqual(["St. George"]);
    expect(resolveNeighborhoods(geo, "baychester").exact).toEqual(["BAYCHESTER"]);
  });
  it("accepts shorthand as a typing convenience and still sends only live values", () => {
    expect(resolveNeighborhoods(geo, "UES").exact).toEqual(["Upper East Side"]);
    expect(resolveNeighborhoods(geo, "lic").exact).toEqual(["Long Island City"]);
    // "BED-STUY" is a live spelling too; the pick covers it and the place it stands for
    expect(resolveNeighborhoods(geo, "Bed-Stuy").exact).toEqual(["Bedford-Stuyvesant", "Bedford - Stuyvesant", "BED-STUY"]);
    expect(geo.catalog.filter((c) => c.key === "bedstuy")).toHaveLength(0);
    expect(geo.catalog.find((c) => c.key === "bedfordstuyvesant")!.spellings).toContain("BED-STUY");
    // An alias whose target Cotality does not carry resolves to nothing
    expect(resolveNeighborhoods(geo, "FiDi")).toEqual({ exact: [], unresolved: ["FiDi"] });
  });
  it("takes a comma list and reports what Cotality does not carry", () => {
    expect(resolveNeighborhoods(geo, "ues, Atlantis ,lic")).toEqual({ exact: ["Upper East Side", "Long Island City"], unresolved: ["Atlantis"] });
  });
  it("resolves a borough from its live value, its display name or shorthand", () => {
    expect(resolveBorough(geo, "StatenIsland")).toBe("StatenIsland");
    expect(resolveBorough(geo, "Staten Island")).toBe("StatenIsland");
    expect(resolveBorough(geo, "si")).toBe("StatenIsland");
    expect(resolveBorough(geo, "bk")).toBe("Brooklyn");
    expect(resolveBorough(geo, "the bronx")).toBe("Bronx");
    expect(resolveBorough(geo, "Jersey")).toBeNull();
  });
});
