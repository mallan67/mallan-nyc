// /api/crm/market-report — AI Market Report Builder
// POST: Generate a new market report
// GET: List previously generated reports (future: store in DB)
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { generateMarketReport } from "@/lib/market-report/generator";

export const maxDuration = 60; // AI generation can take time

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const {
      report_type = "both",
      property_types = ["Condo", "Co-op", "Condop", "Townhouse"],
      borough,
      neighborhoods,
      period,
    } = body;

    if (!["sale", "rent", "both"].includes(report_type)) {
      return NextResponse.json(
        { error: "report_type must be sale, rent, or both" },
        { status: 400 }
      );
    }

    const report = await generateMarketReport({
      report_type,
      property_types,
      borough: borough || undefined,
      neighborhoods: neighborhoods || undefined,
      period: period || undefined,
    });

    return NextResponse.json({ report });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[market-report] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
