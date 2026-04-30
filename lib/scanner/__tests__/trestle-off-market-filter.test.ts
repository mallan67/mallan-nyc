import {
  isOffMarketStatus,
  offMarketSince,
  coolingThroughDate,
  isPastCoolingPeriod,
  isMallanListing,
  isCorridorListing,
  daysOffMarket,
  processListing,
  aggregateByBbl,
  emptyOffMarketStats,
  DEFAULT_OFF_MARKET_CONFIG,
  type ListingRow,
  type OffMarketConfig,
  type OffMarketSignal,
} from "@/lib/scanner/trestle-off-market-filter";

const NOW = new Date("2026-04-30T12:00:00Z");
const MALLAN_OFFICE_LAT = 40.779;
const MALLAN_OFFICE_LNG = -73.9489;
const HARLEM_LAT = 40.8104;
const HARLEM_LNG = -73.9494;

describe("isOffMarketStatus", () => {
  test.each([
    ["Expired", true],
    ["Withdrawn", true],
    ["Canceled", true],
    ["Cancelled", true],
    ["Hold", true],
    ["Active", false],
    ["ActiveUnderContract", false],
    ["Pending", false],
    ["Closed", false],
    ["ComingSoon", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("%s → %s", (input, expected) => {
    expect(isOffMarketStatus(input as string | null | undefined)).toBe(expected);
  });
});

describe("offMarketSince", () => {
  test("prefers explicit expiration_date", () => {
    const d = offMarketSince({
      expiration_date: "2026-03-15T10:00:00.000Z",
      status_changed_at: "2026-03-20T10:00:00.000Z",
    });
    expect(d?.toISOString()).toBe("2026-03-15T10:00:00.000Z");
  });
  test("falls back to status_changed_at", () => {
    const d = offMarketSince({ status_changed_at: "2026-03-20T10:00:00.000Z" });
    expect(d?.toISOString()).toBe("2026-03-20T10:00:00.000Z");
  });
  test("returns null when both missing", () => {
    expect(offMarketSince({})).toBeNull();
  });
  test("rejects unparseable date", () => {
    expect(offMarketSince({ expiration_date: "garbage" })).toBeNull();
  });
});

describe("coolingThroughDate", () => {
  test("expiry + 30 days by default", () => {
    const d = coolingThroughDate({ expiration_date: "2026-03-15T10:00:00.000Z" });
    expect(d?.toISOString()).toBe("2026-04-14T10:00:00.000Z");
  });
  test("custom 60-day cooling window", () => {
    const config: OffMarketConfig = { ...DEFAULT_OFF_MARKET_CONFIG, cooling_off_days: 60 };
    const d = coolingThroughDate({ expiration_date: "2026-03-15T10:00:00.000Z" }, config);
    expect(d?.toISOString()).toBe("2026-05-14T10:00:00.000Z");
  });
  test("minimum floor enforced — config of 3 days is upgraded to 7", () => {
    const config: OffMarketConfig = { ...DEFAULT_OFF_MARKET_CONFIG, cooling_off_days: 3 };
    const d = coolingThroughDate({ expiration_date: "2026-03-15T10:00:00.000Z" }, config);
    // 3 < min 7, so 7 is used → +7 days
    expect(d?.toISOString()).toBe("2026-03-22T10:00:00.000Z");
  });
  test("returns null when no off-market date", () => {
    expect(coolingThroughDate({})).toBeNull();
  });
});

describe("isPastCoolingPeriod", () => {
  test("expired 60 days ago, 30-day cooling → past", () => {
    expect(isPastCoolingPeriod(
      { expiration_date: "2026-02-28T00:00:00.000Z" },
      DEFAULT_OFF_MARKET_CONFIG,
      NOW,
    )).toBe(true);
  });
  test("expired 5 days ago → still in cooling-off", () => {
    expect(isPastCoolingPeriod(
      { expiration_date: "2026-04-25T00:00:00.000Z" },
      DEFAULT_OFF_MARKET_CONFIG,
      NOW,
    )).toBe(false);
  });
  test("expired exactly 30 days ago → past (>=)", () => {
    expect(isPastCoolingPeriod(
      { expiration_date: "2026-03-31T12:00:00.000Z" },
      DEFAULT_OFF_MARKET_CONFIG,
      NOW,
    )).toBe(true);
  });
  test("no expiry data → not past", () => {
    expect(isPastCoolingPeriod({}, DEFAULT_OFF_MARKET_CONFIG, NOW)).toBe(false);
  });
});

describe("isMallanListing", () => {
  const config: OffMarketConfig = {
    ...DEFAULT_OFF_MARKET_CONFIG,
    mallan_agent_ids: new Set(["123", "456"]),
  };
  test("listing held by Mallan agent → true", () => {
    expect(isMallanListing({ agent_id: "123" }, config)).toBe(true);
    expect(isMallanListing({ agent_id: 123n }, config)).toBe(true);
  });
  test("non-Mallan agent → false", () => {
    expect(isMallanListing({ agent_id: "999" }, config)).toBe(false);
  });
  test("missing agent_id → false", () => {
    expect(isMallanListing({}, config)).toBe(false);
  });
});

describe("isCorridorListing", () => {
  test("corridor lat/lng → true", () => {
    expect(isCorridorListing({ latitude: MALLAN_OFFICE_LAT, longitude: MALLAN_OFFICE_LNG })).toBe(true);
  });
  test("Harlem lat/lng → false", () => {
    expect(isCorridorListing({ latitude: HARLEM_LAT, longitude: HARLEM_LNG })).toBe(false);
  });
  test("missing geo → false", () => {
    expect(isCorridorListing({})).toBe(false);
    expect(isCorridorListing({ latitude: 40.779 })).toBe(false);
  });
});

describe("daysOffMarket", () => {
  test("60-day-old expiry returns 60", () => {
    expect(daysOffMarket({ expiration_date: "2026-03-01T12:00:00.000Z" }, NOW)).toBe(60);
  });
  test("future-dated expiry returns 0 (clamped)", () => {
    expect(daysOffMarket({ expiration_date: "2026-05-15T12:00:00.000Z" }, NOW)).toBe(0);
  });
  test("missing returns null", () => {
    expect(daysOffMarket({}, NOW)).toBeNull();
  });
});

describe("processListing — full pipeline + stats", () => {
  function makeRow(overrides: Partial<ListingRow> = {}): ListingRow {
    return {
      listing_id: "RLS20059088",
      mls_id: "RLS20059088",
      status: "Expired",
      expiration_date: "2026-02-28T00:00:00.000Z",
      first_active_date: "2025-09-01T00:00:00.000Z",
      days_on_market: 180,
      cumulative_days_on_market: 180,
      list_price: "2500000",
      agent_id: "999",
      bbl: "1015730019",
      address: "400 EAST 90 STREET APT 12A",
      latitude: MALLAN_OFFICE_LAT,
      longitude: MALLAN_OFFICE_LNG,
      ...overrides,
    };
  }

  test("expired corridor listing past cooling-off → kept", () => {
    const stats = emptyOffMarketStats();
    const r = processListing(makeRow(), stats, DEFAULT_OFF_MARKET_CONFIG, NOW);
    expect(r.kept).toBe(true);
    expect(r.reason).toBe("kept");
    expect(r.signal?.bbl).toBe("1015730019");
    expect(r.signal?.listing_status).toBe("Expired");
    expect(r.signal?.past_cooling_off).toBe(true);
    expect(r.signal?.days_off_market).toBe(61);
    expect(stats.rows_kept).toBe(1);
    expect(stats.rows_off_market_status).toBe(1);
    expect(stats.rows_in_corridor).toBe(1);
    expect(stats.rows_past_cooling_off).toBe(1);
  });

  test("active listing dropped at non-off-market", () => {
    const stats = emptyOffMarketStats();
    const r = processListing(makeRow({ status: "Active" }), stats, DEFAULT_OFF_MARKET_CONFIG, NOW);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("not_off_market");
    expect(stats.rows_dropped_active).toBe(1);
    expect(stats.rows_off_market_status).toBe(0);
  });

  test("Harlem expired listing dropped at corridor", () => {
    const stats = emptyOffMarketStats();
    const r = processListing(makeRow({
      latitude: HARLEM_LAT,
      longitude: HARLEM_LNG,
    }), stats, DEFAULT_OFF_MARKET_CONFIG, NOW);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("outside_corridor");
    expect(stats.rows_dropped_outside_corridor).toBe(1);
  });

  test("recently-expired (in cooling-off) dropped + tracked separately", () => {
    const stats = emptyOffMarketStats();
    const r = processListing(makeRow({
      expiration_date: "2026-04-25T00:00:00.000Z", // 5 days ago
    }), stats, DEFAULT_OFF_MARKET_CONFIG, NOW);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("in_cooling_off");
    expect(stats.rows_dropped_in_cooling_off).toBe(1);
    expect(stats.rows_off_market_status).toBe(1); // still counted
    expect(stats.rows_in_corridor).toBe(1); // still counted
  });

  test("missing geo dropped at no_geo", () => {
    const stats = emptyOffMarketStats();
    const r = processListing(makeRow({ latitude: null, longitude: null }), stats, DEFAULT_OFF_MARKET_CONFIG, NOW);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("no_geo");
    expect(stats.rows_dropped_no_geo).toBe(1);
  });

  test("Mallan-exclusive flagged when agent_id matches", () => {
    const stats = emptyOffMarketStats();
    const config: OffMarketConfig = {
      ...DEFAULT_OFF_MARKET_CONFIG,
      mallan_agent_ids: new Set(["999"]),
    };
    const r = processListing(makeRow({ agent_id: "999" }), stats, config, NOW);
    expect(r.kept).toBe(true);
    expect(r.signal?.was_mallan_listing).toBe(true);
    expect(stats.rows_mallan_exclusive).toBe(1);
  });

  test("Withdrawn / Canceled / Hold all surface as off-market", () => {
    for (const status of ["Withdrawn", "Canceled", "Cancelled", "Hold"]) {
      const stats = emptyOffMarketStats();
      const r = processListing(makeRow({ status }), stats, DEFAULT_OFF_MARKET_CONFIG, NOW);
      expect(r.kept).toBe(true);
      expect(r.signal?.listing_status).toBe(status);
    }
  });

  test("Closed (Sold) is NOT off-market for prospect purposes", () => {
    const stats = emptyOffMarketStats();
    const r = processListing(makeRow({ status: "Closed" }), stats, DEFAULT_OFF_MARKET_CONFIG, NOW);
    expect(r.kept).toBe(false);
    expect(r.reason).toBe("not_off_market");
  });

  test("realistic mixed batch — 6 in, 2 kept", () => {
    const stats = emptyOffMarketStats();
    const config: OffMarketConfig = {
      ...DEFAULT_OFF_MARKET_CONFIG,
      mallan_agent_ids: new Set(["999"]),
    };

    processListing(makeRow(), stats, config, NOW); // KEEP — corridor expired past cooling
    processListing(makeRow({ listing_id: "B", status: "Active" }), stats, config, NOW); // DROP active
    processListing(makeRow({
      listing_id: "C",
      latitude: HARLEM_LAT, longitude: HARLEM_LNG,
    }), stats, config, NOW); // DROP outside corridor
    processListing(makeRow({
      listing_id: "D",
      expiration_date: "2026-04-25T00:00:00.000Z",
    }), stats, config, NOW); // DROP cooling-off
    processListing(makeRow({
      listing_id: "E",
      bbl: "1010100007",
      address: "150 EAST 50 STREET",
      latitude: 40.7570, longitude: -73.9710,
    }), stats, config, NOW); // KEEP — 50th & 6th area
    processListing(makeRow({
      listing_id: "F",
      latitude: null, longitude: null,
    }), stats, config, NOW); // DROP no_geo

    expect(stats.rows_seen).toBe(6);
    expect(stats.rows_kept).toBe(2);
    expect(stats.rows_dropped_active).toBe(1);
    expect(stats.rows_dropped_outside_corridor).toBe(1);
    expect(stats.rows_dropped_in_cooling_off).toBe(1);
    expect(stats.rows_dropped_no_geo).toBe(1);
  });
});

describe("aggregateByBbl — relist frequency signal", () => {
  function sig(overrides: Partial<OffMarketSignal>): OffMarketSignal {
    return {
      bbl: "1015730019",
      mls_id: null,
      listing_id: null,
      address: null,
      listing_status: "Expired",
      off_market_since: "2026-03-15T10:00:00.000Z",
      cool_through_date: "2026-04-14T10:00:00.000Z",
      days_off_market: 45,
      past_cooling_off: true,
      was_mallan_listing: false,
      list_price: null,
      days_on_market_last_listing: null,
      cumulative_days_on_market: null,
      ...overrides,
    };
  }

  test("groups by BBL and counts within window", () => {
    const signals = [
      sig({ off_market_since: "2026-03-15T10:00:00.000Z" }),
      sig({ off_market_since: "2025-09-10T10:00:00.000Z" }),
      sig({ off_market_since: "2025-01-15T10:00:00.000Z" }),
      sig({ bbl: "1010100007", off_market_since: "2026-02-01T10:00:00.000Z" }),
    ];
    const out = aggregateByBbl(signals, 730, NOW);
    expect(out).toHaveLength(2);
    expect(out[0].bbl).toBe("1015730019");
    expect(out[0].count_24mo).toBe(3);
    expect(out[0].most_recent_status).toBe("Expired");
    expect(out[1].bbl).toBe("1010100007");
    expect(out[1].count_24mo).toBe(1);
  });

  test("excludes signals outside the window", () => {
    const signals = [
      sig({ off_market_since: "2026-03-15T10:00:00.000Z" }),
      sig({ off_market_since: "2023-01-01T10:00:00.000Z" }), // outside 730d
    ];
    const out = aggregateByBbl(signals, 730, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].count_24mo).toBe(1);
  });

  test("any_was_mallan is true if any listing was Mallan", () => {
    const signals = [
      sig({ was_mallan_listing: false, off_market_since: "2026-03-15T10:00:00.000Z" }),
      sig({ was_mallan_listing: true, off_market_since: "2025-09-10T10:00:00.000Z" }),
    ];
    const out = aggregateByBbl(signals, 730, NOW);
    expect(out[0].any_was_mallan).toBe(true);
  });

  test("sorted by count desc", () => {
    const signals = [
      sig({ bbl: "A", off_market_since: "2026-03-15T10:00:00.000Z" }),
      sig({ bbl: "B", off_market_since: "2026-02-15T10:00:00.000Z" }),
      sig({ bbl: "B", off_market_since: "2025-12-15T10:00:00.000Z" }),
      sig({ bbl: "B", off_market_since: "2025-09-15T10:00:00.000Z" }),
    ];
    const out = aggregateByBbl(signals, 730, NOW);
    expect(out[0].bbl).toBe("B");
    expect(out[0].count_24mo).toBe(3);
    expect(out[1].bbl).toBe("A");
  });
});
