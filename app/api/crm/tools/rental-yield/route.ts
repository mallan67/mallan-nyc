// GET /api/crm/tools/rental-yield — calculate rental yield
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const property_value = Number(url.searchParams.get("property_value") || 0);
  const monthly_rent = Number(url.searchParams.get("monthly_rent") || 0);
  const annual_expenses = Number(url.searchParams.get("annual_expenses") || 0);

  const annual_gross = monthly_rent * 12;
  const annual_net = annual_gross - annual_expenses;
  const gross_yield = property_value > 0 ? (annual_gross / property_value) * 100 : 0;
  const net_yield = property_value > 0 ? (annual_net / property_value) * 100 : 0;

  return NextResponse.json({
    property_value,
    annual_gross_income: annual_gross,
    annual_net_income: annual_net,
    gross_yield: Math.round(gross_yield * 100) / 100,
    net_yield: Math.round(net_yield * 100) / 100,
  });
}
