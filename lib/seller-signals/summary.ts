import type { PortalEvent } from "@prisma/client";

type JsonObject = Record<string, unknown>;

const SELLER_SIGNAL_TYPES = new Set([
  "seller_valuation_request",
  "seller_proceeds_estimate",
  "seller_closing_cost_estimate",
  "seller_readiness_update",
]);

export const SELLER_SIGNAL_EVENT_TYPES = [...SELLER_SIGNAL_TYPES];

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

function normalizedText(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function moneyGap(desired: number | null, estimated: number | null): number | null {
  if (desired === null || estimated === null || estimated <= 0) return null;
  return desired - estimated;
}

function urgencyScore(value: unknown): number {
  const normalized = normalizedText(value);
  if (["asap", "urgent", "now", "immediate", "this_week"].includes(normalized)) return 25;
  if (["soon", "30_60_days", "this_month"].includes(normalized)) return 18;
  if (["exploring", "medium", "60_90_days"].includes(normalized)) return 10;
  return 0;
}

function timelineScore(value: unknown): number {
  const normalized = normalizedText(value);
  if (["now", "asap", "0_30_days", "this_month"].includes(normalized)) return 25;
  if (["30_60_days", "soon"].includes(normalized)) return 18;
  if (["60_90_days", "90_days", "this_quarter"].includes(normalized)) return 10;
  if (["6_months", "6_12_months", "next_year"].includes(normalized)) return 4;
  return 0;
}

function readinessScore(value: unknown): number {
  const normalized = normalizedText(value);
  if (["ready", "ready_to_list", "listing_ready", "done", "complete"].includes(normalized)) return 20;
  if (["mostly_ready", "prep_needed", "needs_prep", "in_progress"].includes(normalized)) return 12;
  if (["early", "not_ready", "unknown"].includes(normalized)) return 3;
  return 0;
}

function sellerTemperature(score: number): "hot" | "warm" | "nurture" | "cold" {
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  if (score >= 25) return "nurture";
  return "cold";
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

function buildMissingInputs(input: {
  estimatedValue: number | null;
  desiredSalePrice: number | null;
  mortgagePayoff: number | null;
  prepBudget: number | null;
  closingCosts: number | null;
  timeline: string | null;
  urgency: string | null;
  readiness: string | null;
}) {
  const missing: string[] = [];
  if (input.estimatedValue === null) missing.push("estimated_value");
  if (input.desiredSalePrice === null) missing.push("desired_sale_price");
  if (input.mortgagePayoff === null) missing.push("mortgage_payoff");
  if (input.prepBudget === null) missing.push("prep_budget");
  if (input.closingCosts === null) missing.push("closing_costs");
  if (!input.timeline) missing.push("timeline");
  if (!input.urgency) missing.push("urgency");
  if (!input.readiness) missing.push("readiness");
  return missing;
}

function nextSellerAction(input: {
  score: number;
  estimatedValue: number | null;
  desiredSalePrice: number | null;
  estimatedNetProceeds: number | null;
  timeline: string | null;
  urgency: string | null;
  readiness: string | null;
  missingInputs: string[];
}) {
  if (input.score >= 75) return "Book seller consult and prepare valuation packet";
  if (input.estimatedValue === null) return "Prepare valuation estimate";
  if (input.desiredSalePrice === null || input.estimatedNetProceeds === null) {
    return "Tighten proceeds estimate with desired price and payoff assumptions";
  }
  if (!input.timeline || !input.urgency) return "Confirm timing and motivation";
  if (!input.readiness || normalizedText(input.readiness).includes("prep")) {
    return "Review prep checklist and documents";
  }
  if (input.missingInputs.length > 0) return "Fill missing seller planning inputs";
  return "Keep on owner market report cadence";
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
  const urgency = stringValue(readiness.urgency) ?? stringValue(valuation.urgency);
  const timeline = stringValue(readiness.timeline) ?? stringValue(valuation.timeline);
  const readinessValue = stringValue(readiness.readiness);
  const estimatedValue = numberValue(valuation.estimated_value) ?? numberValue(proceeds.estimated_value);
  const desiredSalePrice = numberValue(proceeds.desired_sale_price) ?? numberValue(valuation.desired_sale_price);
  const estimatedNetProceeds = numberValue(proceeds.estimated_net_proceeds);
  const closingCosts = numberValue(closing.closing_costs) ?? numberValue(proceeds.closing_costs);
  const mortgagePayoff = numberValue(proceeds.mortgage_payoff) ?? numberValue(valuation.mortgage_payoff);
  const prepBudget = numberValue(proceeds.prep_budget) ?? numberValue(readiness.prep_budget);
  const pricingGap = moneyGap(desiredSalePrice, estimatedValue);
  const missingInputs = buildMissingInputs({
    estimatedValue,
    desiredSalePrice,
    mortgagePayoff,
    prepBudget,
    closingCosts,
    timeline,
    urgency,
    readiness: readinessValue,
  });
  const sellerSignalScore = Math.min(100, Math.round(
    (estimatedValue !== null ? 15 : 0) +
    (desiredSalePrice !== null ? 12 : 0) +
    (estimatedNetProceeds !== null ? 12 : 0) +
    urgencyScore(urgency) +
    timelineScore(timeline) +
    readinessScore(readinessValue) +
    (pricingGap !== null ? 5 : 0) +
    (relevant.length > 1 ? 5 : 0) +
    (stringValue(readiness.notes) || stringValue(valuation.notes) ? 4 : 0)
  ));

  return {
    event_count: relevant.length,
    last_signal_at: relevant[0]?.created_at ?? null,
    latest_valuation_request: valuation,
    latest_proceeds_estimate: proceeds,
    latest_closing_cost_estimate: closing,
    latest_readiness_update: readiness,
    urgency,
    timeline,
    readiness: readinessValue,
    estimated_value: estimatedValue,
    desired_sale_price: desiredSalePrice,
    estimated_net_proceeds: estimatedNetProceeds,
    closing_costs: closingCosts,
    mortgage_payoff: mortgagePayoff,
    prep_budget: prepBudget,
    desired_vs_estimated_gap: pricingGap,
    missing_inputs: missingInputs,
    seller_signal_score: sellerSignalScore,
    seller_temperature: sellerTemperature(sellerSignalScore),
    next_best_action: nextSellerAction({
      score: sellerSignalScore,
      estimatedValue,
      desiredSalePrice,
      estimatedNetProceeds,
      timeline,
      urgency,
      readiness: readinessValue,
      missingInputs,
    }),
    recent_events: relevant.slice(0, 20).map((event) => ({
      id: event.id.toString(),
      event_type: event.event_type,
      listing_id: event.listing_id,
      metadata: objectValue(event.metadata),
      recorded_at: event.created_at,
    })),
  };
}
