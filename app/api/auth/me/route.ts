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
//     companyLicense: string | null,    // brokerage license number
//     companyAddress: string | null,    // brokerage address
//     companyPhone: string | null,      // brokerage phone
//     photo: string | null,
//   } | null
// }
import { NextRequest, NextResponse } from "next/server";
import { validateSession, SESSION_COOKIE } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";

// Company settings — sourced from data/company-settings.json with hardcoded fallbacks
async function getCompanyInfo() {
  try {
    const data = await readFile(path.join(process.cwd(), "data", "company-settings.json"), "utf-8");
    const settings = JSON.parse(data);
    return {
      companyLicense: settings.license || null,
      companyAddress: settings.address
        ? `${settings.address.street}, ${settings.address.city}, ${settings.address.state} ${settings.address.zip}`
        : null,
      companyPhone: settings.phone || null,
    };
  } catch {
    return { companyLicense: null, companyAddress: null, companyPhone: null };
  }
}

function licenseTitle(type: string | null): string | null {
  if (!type) return null;
  if (type === "broker") return "Licensed Real Estate Broker";
  return "Licensed Real Estate Salesperson";
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

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
        trestle_mls_id: true,
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
    const company = await getCompanyInfo();
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
        // Cotality/Trestle MLS member id (Cotality ListAgentMlsId). This — NOT the
        // NY State `license` and NOT the internal `id` — is the authoritative
        // cross-source agent identifier. The sale form stamps it onto
        // agent_info.ListAgentMlsId so CRM exclusives are Cotality-matchable.
        mlsId: agent.trestle_mls_id || null,
        companyKey: "mallan",
        companyName: "Mallan Real Estate Inc.",
        companyLicense: company.companyLicense,
        companyAddress: company.companyAddress,
        companyPhone: company.companyPhone,
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
        primary_portal_role: true,
        enabled_workspaces: true,
        roles: true,
        email_verified_at: true,
        source: true,
      },
    });
    if (!lead) {
      return NextResponse.json({
        authenticated: false,
        principalType: null,
        role: null,
        portalRole: null,
        roles: [],
        primaryPortalRole: null,
        enabledWorkspaces: [],
        user: null,
      });
    }
    // Derive enabled workspaces from roles if not explicitly set
    const enabledWorkspaces = lead.enabled_workspaces.length > 0
      ? lead.enabled_workspaces
      : (lead.roles || []).map((r: string) => r === "renter" ? "tenant" : r);
    const primaryPortalRole = lead.primary_portal_role || lead.portal_role || enabledWorkspaces[0] || null;

    return NextResponse.json({
      authenticated: true,
      principalType: "lead",
      role: lead.portal_role || session.role,
      portalRole: lead.portal_role || null,   // LEGACY — kept for backward compat
      roles: lead.roles || [],
      primaryPortalRole,
      enabledWorkspaces,
      emailVerified: !!lead.email_verified_at,
      source: lead.source || 'website',
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
