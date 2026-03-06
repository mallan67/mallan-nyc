// POST /api/portal/complete-profile
// Updates phone + portal_role for OAuth users completing their profile
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const VALID_ROLES = ["buyer", "renter", "seller", "landlord"];

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (session instanceof NextResponse) return session;

    if (session.userType !== "lead") {
      return NextResponse.json({ error: "Agents do not need to complete profile" }, { status: 400 });
    }

    const body = await req.json();
    const { phone, roles } = body;

    if (!phone?.trim()) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const validRoles = (roles || []).filter((r: string) => VALID_ROLES.includes(r));
    if (validRoles.length === 0) {
      return NextResponse.json({ error: "At least one role is required" }, { status: 400 });
    }

    const portalRole = validRoles.includes("buyer") ? "buyer"
      : validRoles.includes("renter") ? "tenant"
      : validRoles.includes("seller") ? "seller"
      : validRoles.includes("landlord") ? "landlord"
      : "buyer";

    await prisma.lead.update({
      where: { id: session.userId },
      data: {
        phone: phone.trim(),
        roles: validRoles,
        portal_role: portalRole,
      },
    });

    return NextResponse.json({ success: true, role: portalRole });
  } catch (err) {
    console.error("Complete profile error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
