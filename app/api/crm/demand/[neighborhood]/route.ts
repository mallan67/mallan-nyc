// /api/crm/demand/[neighborhood]
// GET: Demand index detail for a specific neighborhood
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { computeDemandIndex } from "@/lib/demand-heatmap/indexer";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ neighborhood: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { neighborhood } = await params;
  const decoded = decodeURIComponent(neighborhood);

  // Try to get existing index
  let index = await prisma.demandIndex.findUnique({
    where: { neighborhood: decoded },
  });

  // If stale (>24h), recompute
  if (index) {
    const staleMs = Date.now() - index.last_computed.getTime();
    if (staleMs > 24 * 60 * 60 * 1000) {
      try {
        await computeDemandIndex(decoded);
        index = await prisma.demandIndex.findUnique({ where: { neighborhood: decoded } });
      } catch {
        // serve stale data
      }
    }
  }

  if (!index) {
    return NextResponse.json({ ok: false, error: "No demand data for this neighborhood" }, { status: 404 });
  }

  // Get recent signals
  const signals = await prisma.demandSignal.findMany({
    where: { neighborhood: decoded },
    orderBy: { collected_at: "desc" },
    take: 20,
  });

  return NextResponse.json({
    ok: true,
    item: { ...index, id: index.id.toString() },
    signals: signals.map(s => ({ ...s, id: s.id.toString() })),
  });
}
