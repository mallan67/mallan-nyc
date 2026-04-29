import { summarizeExternalListingActivity } from "@/lib/external-listings/rollup";

describe("external listing activity rollup", () => {
  it("groups buckets, request types, and response priorities", () => {
    const summary = summarizeExternalListingActivity([
      {
        id: BigInt(1),
        lead_id: BigInt(5),
        title: "Tour target",
        address: null,
        source_host: "example.com",
        action_bucket: "liked",
        family_visible: true,
        updated_at: new Date("2026-04-29T08:00:00.000Z"),
        comments: [
          {
            id: BigInt(10),
            external_listing_id: BigInt(1),
            lead_id: BigInt(5),
            agent_id: null,
            request_type: "showing_request",
            created_at: new Date("2026-04-29T08:05:00.000Z"),
          },
        ],
      },
      {
        id: BigInt(2),
        lead_id: BigInt(5),
        title: null,
        address: "123 Main St",
        source_host: null,
        action_bucket: "discuss",
        family_visible: false,
        updated_at: new Date("2026-04-29T08:10:00.000Z"),
        comments: [
          {
            id: BigInt(11),
            external_listing_id: BigInt(2),
            lead_id: BigInt(5),
            agent_id: null,
            request_type: "request_info",
            created_at: new Date("2026-04-29T08:11:00.000Z"),
          },
          {
            id: BigInt(12),
            external_listing_id: BigInt(2),
            lead_id: null,
            agent_id: BigInt(7),
            request_type: "comment",
            created_at: new Date("2026-04-29T08:12:00.000Z"),
          },
        ],
      },
    ]);

    expect(summary.total).toBe(2);
    expect(summary.buckets.liked).toBe(1);
    expect(summary.buckets.discuss).toBe(1);
    expect(summary.requests.showing_request).toBe(1);
    expect(summary.requests.request_info).toBe(1);
    expect(summary.family_visible).toBe(1);
    expect(summary.needs_agent_response).toBe(1);
    expect(summary.priority_items[0]).toMatchObject({
      external_listing_id: "1",
      reason: "Tour requested",
      priority: "urgent",
    });
  });
});
