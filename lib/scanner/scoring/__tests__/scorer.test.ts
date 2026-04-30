import { scoreProspect, scoreProspects } from "@/lib/scanner/scoring/scorer";
import {
  DEFAULT_SCORING_CONFIG,
  type BblProspect,
  type AcrisDistressSignal,
  type OffMarketSignalRef,
  type DosCorpMatch,
  type ScoringConfig,
} from "@/lib/scanner/scoring/types";

const NOW = new Date("2026-04-30T12:00:00Z");

function basePluto(overrides: Partial<BblProspect["pluto"]> = {}): BblProspect["pluto"] {
  return {
    bbl: "1015730019",
    owner_name: "400 EAST 90 OWNER LLC",
    address: "400 EAST 90 STREET",
    property_address: "400 EAST 90 STREET, NEW YORK NY 10128",
    zip: "10128",
    units_total: 20,
    latitude: 40.7790,
    longitude: -73.9489,
    ...overrides,
  };
}

function makeProspect(overrides: Partial<BblProspect> = {}): BblProspect {
  return {
    bbl: "1015730019",
    pluto: basePluto(),
    ...overrides,
  };
}

function lisPendens(daysAgo: number, docId = "DOC-LP"): AcrisDistressSignal {
  const d = new Date(NOW.getTime() - daysAgo * 86400000);
  return {
    doc_id: docId,
    doc_type: "LP",
    category: "lis_pendens",
    recorded_datetime: d.toISOString(),
    document_amt: "0",
  };
}

function foreclosure(daysAgo: number, docId = "DOC-FORE"): AcrisDistressSignal {
  const d = new Date(NOW.getTime() - daysAgo * 86400000);
  return {
    doc_id: docId,
    doc_type: "FORE",
    category: "foreclosure",
    recorded_datetime: d.toISOString(),
  };
}

function estate(daysAgo: number, docId = "DOC-EATR"): AcrisDistressSignal {
  const d = new Date(NOW.getTime() - daysAgo * 86400000);
  return {
    doc_id: docId,
    doc_type: "EATR",
    category: "estate",
    recorded_datetime: d.toISOString(),
  };
}

function offMarket(daysAgo: number, status = "Expired", overrides: Partial<OffMarketSignalRef> = {}): OffMarketSignalRef {
  const d = new Date(NOW.getTime() - daysAgo * 86400000);
  return {
    mls_id: "RLS-MOCK",
    listing_id: "RLS-MOCK",
    listing_status: status,
    off_market_since: d.toISOString(),
    cool_through_date: new Date(d.getTime() + 30 * 86400000).toISOString(),
    past_cooling_off: daysAgo > 30,
    was_mallan_listing: false,
    list_price: "2500000",
    days_off_market: daysAgo,
    ...overrides,
  };
}

describe("scoreProspect — empty input", () => {
  test("zero signals → score 0, below_threshold confidence", () => {
    const r = scoreProspect(makeProspect(), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.score).toBe(0);
    expect(r.raw_score).toBe(0);
    expect(r.reasons).toEqual([]);
    expect(r.confidence).toBe("below_threshold");
    expect(r.suppressed).toBe(false);
  });
});

describe("scoreProspect — single ACRIS signals", () => {
  test("recent lis pendens (1 day old) → ~35 points", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(1)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.score).toBeGreaterThan(34);
    expect(r.score).toBeLessThanOrEqual(35);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0].signal).toBe("lis_pendens");
    expect(r.reasons[0].source_url).toContain("a836-acris.nyc.gov");
    expect(r.reasons[0].decay_factor).toBeCloseTo(1.0, 1);
  });

  test("365-day-old lis pendens (half decay) → ~17.5 points", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(365)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.score).toBeCloseTo(17.5, 1);
    expect(r.reasons[0].decay_factor).toBeCloseTo(0.5, 1);
  });

  test("expired (>730d) lis pendens → 0 contribution, no reason", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(800)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  test("multiple lis pendens — only the most recent counts", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [
        lisPendens(400, "OLD"),
        lisPendens(100, "RECENT"),
        lisPendens(600, "OLDER"),
      ],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0].source).toContain("RECENT");
  });

  test("foreclosure 30d ago — high contribution", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [foreclosure(30)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons[0].signal).toBe("foreclosure");
    expect(r.score).toBeGreaterThan(25);
  });

  test("estate transfer 200 days ago (within 1095d window) → ~20 points", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [estate(200)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons[0].signal).toBe("estate");
    expect(r.score).toBeGreaterThan(15);
    expect(r.score).toBeLessThan(25);
  });
});

describe("scoreProspect — off-market signals", () => {
  test("recent expired listing past cooling-off → ~30 points", () => {
    const r = scoreProspect(makeProspect({
      off_market_signals: [offMarket(60)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons.find((rr) => rr.signal === "off_market_expired")).toBeDefined();
    expect(r.score).toBeGreaterThan(20);
  });

  test("listing in cooling-off (past_cooling_off=false) → no contribution", () => {
    const r = scoreProspect(makeProspect({
      off_market_signals: [offMarket(10, "Expired", { past_cooling_off: false })],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons.find((rr) => rr.signal === "off_market_expired")).toBeUndefined();
  });

  test("relist boost: 3 listings in 24mo → +15", () => {
    const r = scoreProspect(makeProspect({
      off_market_signals: [offMarket(60)],
      off_market_relist_count_24mo: 3,
    }), DEFAULT_SCORING_CONFIG, NOW);
    const boost = r.reasons.find((rr) => rr.signal === "off_market_relist_boost");
    expect(boost?.contribution).toBe(15);
  });

  test("relist boost not applied below threshold", () => {
    const r = scoreProspect(makeProspect({
      off_market_signals: [offMarket(60)],
      off_market_relist_count_24mo: 2,
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons.find((rr) => rr.signal === "off_market_relist_boost")).toBeUndefined();
  });

  test("former Mallan listing flagged in detail", () => {
    const r = scoreProspect(makeProspect({
      off_market_signals: [offMarket(60, "Expired", { was_mallan_listing: true })],
    }), DEFAULT_SCORING_CONFIG, NOW);
    const offM = r.reasons.find((rr) => rr.signal === "off_market_expired");
    expect(offM?.detail).toContain("former Mallan listing");
  });
});

describe("scoreProspect — ownership tenure", () => {
  test("25-year ownership → +10", () => {
    const r = scoreProspect(makeProspect({ ownership_duration_years: 27 }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons.find((rr) => rr.signal === "long_ownership_25y")?.contribution).toBe(10);
    expect(r.score).toBe(10);
  });

  test("40-year ownership → +15 (10 + 5 boost)", () => {
    const r = scoreProspect(makeProspect({ ownership_duration_years: 42 }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.score).toBe(15);
    const sigs = r.reasons.map((rr) => rr.signal);
    expect(sigs).toContain("long_ownership_25y");
    expect(sigs).toContain("long_ownership_40y");
  });

  test("recent purchase (<2y) → -10 penalty", () => {
    const r = scoreProspect(makeProspect({ ownership_duration_years: 1.2 }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.raw_score).toBe(-10);
    // Score is clamped at 0
    expect(r.score).toBe(0);
  });

  test("missing duration → no rule fires", () => {
    const r = scoreProspect(makeProspect({}), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons).toEqual([]);
  });
});

describe("scoreProspect — owner-side flags", () => {
  test("dissolved LLC → +15", () => {
    const dosMatch: DosCorpMatch = {
      dos_id: "1234567",
      current_entity_name: "ACME 90 LLC",
      status: "DISSOLVED",
      match_kind: "exact_normalized",
    };
    const r = scoreProspect(makeProspect({
      is_dissolved_llc: true,
      dos_matches: [dosMatch],
    }), DEFAULT_SCORING_CONFIG, NOW);
    const dl = r.reasons.find((rr) => rr.signal === "dissolved_llc");
    expect(dl?.contribution).toBe(15);
    expect(dl?.source_url).toContain("apps.dos.ny.gov");
  });

  test("absentee owner → +10", () => {
    const r = scoreProspect(makeProspect({ is_absentee: true }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons.find((rr) => rr.signal === "absentee_owner")?.contribution).toBe(10);
  });
});

describe("scoreProspect — convergence boost", () => {
  test("3 distinct categories → +10 boost", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(30)],
      off_market_signals: [offMarket(60)],
      is_absentee: true,
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons.find((rr) => rr.signal === "convergence_boost")?.contribution).toBe(10);
  });

  test("2 categories → no boost", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(30)],
      is_absentee: true,
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons.find((rr) => rr.signal === "convergence_boost")).toBeUndefined();
  });

  test("ACRIS sub-categories don't double-count for convergence (lis_pendens + foreclosure = 1 category)", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(30), foreclosure(45)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons.find((rr) => rr.signal === "convergence_boost")).toBeUndefined();
  });
});

describe("scoreProspect — score capping", () => {
  test("raw_score >100 caps at 100", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(1), foreclosure(1), estate(50)],
      off_market_signals: [offMarket(30)],
      off_market_relist_count_24mo: 4,
      is_absentee: true,
      is_dissolved_llc: true,
      ownership_duration_years: 45,
      dos_matches: [{ dos_id: "X", current_entity_name: "X", status: "DISSOLVED", match_kind: "exact_normalized" }],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.raw_score).toBeGreaterThan(100);
    expect(r.score).toBe(100);
  });
});

describe("scoreProspect — compliance gate integration", () => {
  test("normally-scoring prospect is not suppressed", () => {
    const r = scoreProspect(makeProspect({ acris_signals: [lisPendens(30)] }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.suppressed).toBe(false);
    expect(r.suppression_reasons).toEqual([]);
    expect(r.score).toBeGreaterThan(0);
  });

  // Note: the suppression list is empty in the in-repo fixture, so we
  // can't smoke-test a positive suppression here without mocking. The
  // negative path (no suppression) confirms the gate is wired in.
  // (The suppression module's own tests cover the positive paths.)
});

describe("scoreProspect — confidence tiers", () => {
  test("score below threshold → below_threshold", () => {
    const r = scoreProspect(makeProspect({
      ownership_duration_years: 27, // +10 only
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.confidence).toBe("below_threshold");
  });

  test("strong recent ACRIS distress → high", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(15)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.confidence).toBe("high");
  });

  test("strong off-market expired → high", () => {
    const r = scoreProspect(makeProspect({
      off_market_signals: [offMarket(45)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.confidence).toBe("high");
  });

  test("4+ reasons → high regardless of individual contribution", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(700), estate(1050)], // both decayed but still > 0
      off_market_signals: [offMarket(60)],
      ownership_duration_years: 27,
      is_absentee: true,
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.reasons.length).toBeGreaterThanOrEqual(4);
    expect(r.confidence).toBe("high");
  });

  test("2-3 mid signals at threshold → medium", () => {
    // 41y tenure (+15) + absentee (+10) = 25 (just at threshold).
    // 3 reasons, 2 distinct categories (no convergence boost) → medium.
    const r = scoreProspect(makeProspect({
      ownership_duration_years: 41,
      is_absentee: true,
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.score).toBe(25);
    expect(r.confidence).toBe("medium");
  });

  test("score below threshold (only minor signals) → below_threshold", () => {
    const r = scoreProspect(makeProspect({
      ownership_duration_years: 28, // only +10
    }), DEFAULT_SCORING_CONFIG, NOW);
    expect(r.score).toBeLessThan(DEFAULT_SCORING_CONFIG.min_score_to_surface);
    expect(r.confidence).toBe("below_threshold");
  });
});

describe("scoreProspect — output shape + audit trail", () => {
  test("most_recent_signal_at picks newest signal date", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(100)],
      off_market_signals: [offMarket(45)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    const expectedDate = new Date(NOW.getTime() - 45 * 86400000).toISOString();
    expect(r.most_recent_signal_at).toBe(expectedDate);
  });

  test("each reason has source + audit trail fields", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(30)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    const reason = r.reasons[0];
    expect(reason.source).toContain("ACRIS");
    expect(reason.source_url).toContain("a836-acris.nyc.gov");
    expect(reason.signal_date).toBeTruthy();
    expect(reason.contribution).toBeGreaterThan(0);
    expect(reason.detail).toContain("Lis pendens");
  });

  test("signal_category_count reflects distinct categories", () => {
    const r = scoreProspect(makeProspect({
      acris_signals: [lisPendens(30), tax_lien_signal(60)],
      off_market_signals: [offMarket(60)],
    }), DEFAULT_SCORING_CONFIG, NOW);
    // Categories: acris_distress (lis+tax = 1), off_market (= 1)
    // But scorer only takes most-recent of each ACRIS category so tax_lien also fires
    // Final categories: acris_distress + off_market = 2
    expect(r.signal_category_count).toBeGreaterThanOrEqual(2);
  });
});

function tax_lien_signal(daysAgo: number, docId = "DOC-TAX"): AcrisDistressSignal {
  const d = new Date(NOW.getTime() - daysAgo * 86400000);
  return {
    doc_id: docId,
    doc_type: "TAX",
    category: "tax_lien",
    recorded_datetime: d.toISOString(),
  };
}

describe("scoreProspects — batch", () => {
  test("sorted by score descending, low ones filtered out", () => {
    const prospects: BblProspect[] = [
      makeProspect({ bbl: "A", pluto: basePluto({ bbl: "A" }) }),
      makeProspect({ bbl: "B", pluto: basePluto({ bbl: "B" }), acris_signals: [lisPendens(15)] }),
      makeProspect({ bbl: "C", pluto: basePluto({ bbl: "C" }), ownership_duration_years: 27 }), // +10 → below threshold
      makeProspect({ bbl: "D", pluto: basePluto({ bbl: "D" }), acris_signals: [estate(200)], off_market_signals: [offMarket(60)] }),
    ];
    const out = scoreProspects(prospects, DEFAULT_SCORING_CONFIG, NOW);
    // Empty (A) and below-threshold (C) filtered. B and D surface.
    expect(out.length).toBe(2);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  test("surface_below_threshold=true returns all", () => {
    const prospects: BblProspect[] = [
      makeProspect({ bbl: "A", pluto: basePluto({ bbl: "A" }) }),
      makeProspect({ bbl: "B", pluto: basePluto({ bbl: "B" }), acris_signals: [lisPendens(15)] }),
    ];
    const out = scoreProspects(prospects, DEFAULT_SCORING_CONFIG, NOW, { surface_below_threshold: true });
    expect(out.length).toBe(2);
  });
});

describe("scoreProspect — realistic scenario", () => {
  test("UES coop with lis pendens + 30-year tenure + Mallan-former + 2 relists in 24mo", () => {
    const prospect: BblProspect = {
      bbl: "1015730019",
      pluto: basePluto({ owner_name: "SMITH FAMILY TRUST", year_built: 1925 }),
      acris_signals: [lisPendens(45, "LP-2026-001"), foreclosure(800)], // foreclosure decayed to 0
      off_market_signals: [
        offMarket(120, "Expired", { was_mallan_listing: true, list_price: "3500000" }),
        offMarket(500, "Withdrawn"),
      ],
      off_market_relist_count_24mo: 2, // below threshold
      ownership_duration_years: 32,
      is_absentee: false,
    };
    const r = scoreProspect(prospect, DEFAULT_SCORING_CONFIG, NOW);

    // Expected:
    //   lis pendens 45d ago: 35 × (685/730) ≈ 32.84
    //   foreclosure 800d ago: 0 (decayed)
    //   off-market 120d ago: 30 × (245/365) ≈ 20.13
    //   relist count 2: 0 (below threshold of 3)
    //   tenure 32y: +10
    //   convergence: 3+ categories (acris_distress, off_market, tenure) → +10
    //   total ~73
    expect(r.score).toBeGreaterThan(60);
    expect(r.score).toBeLessThan(80);

    expect(r.reasons.map((x) => x.signal).sort()).toEqual([
      "convergence_boost", "lis_pendens", "long_ownership_25y", "off_market_expired",
    ]);

    expect(r.confidence).toBe("high");
    expect(r.signal_category_count).toBe(3);
    expect(r.suppressed).toBe(false);

    const lp = r.reasons.find((x) => x.signal === "lis_pendens")!;
    expect(lp.detail).toContain("45 days ago");
    expect(lp.source_url).toContain("LP-2026-001");

    const off = r.reasons.find((x) => x.signal === "off_market_expired")!;
    expect(off.detail).toContain("former Mallan listing");
  });
});
