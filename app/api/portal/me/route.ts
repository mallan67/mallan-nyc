// GET /api/portal/me
// Client's own profile (for portal use). Lead users only.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";
import { sanitizeLeadForPortal } from "@/lib/compliance/dto";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    include: { preferences: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Portals Tier A P0 — delegate field-allowlist to the shared sanitizer
  // so /api/portal/me cannot drift from the central client-self-view rules.
  // Spread comes first; explicit overrides after handle BigInt/Decimal
  // serialization that NextResponse.json can't do automatically.
  const safeLead = sanitizeLeadForPortal(lead as unknown as Record<string, unknown>);

  return NextResponse.json({
    ...safeLead,
    id: lead.id.toString(),
    preferences: lead.preferences
      ? {
          id: lead.preferences.id.toString(),
          property_types: lead.preferences.property_types,
          neighborhoods: lead.preferences.neighborhoods,
          boroughs: lead.preferences.boroughs,
          min_beds: lead.preferences.min_beds,
          max_beds: lead.preferences.max_beds,
          min_baths: lead.preferences.min_baths,
          min_price: lead.preferences.min_price?.toString() ?? null,
          max_price: lead.preferences.max_price?.toString() ?? null,
          min_sqft: lead.preferences.min_sqft,
          must_haves: lead.preferences.must_haves,
          deal_breakers: lead.preferences.deal_breakers,
          notes: lead.preferences.notes,
        }
      : null,
  });
}
