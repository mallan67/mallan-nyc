import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/crm/agents?q=maya
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const where = q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName:  { contains: q, mode: "insensitive" } },
            { email:     { contains: q, mode: "insensitive" } },
            { licenseNo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const agents = await prisma.agent.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return NextResponse.json(Array.isArray(agents) ? agents : []);
  } catch (e: any) {
    console.error("GET /api/crm/agents error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "internal error" },
      { status: 500 }
    );
  }
}

// POST /api/crm/agents
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      firstName,
      lastName,
      email,
      altEmail,
      licenseNo,
      licenseExpire, // ISO date (optional)
      saleSplit = 0, // %
      rentSplit = 0, // %
    } = body ?? {};

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { ok: false, error: "firstName, lastName, email are required" },
        { status: 400 }
      );
    }

    const created = await prisma.agent.create({
      data: {
        firstName,
        lastName,
        email,
        altEmail: altEmail || null,
        licenseNo: licenseNo || null,
        licenseExpire: licenseExpire ? new Date(licenseExpire) : null,
        saleSplit: Number(saleSplit) || 0,
        rentSplit: Number(rentSplit) || 0,
      },
    });

    return NextResponse.json({ ok: true, agent: created }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/crm/agents error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "internal error" },
      { status: 500 }
    );
  }
}
