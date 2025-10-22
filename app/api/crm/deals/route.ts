import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/crm/deals
export async function GET() {
  try {
    const deals = await prisma.deal.findMany({
      include: { agent: true },
      orderBy: { createdAt: "desc" },
    });
    // Always return an array, even if empty
    return NextResponse.json(Array.isArray(deals) ? deals : []);
  } catch (e: any) {
    console.error("GET /api/crm/deals error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "internal error" },
      { status: 500 }
    );
  }
}

// POST /api/crm/deals
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      agentId,
      type,            // "SALE" | "RENTAL"
      address,
      price = 0,
      agentPct = 0,    // number (0-100)
      agentAmt = 0,    // number (optional explicit $)
      signedAt,        // ISO string
      closedAt,        // ISO string
    } = body ?? {};

    if (!agentId || !type || !address) {
      return NextResponse.json(
        { ok: false, error: "agentId, type and address are required" },
        { status: 400 }
      );
    }

    const created = await prisma.deal.create({
      data: {
        agentId,
        type,
        address,
        price: Number(price) || 0,
        agentPct: Number(agentPct) || 0,
        agentAmt: Number(agentAmt) || 0,
        signedAt: signedAt ? new Date(signedAt) : null,
        closedAt: closedAt ? new Date(closedAt) : null,
      },
      include: { agent: true },
    });

    return NextResponse.json({ ok: true, deal: created }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/crm/deals error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "internal error" },
      { status: 500 }
    );
  }
}
