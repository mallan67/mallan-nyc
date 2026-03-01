// GET /api/auth/me
// Returns the current authenticated user from session cookie.
//
// Canonical response contract (ALL frontend files depend on this shape):
// {
//   authenticated: boolean,
//   principalType: "agent" | "lead",
//   role: "BROKER" | "AGENT" | "buyer" | "tenant" | "seller" | "landlord",
//   portalRole: string | null,          // client portal role (lead only)
//   user: {
//     id: string,
//     name: string,
//     email: string,
//     phone: string | null,
//     license: string | null,           // agent license number
//     licenseTitle: string | null,      // "Licensed Real Estate Broker" | "Licensed Real Estate Salesperson"
//     companyKey: "mallan",
//     companyName: "Mallan Real Estate Inc.",
//     photo: string | null,
//   } | null
// }
import { NextRequest, NextResponse } from "next/server";
import { validateSession, SESSION_COOKIE } from "@/lib/auth";
import prisma from "@/lib/prisma";

function licenseTitle(type: string | null): string | null {
  if (!type) return null;
  if (type === "broker") return "Licensed Real Estate Broker";
  return "Licensed Real Estate Salesperson";
}

export async function GET(req: NextRequest) {
  // Check Bearer header first (cross-origin), then cookie (same-origin)
  const authHeader = req.headers.get("authorization");
  const token = (authHeader && authHeader.startsWith("Bearer "))
    ? authHeader.slice(7)
    : req.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({
      authenticated: false,
      principalType: null,
      role: null,
      portalRole: null,
      user: null,
    });
  }

  const session = await validateSession(token);
  if (!session) {
    const res = NextResponse.json({
      authenticated: false,
      principalType: null,
      role: null,
      portalRole: null,
      user: null,
    });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (session.userType === "agent") {
    const agent = await prisma.agent.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        full_name: true,
        email: true,
        role: true,
        license_no: true,
        license_type: true,
        phone: true,
      },
    });
    if (!agent) {
      return NextResponse.json({
        authenticated: false,
        principalType: null,
        role: null,
        portalRole: null,
        user: null,
      });
    }
    return NextResponse.json({
      authenticated: true,
      principalType: "agent",
      role: agent.role,          // "BROKER" | "AGENT"
      portalRole: null,
      user: {
        id: agent.id.toString(),
        name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
        email: agent.email,
        phone: agent.phone || null,
        license: agent.license_no || null,
        licenseTitle: licenseTitle(agent.license_type),
        companyKey: "mallan",
        companyName: "Mallan Real Estate Inc.",
        photo: null,
      },
    });
  } else {
    const lead = await prisma.lead.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        portal_role: true,
      },
    });
    if (!lead) {
      return NextResponse.json({
        authenticated: false,
        principalType: null,
        role: null,
        portalRole: null,
        user: null,
      });
    }
    return NextResponse.json({
      authenticated: true,
      principalType: "lead",
      role: lead.portal_role || session.role,
      portalRole: lead.portal_role || null,
      user: {
        id: lead.id.toString(),
        name: `${lead.first_name} ${lead.last_name}`,
        email: lead.email,
        phone: lead.phone || null,
        license: null,
        licenseTitle: null,
        companyKey: "mallan",
        companyName: "Mallan Real Estate Inc.",
        photo: null,
      },
    });
  }
}
