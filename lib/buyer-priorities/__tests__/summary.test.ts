import { summarizeBuyerDailyPriorities } from "@/lib/buyer-priorities/summary";

describe("summarizeBuyerDailyPriorities", () => {
  it("prioritizes tour requests, info requests, budget stretch, liked outside listings, and family discussion", () => {
    const summary = summarizeBuyerDailyPriorities({
      showings: [
        {
          id: BigInt(50),
          status: "requested",
          date: new Date("2026-04-30T15:00:00Z"),
          created_at: new Date("2026-04-29T10:00:00Z"),
          listing: { address: "10 Main St", listing_id: "RLS-1" },
        },
      ],
      externalListings: [
        {
          id: BigInt(1),
          lead_id: BigInt(5),
          title: "Outside tour",
          address: null,
          source_host: "example.com",
          action_bucket: "discuss",
          family_visible: true,
          updated_at: new Date("2026-04-29T08:00:00Z"),
          comments: [
            {
              id: BigInt(10),
              external_listing_id: BigInt(1),
              lead_id: BigInt(5),
              agent_id: null,
              request_type: "showing_request",
              created_at: new Date("2026-04-29T08:30:00Z"),
            },
          ],
        },
        {
          id: BigInt(2),
          lead_id: BigInt(5),
          title: null,
          address: "123 Main St",
          source_host: null,
          action_bucket: "liked",
          family_visible: false,
          updated_at: new Date("2026-04-28T08:00:00Z"),
          comments: [],
        },
        {
          id: BigInt(3),
          lead_id: BigInt(5),
          title: "Family option",
          address: null,
          source_host: null,
          action_bucket: "saved",
          family_visible: true,
          updated_at: new Date("2026-04-28T09:00:00Z"),
          comments: [
            {
              id: BigInt(11),
              external_listing_id: BigInt(3),
              lead_id: BigInt(6),
              agent_id: null,
              request_type: "comment",
              created_at: new Date("2026-04-29T09:00:00Z"),
            },
          ],
        },
      ],
      financialIntent: {
        event_count: 2,
        last_tool_used_at: new Date("2026-04-29T11:00:00Z"),
        highest_budget_tested: 1300000,
        latest_budget_tested: 1300000,
        stretch_amount: 300000,
        stretch_percent: 30,
      },
    });

    expect(summary.counts.total).toBe(5);
    expect(summary.counts.tour_requested).toBe(2);
    expect(summary.counts.budget_stretch).toBe(1);
    expect(summary.counts.outside_listing_liked).toBe(1);
    expect(summary.counts.family_discussion).toBe(1);
    expect(summary.items.map((item) => item.priority).slice(0, 3)).toEqual(["urgent", "urgent", "urgent"]);
    expect(summary.items.some((item) => item.type === "outside_listing_liked")).toBe(true);
  });

  it("does not flag request-info after an agent response", () => {
    const summary = summarizeBuyerDailyPriorities({
      externalListings: [
        {
          id: BigInt(1),
          lead_id: BigInt(5),
          title: "Answered",
          address: null,
          source_host: null,
          action_bucket: "saved",
          family_visible: false,
          updated_at: new Date("2026-04-29T08:00:00Z"),
          comments: [
            {
              id: BigInt(10),
              external_listing_id: BigInt(1),
              lead_id: BigInt(5),
              agent_id: null,
              request_type: "request_info",
              created_at: new Date("2026-04-29T08:30:00Z"),
            },
            {
              id: BigInt(11),
              external_listing_id: BigInt(1),
              lead_id: null,
              agent_id: BigInt(7),
              request_type: "comment",
              created_at: new Date("2026-04-29T09:00:00Z"),
            },
          ],
        },
      ],
    });

    expect(summary.counts.request_info).toBe(0);
    expect(summary.counts.total).toBe(0);
  });
});
