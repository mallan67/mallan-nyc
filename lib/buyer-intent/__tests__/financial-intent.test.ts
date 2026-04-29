import { summarizeFinancialIntent } from "@/lib/buyer-intent/financial-intent";

function event(id: number, eventType: string, payload: Record<string, unknown>, recordedAt: string) {
  return {
    id: BigInt(id),
    event_type: eventType,
    payload: payload as never,
    recorded_at: new Date(recordedAt),
  };
}

describe("summarizeFinancialIntent", () => {
  it("summarizes buyer calculator usage and stretch over stated budget", () => {
    const summary = summarizeFinancialIntent(
      [
        event(2, "financial_tool_used", {
          context: "financial_tool",
          tool_type: "mortgage",
          inputs: { purchasePrice: 1250000, downPaymentPercent: 20 },
          results: { monthlyPayment: 7200, totalClosingCosts: 52000, totalCashNeeded: 302000 },
        }, "2026-04-29T12:00:00Z"),
        event(1, "financial_tool_used", {
          context: "financial_tool",
          tool_type: "affordability",
          inputs: { annualIncome: 275000, monthlyDebt: 700 },
          results: { maxPrice: 1100000, maxMonthlyHousing: 6800, downPayment: 220000 },
        }, "2026-04-28T12:00:00Z"),
        event(3, "page_view", { page: "/search" }, "2026-04-29T13:00:00Z"),
      ],
      1000000,
    );

    expect(summary.event_count).toBe(2);
    expect(summary.tools_used.map((tool) => tool.tool_type)).toEqual(["mortgage", "affordability"]);
    expect(summary.latest_budget_tested).toBe(1250000);
    expect(summary.highest_budget_tested).toBe(1250000);
    expect(summary.latest_monthly_payment).toBe(7200);
    expect(summary.latest_cash_needed).toBe(302000);
    expect(summary.latest_closing_costs).toBe(52000);
    expect(summary.stretch_amount).toBe(250000);
    expect(summary.stretch_percent).toBe(25);
  });

  it("keeps financial-tool lead requests as high-intent events", () => {
    const summary = summarizeFinancialIntent([
      event(1, "financial_tool_lead_request", {
        context: "financial_tool",
        tool_type: "rent-vs-buy",
        results: { estimatedPurchasePrice: "950,000", monthlyOwningCost: "$5,900" },
      }, "2026-04-29T12:00:00Z"),
    ]);

    expect(summary.event_count).toBe(1);
    expect(summary.tools_used[0].label).toBe("Rent vs Buy");
    expect(summary.latest_budget_tested).toBe(950000);
    expect(summary.latest_monthly_payment).toBe(5900);
  });
});
