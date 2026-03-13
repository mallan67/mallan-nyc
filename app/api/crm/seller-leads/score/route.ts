// /api/crm/seller-leads/score
// POST: Trigger scoring for a specific lead or batch re-score stale leads
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { scoreSellerLead, batchRescore } from "@/lib/seller-readiness/scorer";

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const { seller_lead_id, batch } = body as { seller_lead_id?: string; batch?: boolean };

  // Batch re-score (broker only)
  if (batch) {
    if (auth.role !== "BROKER") {
      return NextResponse.json({ ok: false, error: "Only broker can trigger batch scoring" }, { status: 403 });
    }
    const count = await batchRescore(50);
    return NextResponse.json({ ok: true, scored: count });
  }

  // Single lead scoring
  if (!seller_lead_id) {
    return NextResponse.json({ ok: false, error: "seller_lead_id required" }, { status: 400 });
  }

  try {
    const result = await scoreSellerLead(BigInt(seller_lead_id));
    return NextResponse.json({
      ok: true,
      score: result.readiness_score,
      grade: result.score_grade,
      signal_count: result.signals.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Scoring failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
