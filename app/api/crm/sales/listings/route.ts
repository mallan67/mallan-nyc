// /api/crm/sales/listings — GET: all sale listings with performance metrics
//
// Returned shape includes the UCBA Art. I auction columns directly off the
// Listing model (added in PR #50): auction_yn, auction_type,
// auction_start_date, auction_end_date, auction_terms_url. Agents reading
// the CRM listing list see auction status alongside DOM, showings, and
// inquiries. Validator AU-001..AU-005 (lib/compliance/rls-enforcement.ts,
// PR #57) gates auction submissions on the write path; the form sub-section
// in public/crm/SALE-FORM-REDESIGN.html (C3c) feeds those validators.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getCurrentDom } from "@/lib/compliance/dom-tracker";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const where: Record<string, unknown> = {
    listing_type: "sale",
  };

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  const listings = await prisma.listing.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      _count: {
        select: {
          showings: true,
          // Inquiry model added in master refactor PR C1; available once
          // the migration `20260426030000_add_inquiry_model` runs against
          // Neon prod. Until then `_count.inquiries` returns 0 cleanly.
          inquiries: true,
        },
      },
    },
  });

  // Look up seller names for these listings
  const listingIds = listings.map((l) => l.listing_id);
  const sellerLeads = listingIds.length > 0
    ? await prisma.lead.findMany({
        where: { active_sale_listing_id: { in: listingIds } },
        select: { active_sale_listing_id: true, first_name: true, last_name: true },
      })
    : [];
  const sellerMap = new Map(
    sellerLeads.map((s) => [s.active_sale_listing_id!, `${s.first_name} ${s.last_name}`.trim()])
  );

  const enriched = listings.map((l) => {
    const addr = typeof l.address === "object" && l.address !== null
      ? (l.address as Record<string, string>).UnparsedAddress || (l.address as Record<string, string>).full || ""
      : String(l.address || "");

    // UCBA Art. I §11 DOM: honors stored days_on_market + 30-day reset rule +
    // ComingSoon / Participant-Only suppression. Do NOT replace with (now - created_at).
    const permissions = typeof l.compliance === "object" && l.compliance !== null
      ? (l.compliance as Record<string, unknown>).Permissions as string | null | undefined
      : null;
    const dom = getCurrentDom({
      status: l.status || "Active",
      permissions: permissions ?? null,
      status_changed_at: l.status_changed_at,
      first_active_date: l.first_active_date,
      days_on_market: l.days_on_market || 0,
    });

    return {
      ...l,
      id: String(l.id),
      listing_id: l.listing_id,
      agent_id: l.agent_id ? String(l.agent_id) : null,
      address: addr,
      dom,
      showings_count: l._count?.showings || 0,
      inquiries_count: l._count?.inquiries || 0,
      seller_name: sellerMap.get(l.listing_id) || "",
    };
  });

  return NextResponse.json({ listings: enriched });
}
