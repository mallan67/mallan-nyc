import type { PortalEvent } from "@prisma/client";

type JsonObject = Record<string, unknown>;

const SELLER_SIGNAL_TYPES = new Set([
  "seller_valuation_request",
  "seller_proceeds_estimate",
  "seller_closing_cost_estimate",
  "seller_readiness_update",
]);

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeSellerSignalPayload(input: Record<string, unknown>) {
  const estimatedValue = numberValue(input.estimated_value);
  const desiredSalePrice = numberValue(input.desired_sale_price);
  const mortgagePayoff = numberValue(input.mortgage_payoff);
  const prepBudget = numberValue(input.prep_budget);
  const closingCosts = numberValue(input.closing_costs);
  const timeline = stringValue(input.timeline);
  const urgency = stringValue(input.urgency);
  const readiness = stringValue(input.readiness);
  const notes = stringValue(input.notes);
  const listingId = stringValue(input.listing_id);

  const salePrice = desiredSalePrice ?? estimatedValue;
  const netProceeds = salePrice !== null
    ? salePrice - (mortgagePayoff ?? 0) - (prepBudget ?? 0) - (closingCosts ?? 0)
    : null;

  return {
    listing_id: listingId,
    estimated_value: estimatedValue,
    desired_sale_price: desiredSalePrice,
    mortgage_payoff: mortgagePayoff,
    prep_budget: prepBudget,
    closing_costs: closingCosts,
    estimated_net_proceeds: netProceeds,
    timeline,
    urgency,
    readiness,
    notes,
  };
}

export function summarizeSellerSignals(
  events: Pick<PortalEvent, "id" | "event_type" | "metadata" | "created_at" | "listing_id">[],
) {
  const relevant = events
    .filter((event) => SELLER_SIGNAL_TYPES.has(event.event_type))
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

  const latestByType: Record<string, JsonObject & { recorded_at?: string; id?: string }> = {};
  for (const event of relevant) {
    if (latestByType[event.event_type]) continue;
    latestByType[event.event_type] = {
      ...objectValue(event.metadata),
      id: event.id.toString(),
      listing_id: event.listing_id ?? stringValue(objectValue(event.metadata).listing_id),
      recorded_at: event.created_at.toISOString(),
    };
  }

  const valuation = latestByType.seller_valuation_request || {};
  const proceeds = latestByType.seller_proceeds_estimate || {};
  const closing = latestByType.seller_closing_cost_estimate || {};
  const readiness = latestByType.seller_readiness_update || {};

  return {
    event_count: relevant.length,
    last_signal_at: relevant[0]?.created_at ?? null,
    latest_valuation_request: valuation,
    latest_proceeds_estimate: proceeds,
    latest_closing_cost_estimate: closing,
    latest_readiness_update: readiness,
    urgency: stringValue(readiness.urgency) ?? stringValue(valuation.urgency),
    timeline: stringValue(readiness.timeline) ?? stringValue(valuation.timeline),
    readiness: stringValue(readiness.readiness),
    estimated_value: numberValue(valuation.estimated_value) ?? numberValue(proceeds.estimated_value),
    desired_sale_price: numberValue(proceeds.desired_sale_price) ?? numberValue(valuation.desired_sale_price),
    estimated_net_proceeds: numberValue(proceeds.estimated_net_proceeds),
    closing_costs: numberValue(closing.closing_costs) ?? numberValue(proceeds.closing_costs),
    recent_events: relevant.slice(0, 20).map((event) => ({
      id: event.id.toString(),
      event_type: event.event_type,
      listing_id: event.listing_id,
      metadata: objectValue(event.metadata),
      recorded_at: event.created_at,
    })),
  };
}
