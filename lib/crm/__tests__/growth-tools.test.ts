import { summarizeGrowthTools, type GrowthLead } from "@/lib/crm/growth-tools";

function lead(overrides: Partial<GrowthLead>): GrowthLead {
  return {
    id: BigInt(1),
    first_name: "Maya",
    last_name: "Seller",
    email: "maya@example.com",
    roles: ["seller"],
    status: "active",
    agent_id: BigInt(10),
    pipeline_stage: "prospect",
    seller_potential: "none",
    seller_potential_reason: [],
    sales_drip_on: false,
    rental_drip_on: false,
    renewal_drip_on: false,
    buyer_rep_agreement: false,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("growth tools summary", () => {
  it("prioritizes tight seller signals from portal activity and lease timing", () => {
    const now = new Date("2026-04-29T12:00:00.000Z");
    const summary = summarizeGrowthTools({
      now,
      isBroker: true,
      leads: [
        lead({
          seller_potential: "high",
          roles: ["landlord"],
          property_address: "1 Main St",
        }),
      ],
      portalEvents: [
        {
          id: BigInt(1),
          lead_id: BigInt(1),
          event_type: "seller_valuation_request",
          listing_id: null,
          metadata: { estimated_value: 1200000, urgency: "soon", timeline: "30_60_days" },
          created_at: new Date("2026-04-28T12:00:00.000Z"),
        },
      ],
      leases: [
        {
          id: BigInt(44),
          landlord_lead_id: BigInt(1),
          tenant_lead_id: null,
          address: "1 Main St",
          status: "active",
          lease_end_date: new Date("2026-06-01T00:00:00.000Z"),
          renewal_status: "unknown",
          seller_comps_6mo_sent_at: null,
          seller_comps_1yr_sent_at: null,
          outreach_90d_sent_at: null,
          outreach_60d_sent_at: null,
          outreach_30d_sent_at: null,
        },
      ],
    });

    expect(summary.seller_signal_queue[0].priority).toBe("urgent");
    expect(summary.seller_signal_queue[0].score).toBeGreaterThanOrEqual(80);
    expect(summary.marketing_queue.some((item) => item.type === "seller_comps_due")).toBe(true);
    expect(summary.pipeline_queue.some((item) => item.type === "lease_renewal_window")).toBe(true);
  });

  it("surfaces marketing cadence, anniversaries, and buyer agreement gaps", () => {
    const now = new Date("2026-04-29T12:00:00.000Z");
    const summary = summarizeGrowthTools({
      now,
      leads: [
        lead({
          id: BigInt(2),
          first_name: "Buyer",
          last_name: "Client",
          roles: ["buyer"],
          sales_drip_on: true,
          sales_drip_status: "monthly",
          last_contacted_at: new Date("2026-03-01T00:00:00.000Z"),
          closing_date: new Date("2025-10-20T00:00:00.000Z"),
          anniversary_6mo_sent_at: null,
          buyer_rep_agreement: false,
        }),
      ],
      campaigns: [
        {
          id: BigInt(7),
          name: "Quarterly owner report",
          audience_type: "sellers",
          campaign_type: "market_update",
          status: "recurring",
          frequency: "quarterly",
          last_run_at: new Date("2026-01-01T00:00:00.000Z"),
          next_run_at: new Date("2026-04-01T00:00:00.000Z"),
          recipient_count: 20,
          sent_count: 20,
          open_count: 8,
          click_count: 2,
          response_count: 1,
        },
      ],
      tasks: [
        {
          id: BigInt(9),
          lead_id: BigInt(2),
          title: "Call buyer",
          priority: "urgent",
          status: "pending",
          task_type: "call",
          due_date: new Date("2026-04-28T00:00:00.000Z"),
        },
      ],
    });

    expect(summary.marketing_queue.some((item) => item.type === "campaign_due")).toBe(true);
    expect(summary.marketing_queue.some((item) => item.type === "monthly_report_due")).toBe(true);
    expect(summary.marketing_queue.some((item) => item.type === "anniversary_6mo_due")).toBe(true);
    expect(summary.pipeline_queue.some((item) => item.type === "buyer_rep_missing")).toBe(true);
    expect(summary.pipeline_queue.some((item) => item.type === "task_due")).toBe(true);
  });
});
