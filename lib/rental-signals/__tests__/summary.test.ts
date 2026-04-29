import {
  normalizeLandlordSignalPayload,
  normalizeTenantSignalPayload,
  summarizeLandlordSignals,
  summarizeTenantSignals,
} from "../summary";
import type { Prisma } from "@prisma/client";

const event = (id: bigint, event_type: string, metadata: Prisma.JsonObject, created_at: Date) => ({
  id,
  event_type,
  metadata,
  created_at,
  listing_id: typeof metadata.listing_id === "string" ? metadata.listing_id : null,
});

describe("rental signal summaries", () => {
  it("normalizes tenant rent-vs-buy and rental-link signals", () => {
    const payload = normalizeTenantSignalPayload({
      monthly_rent: "$4,200",
      target_purchase_price: "950000",
      monthly_ownership_budget: "6200",
      outside_rental_url: "https://example.com/rental",
      lease_intent: "buy_next",
    });

    expect(payload.monthly_rent).toBe(4200);
    expect(payload.target_purchase_price).toBe(950000);
    expect(payload.monthly_ownership_budget).toBe(6200);
    expect(payload.outside_rental_url).toBe("https://example.com/rental");
    expect(payload.lease_intent).toBe("buy_next");
  });

  it("summarizes tenant signals from newest events", () => {
    const summary = summarizeTenantSignals([
      event(1n, "tenant_rent_vs_buy_signal", { monthly_rent: 4000, target_purchase_price: 900000 }, new Date("2026-04-28T10:00:00Z")),
      event(2n, "tenant_document_readiness_update", { document_readiness: "ready" }, new Date("2026-04-29T10:00:00Z")),
    ]);

    expect(summary.event_count).toBe(2);
    expect(summary.monthly_rent).toBe(4000);
    expect(summary.target_purchase_price).toBe(900000);
    expect(summary.document_readiness).toBe("ready");
  });

  it("computes landlord vacancy cost", () => {
    const payload = normalizeLandlordSignalPayload({
      monthly_rent: "6000",
      expected_vacancy_days: "45",
      tenant_renewal_intent: "not_renewing",
    });

    expect(payload.estimated_vacancy_cost).toBe(9000);
    expect(payload.tenant_renewal_intent).toBe("not_renewing");
  });

  it("summarizes landlord workflow signals", () => {
    const summary = summarizeLandlordSignals([
      event(3n, "landlord_vacancy_cost_estimate", { monthly_rent: 5000, expected_vacancy_days: 30, estimated_vacancy_cost: 5000 }, new Date("2026-04-28T10:00:00Z")),
      event(4n, "landlord_relist_signal", { relist_timing: "60_days", lease_end_date: "2026-08-31" }, new Date("2026-04-29T10:00:00Z")),
    ]);

    expect(summary.event_count).toBe(2);
    expect(summary.monthly_rent).toBe(5000);
    expect(summary.estimated_vacancy_cost).toBe(5000);
    expect(summary.relist_timing).toBe("60_days");
  });
});
