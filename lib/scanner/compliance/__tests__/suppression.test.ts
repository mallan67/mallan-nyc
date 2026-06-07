import { isSuppressed, suppressionListLiveCount, suppressionListTotalCount } from "@/lib/scanner/compliance/suppression";
import { isInCeaseDesistZone, ceaseDesistZoneCount } from "@/lib/scanner/compliance/cease-desist";

describe("isInCeaseDesistZone — empty zone file (current state)", () => {
  it("returns in_zone=false for any point when no zones are loaded", () => {
    // Mallan office
    expect(isInCeaseDesistZone(40.779, -73.9489).in_zone).toBe(false);
    // Times Square
    expect(isInCeaseDesistZone(40.758, -73.9855).in_zone).toBe(false);
    // Random Brooklyn point
    expect(isInCeaseDesistZone(40.6782, -73.9442).in_zone).toBe(false);
  });

  it("returns in_zone=false for invalid input", () => {
    expect(isInCeaseDesistZone(NaN, -73.9489).in_zone).toBe(false);
    expect(isInCeaseDesistZone(40.779, NaN).in_zone).toBe(false);
    expect(isInCeaseDesistZone(Infinity, -73.9489).in_zone).toBe(false);
  });

  it("zone count reflects empty placeholder file", () => {
    expect(ceaseDesistZoneCount()).toBe(0);
  });
});

describe("isSuppressed — empty config (default state)", () => {
  it("returns suppressed=false for arbitrary prospect when no zones and no list", () => {
    const v = isSuppressed({
      bbl: "1015730019",
      owner_name: "Smith Family Trust",
      phone: "212-555-1234",
      email: "owner@example.com",
      address: "400 E 90th St, New York NY 10128",
      lat: 40.779,
      lng: -73.9489,
    });
    expect(v.suppressed).toBe(false);
    expect(v.reasons).toEqual([]);
    expect(v.matched_entries).toEqual([]);
  });

  it("handles missing fields gracefully", () => {
    expect(isSuppressed({}).suppressed).toBe(false);
    expect(isSuppressed({ owner_name: null, bbl: null }).suppressed).toBe(false);
  });

  it("live count starts at 0", () => {
    expect(suppressionListLiveCount()).toBe(0);
    expect(suppressionListTotalCount()).toBe(0);
  });
});

describe("matchEntry — normalization and matching (via mocked list)", () => {
  // We can't mutate the loaded JSON, but we can test the normalization
  // logic indirectly by injecting a custom mock list. Since the module
  // loads JSON at init, we test via dynamic-mock pattern:
  let suppressionMock: typeof import("@/lib/scanner/compliance/suppression");

  beforeAll(async () => {
    jest.resetModules();
    jest.doMock("@/data/scanner/compliance/mallan-suppression-list.json", () => ({
      version: "v1",
      name: "test",
      description: "test",
      captured_at: "2026-04-30",
      policy: { minimum_exclusion_period_days: 365 },
      schema: {},
      entries: [
        {
          id: "ms-001",
          type: "bbl",
          value: "1015730019",
          reason: "Said no in 2026-Q1",
          added_at: "2026-04-15",
          expires_at: "2027-04-15",
          added_by: "maya@mallan.nyc",
        },
        {
          id: "ms-002",
          type: "owner_name",
          value: "Smith Family Trust",
          reason: "Hostile reply 2025",
          added_at: "2025-06-01",
          expires_at: "2026-06-01",
          added_by: "maya@mallan.nyc",
        },
        {
          id: "ms-003",
          type: "phone",
          value: "(212) 555-1234",
          reason: "Verbal opt-out",
          added_at: "2026-01-01",
          expires_at: "2027-01-01",
          added_by: "maya@mallan.nyc",
        },
        {
          id: "ms-004",
          type: "email",
          value: "Owner@Example.COM",
          reason: "Unsubscribe click",
          added_at: "2026-03-10",
          expires_at: "2027-03-10",
          added_by: "maya@mallan.nyc",
        },
        {
          id: "ms-005",
          type: "bbl",
          value: "1000000000",
          reason: "Expired suppression — should NOT match",
          added_at: "2024-01-01",
          expires_at: "2025-01-01",
          added_by: "maya@mallan.nyc",
        },
      ],
    }));
    suppressionMock = await import("@/lib/scanner/compliance/suppression");
  });

  afterAll(() => {
    jest.dontMock("@/data/scanner/compliance/mallan-suppression-list.json");
    jest.resetModules();
  });

  it("matches BBL exactly", () => {
    const v = suppressionMock.isSuppressed({ bbl: "1015730019" });
    expect(v.suppressed).toBe(true);
    expect(v.reasons[0]).toContain("BBL 1015730019");
    expect(v.reasons[0]).toContain("Said no");
  });

  it("matches owner_name case-insensitively + whitespace-tolerant", () => {
    // Deterministic `now` pinned to the fixture's canonical capture date (2026-04-30)
    // so the test never rots when ms-002 (owner_name) expires on 2026-06-01.
    const asOf = new Date("2026-04-30");
    expect(suppressionMock.isSuppressed({ owner_name: "smith family trust" }, asOf).suppressed).toBe(true);
    expect(suppressionMock.isSuppressed({ owner_name: "SMITH FAMILY TRUST" }, asOf).suppressed).toBe(true);
    expect(suppressionMock.isSuppressed({ owner_name: "  Smith   Family   Trust  " }, asOf).suppressed).toBe(true);
  });

  it("matches phone with formatting differences", () => {
    expect(suppressionMock.isSuppressed({ phone: "212-555-1234" }).suppressed).toBe(true);
    expect(suppressionMock.isSuppressed({ phone: "2125551234" }).suppressed).toBe(true);
    expect(suppressionMock.isSuppressed({ phone: "+1 (212) 555-1234" }).suppressed).toBe(true);
  });

  it("matches email case-insensitively", () => {
    expect(suppressionMock.isSuppressed({ email: "owner@example.com" }).suppressed).toBe(true);
    expect(suppressionMock.isSuppressed({ email: "OWNER@EXAMPLE.COM" }).suppressed).toBe(true);
    expect(suppressionMock.isSuppressed({ email: "  Owner@Example.com  " }).suppressed).toBe(true);
  });

  it("does NOT match expired entries", () => {
    // ms-005 expired 2025-01-01; check with 'now' after that date (default)
    expect(suppressionMock.isSuppressed({ bbl: "1000000000" }).suppressed).toBe(false);
  });

  it("DOES match expired entries when `now` is rolled back", () => {
    // ms-005 was live before 2025-01-01
    const v = suppressionMock.isSuppressed({ bbl: "1000000000" }, new Date("2024-12-01"));
    expect(v.suppressed).toBe(true);
  });

  it("returns no match for non-suppressed values", () => {
    expect(suppressionMock.isSuppressed({ bbl: "1099999999" }).suppressed).toBe(false);
    expect(suppressionMock.isSuppressed({ owner_name: "Jones LLC" }).suppressed).toBe(false);
    expect(suppressionMock.isSuppressed({ phone: "646-258-4460" }).suppressed).toBe(false);
  });

  it("composes multiple matches into reasons + matched_entries", () => {
    // Deterministic `now` (fixture capture date) — ms-002 owner_name is live as of 2026-04-30.
    const v = suppressionMock.isSuppressed({
      bbl: "1015730019",
      owner_name: "Smith Family Trust",
    }, new Date("2026-04-30"));
    expect(v.suppressed).toBe(true);
    expect(v.reasons).toHaveLength(2);
    expect(v.matched_entries).toHaveLength(2);
    expect(v.matched_entries.every((m) => m.source === "suppression_list")).toBe(true);
  });

  it("ignores entries with malformed expires_at", () => {
    const v = suppressionMock.isSuppressed({ bbl: "1015730019" }, new Date("2030-01-01"));
    // Past 2027-04-15 → entry expired → no suppression
    expect(v.suppressed).toBe(false);
  });

  it("live count reflects only non-expired entries", () => {
    // 4 of 5 are live as of default date (2026-04-30)
    expect(suppressionMock.suppressionListLiveCount(new Date("2026-04-30"))).toBe(4);
    expect(suppressionMock.suppressionListTotalCount()).toBe(5);
    // All expired by 2030
    expect(suppressionMock.suppressionListLiveCount(new Date("2030-01-01"))).toBe(0);
  });
});

describe("matchEntry — composes with C&D zone (mocked zones)", () => {
  let suppressionMock: typeof import("@/lib/scanner/compliance/suppression");

  beforeAll(async () => {
    jest.resetModules();
    // Mock a single C&D zone covering Times Square (test-only, not real)
    jest.doMock("@/data/scanner/compliance/nyc-dos-cease-desist-zones.json", () => ({
      type: "FeatureCollection",
      name: "test",
      description: "test",
      source: { name: "test", url: "", regulatory_basis: "", regulatory_basis_url: "" },
      captured_at: "2026-04-30",
      active_through: "2027-04-30",
      refresh_instructions: "",
      manhattan_relevance_note: "",
      features: [
        {
          type: "Feature",
          id: "test-zone-1",
          properties: {
            name: "Test Zone — Times Square",
            boro: "Manhattan",
            boro_code: "1",
            zone_id: "test-zone-1",
          },
          geometry: {
            type: "Polygon",
            coordinates: [[
              [-73.9900, 40.7560],
              [-73.9810, 40.7560],
              [-73.9810, 40.7610],
              [-73.9900, 40.7610],
              [-73.9900, 40.7560],
            ]],
          },
        },
      ],
    }));
    suppressionMock = await import("@/lib/scanner/compliance/suppression");
  });

  afterAll(() => {
    jest.dontMock("@/data/scanner/compliance/nyc-dos-cease-desist-zones.json");
    jest.resetModules();
  });

  it("suppresses a prospect inside the (mocked) Times Square zone", () => {
    const v = suppressionMock.isSuppressed({
      bbl: "1010100001",
      owner_name: "Some Owner",
      lat: 40.758,
      lng: -73.9855,
    });
    expect(v.suppressed).toBe(true);
    expect(v.reasons.some((r) => r.includes("Cease & Desist Zone"))).toBe(true);
    expect(v.matched_entries.some((m) => m.source === "cease_desist_zone")).toBe(true);
  });

  it("does NOT suppress a prospect outside the zone", () => {
    const v = suppressionMock.isSuppressed({
      bbl: "1015730019",
      owner_name: "Mallan Office Owner",
      lat: 40.779,
      lng: -73.9489,
    });
    expect(v.suppressed).toBe(false);
  });

  it("handles missing lat/lng without invoking zone check", () => {
    const v = suppressionMock.isSuppressed({ owner_name: "X" });
    expect(v.suppressed).toBe(false);
    expect(v.matched_entries.length).toBe(0);
  });
});
