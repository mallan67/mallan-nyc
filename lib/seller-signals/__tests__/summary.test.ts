import { normalizeSellerSignalPayload, summarizeSellerSignals } from "@/lib/seller-signals/summary";

describe("seller signal summary", () => {
  it("normalizes proceeds inputs and computes net proceeds", () => {
    const payload = normalizeSellerSignalPayload({
      estimated_value: "$1,200,000",
      desired_sale_price: "1250000",
      mortgage_payoff: "400000",
      prep_budget: "25000",
      closing_costs: "75000",
      urgency: "soon",
    });

    expect(payload.estimated_value).toBe(1200000);
    expect(payload.estimated_net_proceeds).toBe(750000);
    expect(payload.urgency).toBe("soon");
  });

  it("summarizes latest seller portal signals", () => {
    const events = [
      {
        id: BigInt(1),
        event_type: "seller_valuation_request",
        listing_id: "L1",
        metadata: { estimated_value: 1200000, urgency: "soon" },
        created_at: new Date("2026-04-29T08:00:00.000Z"),
      },
      {
        id: BigInt(2),
        event_type: "seller_proceeds_estimate",
        listing_id: "L1",
        metadata: { desired_sale_price: 1250000, estimated_net_proceeds: 750000 },
        created_at: new Date("2026-04-29T08:05:00.000Z"),
      },
      {
        id: BigInt(3),
        event_type: "seller_readiness_update",
        listing_id: "L1",
        metadata: { readiness: "prep_needed", timeline: "30_60_days" },
        created_at: new Date("2026-04-29T08:06:00.000Z"),
      },
    ];

    const summary = summarizeSellerSignals(events);

    expect(summary.event_count).toBe(3);
    expect(summary.estimated_value).toBe(1200000);
    expect(summary.desired_sale_price).toBe(1250000);
    expect(summary.estimated_net_proceeds).toBe(750000);
    expect(summary.timeline).toBe("30_60_days");
    expect(summary.seller_signal_score).toBeGreaterThanOrEqual(50);
    expect(summary.seller_temperature).toMatch(/hot|warm/);
    expect(summary.next_best_action).toBeTruthy();
    expect(summary.recent_events).toHaveLength(3);
  });

  it("identifies missing seller planning inputs", () => {
    const summary = summarizeSellerSignals([
      {
        id: BigInt(1),
        event_type: "seller_valuation_request",
        listing_id: null,
        metadata: { urgency: "exploring" },
        created_at: new Date("2026-04-29T08:00:00.000Z"),
      },
    ]);

    expect(summary.missing_inputs).toContain("estimated_value");
    expect(summary.missing_inputs).toContain("desired_sale_price");
    expect(summary.seller_temperature).toBe("cold");
  });
});
