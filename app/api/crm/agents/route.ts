// app/api/crm/agents/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/crm/agents?q=maya
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { licenseNo: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};

    const agents = await prisma.agent.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        email2: true,
        licenseNo: true,
        licenseExpiry: true,
        saleSplit: true,
        rentSplit: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(agents, { status: 200 });
  } catch (e: any) {
    console.error("GET /api/crm/agents error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "Server error in /api/crm/agents",
        message: e?.message ?? null,
        code: e?.code ?? null,
      },
      { status: 500 }
    );
  }
}

// POST /api/crm/agents
// body: { firstName, lastName, email, email2?, licenseNo, licenseExpiry?, saleSplit?, rentSplit? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      firstName,
      lastName,
      email,
      email2,
      licenseNo,
      licenseExpiry,
      saleSplit,
      rentSplit,
    } = body || {};

    if (!firstName || !lastName || !email || !licenseNo) {
      return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
    }

    const agent = await prisma.agent.create({
      data: {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: String(email).trim().toLowerCase(),
        email2: email2 ? String(email2).trim().toLowerCase() : null,
        licenseNo: String(licenseNo).trim(),
        licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : null,
        saleSplit: saleSplit != null ? Number(saleSplit) : undefined,
        rentSplit: rentSplit != null ? Number(rentSplit) : undefined,
      },
    });

    return NextResponse.json({ ok: true, agent }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      // unique constraint (email or licenseNo)
      return NextResponse.json({ ok: false, error: "Email or license already exists." }, { status: 409 });
    }
    console.error("POST /api/crm/agents error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: "Server error in /api/crm/agents",
        message: e?.message ?? null,
        code: e?.code ?? null,
      },
      { status: 500 }
    );
  }
}
