// /api/crm/market-liquidity — Market Liquidity Index
// GET ?neighborhood=Upper+East+Side&type=sale  — single neighborhood
// GET ?type=sale                                 — all neighborhoods ranked
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { computeLiquidity, computeAllLiquidity } from "@/lib/market-liquidity/indexer";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const neighborhood = req.nextUrl.searchParams.get("neighborhood");
  const listingType = req.nextUrl.searchParams.get("type") || "sale";

  try {
    if (neighborhood) {
      const result = await computeLiquidity(neighborhood, listingType);
      if (!result) {
        return NextResponse.json(
          { ok: false, error: "No data for this neighborhood" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, ...result });
    }

    const results = await computeAllLiquidity(listingType);
    return NextResponse.json({
      ok: true,
      count: results.length,
      neighborhoods: results,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[market-liquidity] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
