// /api/crm/automation/status — GET: per-lead drip status + tier
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const crmType = url.searchParams.get("crm_type"); // "sales" | "rentals"

  const where: Record<string, unknown> = {
    status: { in: ["active", "contacted", "new"] },
  };

  if (auth.role !== "BROKER") {
    where.agent_id = auth.userId;
  }

  // Filter by CRM type
  if (crmType === "sales") {
    where.roles = { hasSome: ["buyer", "seller"] };
  } else if (crmType === "rentals") {
    where.roles = { hasSome: ["renter", "landlord"] };
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { updated_at: "desc" },
    take: 200,
    select: {
      id: true,
      first_name: true,
      last_name: true,
      roles: true,
      sales_drip_on: true,
      rental_drip_on: true,
      renewal_drip_on: true,
      sales_drip_status: true,
      rental_drip_status: true,
      last_sales_email_opened: true,
      last_rental_email_opened: true,
      last_response_at: true,
      last_viewed_listing_at: true,
    },
  });

  const contacts = leads.map((l) => {
    const primaryRole = l.roles[0] || "unknown";
    return {
      id: String(l.id),
      name: `${l.first_name} ${l.last_name}`.trim(),
      type: primaryRole,
      sales_drip_on: l.sales_drip_on,
      rental_drip_on: l.rental_drip_on,
      renewal_drip_on: l.renewal_drip_on,
      sales_drip_status: l.sales_drip_status || "paused",
      rental_drip_status: l.rental_drip_status || "paused",
      last_sales_email_opened: l.last_sales_email_opened,
      last_rental_email_opened: l.last_rental_email_opened,
      last_response_at: l.last_response_at,
      last_viewed_listing_at: l.last_viewed_listing_at,
    };
  });

  return NextResponse.json({ contacts });
}
