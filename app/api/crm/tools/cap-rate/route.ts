// GET /api/crm/tools/cap-rate — calculate cap rate
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const purchase_price = Number(url.searchParams.get("purchase_price") || 0);
  const gross_rental_income = Number(url.searchParams.get("gross_rental_income") || 0);
  const vacancy_rate = Number(url.searchParams.get("vacancy_rate") || 5) / 100;
  const operating_expenses = Number(url.searchParams.get("operating_expenses") || 0);

  const effective_gross = gross_rental_income * (1 - vacancy_rate);
  const noi = effective_gross - operating_expenses;
  const cap_rate = purchase_price > 0 ? (noi / purchase_price) * 100 : 0;

  return NextResponse.json({
    purchase_price,
    effective_gross_income: Math.round(effective_gross),
    noi: Math.round(noi),
    cap_rate: Math.round(cap_rate * 100) / 100,
  });
}
