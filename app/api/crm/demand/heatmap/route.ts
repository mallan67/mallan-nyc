// /api/crm/demand/heatmap
// GET: All neighborhoods with scores for heatmap visualization
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const borough = searchParams.get("borough");

  const where: Record<string, unknown> = {};
  if (borough) where.borough = borough;

  const indices = await prisma.demandIndex.findMany({
    where,
    select: {
      neighborhood: true,
      borough: true,
      score: true,
      trend: true,
      trend_delta: true,
      signal_count: true,
      last_computed: true,
    },
    orderBy: { score: "desc" },
  });

  return NextResponse.json({
    ok: true,
    total: indices.length,
    items: indices,
  });
}
