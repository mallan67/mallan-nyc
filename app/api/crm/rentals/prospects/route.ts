// /api/crm/rentals/prospects — GET: viewed/did-not-rent prospects
// POST: create a new prospect record
// PATCH: update prospect fields (outreach dates, buyer potential, etc.)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // Prospects = renters who:
  // - Have pipeline_stage "viewed_not_rent" or "past" or "closed"
  // - OR have an expired lease (lease_end_date in the past)
  // - OR are renters with no active lease and not currently active
  // Exclude current active tenants (those with future lease_end_date and status=active)
  const now = new Date();
  const agentFilter = auth.role !== "BROKER" ? auth.userId : undefined;

  const prospects = await prisma.lead.findMany({
    where: {
      roles: { has: "renter" },
      ...(agentFilter ? { agent_id: agentFilter } : {}),
      OR: [
        { pipeline_stage: "viewed_not_rent" },
        { pipeline_stage: "past" },
        { pipeline_stage: "closed" },
        { lease_end_date: { lt: now } },
        {
          AND: [
            { lease_end_date: null },
            { status: { not: "active" } },
          ],
        },
      ],
      // Exclude anyone with a future lease (they're current tenants)
      NOT: {
        AND: [
          { lease_end_date: { gte: now } },
          { status: "active" },
        ],
      },
    },
    orderBy: { updated_at: "desc" },
    take: 200,
    include: {
      showing_history: {
        orderBy: { showing_date: "desc" },
      },
    },
  });

  const enriched = prospects.map((p) => {
    const allShowings = p.showing_history || [];
    const lastShowing = allShowings[0];

    return {
      id: String(p.id),
      agent_id: p.agent_id ? String(p.agent_id) : null,
      first_name: p.first_name,
      last_name: p.last_name,
      name: `${p.first_name} ${p.last_name}`.trim(),
      email: p.email,
      phone: p.phone,
      roles: p.roles,
      status: p.status,
      pipeline_stage: p.pipeline_stage,
      source: p.source,
      notes: p.notes,

      // Secondary person
      secondary_first_name: p.secondary_first_name,
      secondary_last_name: p.secondary_last_name,
      secondary_email: p.secondary_email,
      secondary_phone: p.secondary_phone,
      secondary_relationship: p.secondary_relationship,

      // Entity
      entity_name: p.entity_name,
      entity_type: p.entity_type,
      authorized_signatories: p.authorized_signatories,

      // Renter-specific
      no_fee_only: p.no_fee_only,
      exclusive_acceptable: p.exclusive_acceptable,
      building_type_pref: p.building_type_pref,
      guarantor_needed: p.guarantor_needed,
      docs_readiness: p.docs_readiness,
      rent_per_month: p.rent_per_month ? Number(p.rent_per_month) : null,

      // Behavior tracking
      last_login_at: p.last_login_at,
      last_response_at: p.last_response_at,
      last_viewed_listing_at: p.last_viewed_listing_at,
      last_click_at: p.last_click_at,

      // Viewed/did-not-rent fields
      buyer_potential: p.buyer_potential ?? 0,
      viewed_addresses: p.viewed_addresses,

      // Outreach dates — THE CRITICAL FIELDS
      outreach_6mo_date: p.outreach_6mo_date,
      outreach_90d_date: p.outreach_90d_date,
      outreach_60d_date: p.outreach_60d_date,
      outreach_30d_date: p.outreach_30d_date,

      // Drip state
      sales_drip_on: p.sales_drip_on,
      rental_drip_on: p.rental_drip_on,
      sales_drip_status: p.sales_drip_status,
      rental_drip_status: p.rental_drip_status,
      last_sales_email_opened: p.last_sales_email_opened,
      last_rental_email_opened: p.last_rental_email_opened,

      // Promotion
      promoted_to_buyer_at: p.promoted_to_buyer_at,

      // Financial (for buyer assessment)
      annual_income: p.annual_income ? Number(p.annual_income) : null,
      credit_score_range: p.credit_score_range,
      pre_approved: p.pre_approved,
      pre_approved_amount: p.pre_approved_amount ? Number(p.pre_approved_amount) : null,
      available_funds: p.available_funds ? Number(p.available_funds) : null,

      // Showing data
      showings_count: allShowings.length,
      last_viewed_address: lastShowing?.address || null,
      last_viewed_unit: lastShowing?.unit || null,
      last_viewed_date: lastShowing?.showing_date || null,
      last_showing_reaction: lastShowing?.reaction || null,
      last_showing_why_not: lastShowing?.why_not_rented || null,

      // Email tracking
      last_email_opened_at: p.last_sales_email_opened || p.last_rental_email_opened || null,

      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  });

  return NextResponse.json({ prospects: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const body = await req.json();
  const {
    first_name, last_name, email, phone,
    no_fee_only, notes, source,
  } = body;

  if (!first_name || !last_name || !email) {
    return NextResponse.json(
      { error: "first_name, last_name, email required" },
      { status: 400 },
    );
  }

  const prospect = await prisma.lead.create({
    data: {
      first_name,
      last_name,
      email,
      phone: phone || "",
      roles: ["renter"],
      status: "new",
      pipeline_stage: "viewed_not_rent",
      agent_id: auth.userId,
      source: source || "manual",
      no_fee_only: no_fee_only || false,
      notes: notes || null,
      consent_captured_at: new Date(),
    },
  });

  await logAuditEvent("create_prospect", "lead", String(prospect.id), auth, {
    name: `${first_name} ${last_name}`,
  });

  return NextResponse.json(
    {
      prospect: {
        ...prospect,
        id: String(prospect.id),
        agent_id: String(prospect.agent_id),
        name: `${first_name} ${last_name}`.trim(),
      },
    },
    { status: 201 },
  );
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Verify access
  const lead = await prisma.lead.findUnique({
    where: { id: BigInt(id) },
    select: { agent_id: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Whitelist allowed fields
  const allowed = [
    "buyer_potential", "no_fee_only", "notes",
    "outreach_6mo_date", "outreach_90d_date", "outreach_60d_date", "outreach_30d_date",
    "sales_drip_on", "rental_drip_on", "sales_drip_status", "rental_drip_status",
    "viewed_addresses",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key.includes("_date") && updates[key]) {
        data[key] = new Date(updates[key]);
      } else if (key === "buyer_potential") {
        data[key] = Number(updates[key]);
      } else {
        data[key] = updates[key];
      }
    }
  }

  await prisma.lead.update({
    where: { id: BigInt(id) },
    data,
  });

  await logAuditEvent("update_prospect", "lead", id, auth, {
    fields: Object.keys(data),
  });

  return NextResponse.json({ success: true, updated: Object.keys(data) });
}
