// GET /api/crm/tools/cash-on-cash — calculate cash-on-cash return
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const purchase_price = Number(url.searchParams.get("purchase_price") || 0);
  const down_payment = Number(url.searchParams.get("down_payment") || 0);
  const closing_costs = Number(url.searchParams.get("closing_costs") || 0);
  const annual_rental_income = Number(url.searchParams.get("annual_rental_income") || 0);
  const annual_expenses = Number(url.searchParams.get("annual_expenses") || 0);
  const annual_mortgage_payment = Number(url.searchParams.get("annual_mortgage_payment") || 0);

  const total_cash_invested = down_payment + closing_costs;
  const annual_cash_flow = annual_rental_income - annual_expenses - annual_mortgage_payment;
  const cash_on_cash_return = total_cash_invested > 0
    ? (annual_cash_flow / total_cash_invested) * 100
    : 0;

  return NextResponse.json({
    purchase_price,
    total_cash_invested,
    annual_cash_flow,
    monthly_cash_flow: annual_cash_flow / 12,
    cash_on_cash_return: Math.round(cash_on_cash_return * 100) / 100,
  });
}
