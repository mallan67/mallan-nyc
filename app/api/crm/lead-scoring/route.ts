// /api/crm/lead-scoring — GET: list lead scores
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const grade = searchParams.get("grade");
  const minScore = parseInt(searchParams.get("min_score") || "0");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};
  if (grade) where.grade = grade;
  if (minScore > 0) where.score = { gte: minScore };

  // Scope to agent's leads
  if (auth.role !== "BROKER") {
    where.lead = { agent_id: auth.userId };
  }

  const [scores, total] = await Promise.all([
    prisma.leadScore.findMany({
      where, orderBy: { score: "desc" }, take: limit, skip: offset,
      include: {
        lead: { select: { id: true, first_name: true, last_name: true, email: true, phone: true, status: true, source: true } },
      },
    }),
    prisma.leadScore.count({ where }),
  ]);

  const serialized = scores.map(s => ({
    ...s, id: s.id.toString(), lead_id: s.lead_id.toString(),
    lead: s.lead ? { ...s.lead, id: s.lead.id.toString() } : null,
  }));

  return NextResponse.json({ total, items: serialized });
}
