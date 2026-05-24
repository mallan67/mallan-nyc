// POST /api/portal/complete-profile
// Updates phone + portal_role for OAuth users completing their profile
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkPortalWriteRateLimit } from "@/lib/middleware/rate-limiter";

const VALID_ROLES = ["buyer", "renter", "seller", "landlord"];

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    if (session instanceof NextResponse) return session;

    // PR-CRM.5 (2026-05-24) — portal_write rate limit (30/hr/user)
    const limited = await checkPortalWriteRateLimit(session.userId);
    if (limited) return limited;

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

    // Derive workspaces from roles (renter → "tenant" workspace, others 1:1)
    const workspaceMap: Record<string, string> = { buyer: "buyer", renter: "tenant", seller: "seller", landlord: "landlord" };
    const enabledWorkspaces = validRoles.map((r: string) => workspaceMap[r] || r);

    // Primary portal role: first role selected (user's default landing)
    const primaryRole = enabledWorkspaces[0] || "buyer";

    // Legacy portal_role: keep for backward compat — use first role with precedence
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
        portal_role: portalRole,                   // LEGACY — kept for compat
        primary_portal_role: primaryRole,           // NEW — default landing workspace
        enabled_workspaces: enabledWorkspaces,      // NEW — all accessible portals
      },
    });

    return NextResponse.json({
      success: true,
      role: portalRole,
      primaryPortalRole: primaryRole,
      enabledWorkspaces,
    });
  } catch (err) {
    console.error("Complete profile error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
