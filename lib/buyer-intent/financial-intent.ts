import type { IntentEvent } from "@prisma/client";

type JsonObject = Record<string, unknown>;

export interface FinancialIntentToolUsage {
  tool_type: string;
  label: string;
  count: number;
  last_used_at: Date;
  latest_inputs: JsonObject;
  latest_results: JsonObject;
}

export interface FinancialIntentSummary {
  event_count: number;
  tools_used: FinancialIntentToolUsage[];
  last_tool_used_at: Date | null;
  latest_budget_tested: number | null;
  highest_budget_tested: number | null;
  latest_monthly_payment: number | null;
  highest_monthly_payment: number | null;
  latest_cash_needed: number | null;
  latest_closing_costs: number | null;
  latest_down_payment: number | null;
  stretch_amount: number | null;
  stretch_percent: number | null;
  recent_events: Array<{
    id: string;
    event_type: string;
    recorded_at: Date;
    tool_type: string | null;
    payload: JsonObject;
  }>;
}

const FINANCIAL_EVENT_TYPES = new Set([
  "financial_tool_used",
  "financial_tool_lead_request",
  "calculator_used",
  "calculator_affordability",
  "calculator_mortgage",
  "calculator_closing_cost",
  "calculator_rent_vs_buy",
  "rent_vs_buy_viewed",
]);

const TOOL_LABELS: Record<string, string> = {
  affordability: "Affordability",
  mortgage: "Mortgage",
  closing_cost: "Closing Costs",
  "closing-cost": "Closing Costs",
  rent_vs_buy: "Rent vs Buy",
  "rent-vs-buy": "Rent vs Buy",
  investor: "Investment Analysis",
  future_valuation: "Future Valuation",
};

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function hasKeys(value: JsonObject): boolean {
  return Object.keys(value).length > 0;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[$,%\s,]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstNumber(source: JsonObject, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberValue(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function payloadToolType(payload: JsonObject, eventType: string): string | null {
  const explicit = payload.tool_type || payload.toolType || payload.calculatorType || payload.calculator_type;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (eventType === "rent_vs_buy_viewed") return "rent_vs_buy";
  if (eventType.startsWith("calculator_")) return eventType.replace("calculator_", "");
  return null;
}

function isFinancialPayload(eventType: string, payload: JsonObject): boolean {
  if (FINANCIAL_EVENT_TYPES.has(eventType)) return true;
  return payloadToolType(payload, eventType) !== null && (
    hasKeys(objectValue(payload.inputs)) ||
    hasKeys(objectValue(payload.results)) ||
    payload.context === "financial_tool"
  );
}

function eventMetrics(payload: JsonObject): {
  budget: number | null;
  monthlyPayment: number | null;
  cashNeeded: number | null;
  closingCosts: number | null;
  downPayment: number | null;
} {
  const inputs = objectValue(payload.inputs);
  const results = objectValue(payload.results);
  const merged = { ...inputs, ...results, ...payload };

  return {
    budget: firstNumber(merged, [
      "maxPrice",
      "max_price",
      "purchasePrice",
      "purchase_price",
      "estimatedPurchasePrice",
      "budget",
      "price",
    ]),
    monthlyPayment: firstNumber(merged, [
      "totalMonthly",
      "total_monthly",
      "monthlyPayment",
      "monthly_payment",
      "monthlyOwningCost",
      "maxMonthlyHousing",
      "max_monthly_housing",
    ]),
    cashNeeded: firstNumber(merged, [
      "totalCashNeeded",
      "total_cash_needed",
      "cashNeeded",
      "cash_needed",
      "availableFundsNeeded",
    ]),
    closingCosts: firstNumber(merged, [
      "totalClosingCosts",
      "total_closing_costs",
      "closingCosts",
      "closing_costs",
    ]),
    downPayment: firstNumber(merged, [
      "downPayment",
      "down_payment",
      "downPaymentAmount",
      "down_payment_amount",
    ]),
  };
}

export function summarizeFinancialIntent(
  events: Pick<IntentEvent, "id" | "event_type" | "payload" | "recorded_at">[],
  statedBudgetMax?: number | null,
): FinancialIntentSummary {
  const relevant = events
    .map((event) => ({
      event,
      payload: objectValue(event.payload),
    }))
    .filter(({ event, payload }) => isFinancialPayload(event.event_type, payload))
    .sort((a, b) => b.event.recorded_at.getTime() - a.event.recorded_at.getTime());

  const byTool = new Map<string, FinancialIntentToolUsage>();
  let latestBudgetTested: number | null = null;
  let highestBudgetTested: number | null = null;
  let latestMonthlyPayment: number | null = null;
  let highestMonthlyPayment: number | null = null;
  let latestCashNeeded: number | null = null;
  let latestClosingCosts: number | null = null;
  let latestDownPayment: number | null = null;

  for (const { event, payload } of relevant) {
    const toolType = payloadToolType(payload, event.event_type) || "financial_tool";
    const inputs = objectValue(payload.inputs);
    const results = objectValue(payload.results);
    const current = byTool.get(toolType);

    if (!current) {
      byTool.set(toolType, {
        tool_type: toolType,
        label: TOOL_LABELS[toolType] || toolType.replace(/[-_]/g, " "),
        count: 1,
        last_used_at: event.recorded_at,
        latest_inputs: inputs,
        latest_results: results,
      });
    } else {
      current.count++;
      if (event.recorded_at > current.last_used_at) {
        current.last_used_at = event.recorded_at;
        current.latest_inputs = inputs;
        current.latest_results = results;
      }
    }

    const metrics = eventMetrics(payload);
    if (latestBudgetTested === null && metrics.budget !== null) latestBudgetTested = metrics.budget;
    if (latestMonthlyPayment === null && metrics.monthlyPayment !== null) latestMonthlyPayment = metrics.monthlyPayment;
    if (latestCashNeeded === null && metrics.cashNeeded !== null) latestCashNeeded = metrics.cashNeeded;
    if (latestClosingCosts === null && metrics.closingCosts !== null) latestClosingCosts = metrics.closingCosts;
    if (latestDownPayment === null && metrics.downPayment !== null) latestDownPayment = metrics.downPayment;

    if (metrics.budget !== null) highestBudgetTested = Math.max(highestBudgetTested ?? 0, metrics.budget);
    if (metrics.monthlyPayment !== null) {
      highestMonthlyPayment = Math.max(highestMonthlyPayment ?? 0, metrics.monthlyPayment);
    }
  }

  const toolsUsed = [...byTool.values()].sort((a, b) => b.last_used_at.getTime() - a.last_used_at.getTime());
  const stretchAmount =
    highestBudgetTested !== null && statedBudgetMax !== null && statedBudgetMax !== undefined
      ? highestBudgetTested - statedBudgetMax
      : null;

  return {
    event_count: relevant.length,
    tools_used: toolsUsed,
    last_tool_used_at: toolsUsed[0]?.last_used_at ?? null,
    latest_budget_tested: latestBudgetTested,
    highest_budget_tested: highestBudgetTested,
    latest_monthly_payment: latestMonthlyPayment,
    highest_monthly_payment: highestMonthlyPayment,
    latest_cash_needed: latestCashNeeded,
    latest_closing_costs: latestClosingCosts,
    latest_down_payment: latestDownPayment,
    stretch_amount: stretchAmount,
    stretch_percent:
      stretchAmount !== null && statedBudgetMax && statedBudgetMax > 0
        ? Math.round((stretchAmount / statedBudgetMax) * 1000) / 10
        : null,
    recent_events: relevant.slice(0, 20).map(({ event, payload }) => ({
      id: event.id.toString(),
      event_type: event.event_type,
      recorded_at: event.recorded_at,
      tool_type: payloadToolType(payload, event.event_type),
      payload,
    })),
  };
}
