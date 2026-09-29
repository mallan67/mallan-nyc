// /api/crm/clients/[id]
// GET: Full client profile with preferences and actions.
// PATCH: Update client fields.
// Ownership enforced: agent sees only their clients.
import { NextRequest, NextResponse } from "next/server";
import { PORTAL_ROLE_VALUES, isPortalRole } from "@/lib/api/schemas/client";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { scanTextForFairHousing } from "@/lib/compliance/rls-enforcement";
import { assignLeadToAgent } from "@/lib/lead-distribution/assign";

type RouteParams = { params: Promise<{ id: string }> };

async function findLead(id: string) {
  const numericId = parseInt(id);
  if (!isNaN(numericId)) {
    return prisma.lead.findUnique({ where: { id: BigInt(numericId) } });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: safeBigInt(id) ?? BigInt(-1) },
    include: {
      preferences: true,
      lead_parties: { orderBy: { created_at: "asc" } },
      actions: {
        include: {
          listing: {
            select: {
              id: true,
              listing_id: true,
              address: true,
              list_price: true,
              status: true,
              listing_type: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Fetch recent activity logs
  let activityLogs: { id: bigint; activity_type: string; title: string | null; detail: string | null; created_at: Date }[] = [];
  try {
    activityLogs = await prisma.activityLog.findMany({
      where: { lead_id: lead.id },
      orderBy: { created_at: "desc" },
      take: 10,
    });
  } catch (logErr) {
    console.error("[CRM:Clients] Activity log fetch error:", logErr);
  }

  return NextResponse.json({
    id: lead.id.toString(),
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    roles: lead.roles,
    status: lead.status,
    pipeline_stage: lead.pipeline_stage,
    portal_role: lead.portal_role,
    agent_id: lead.agent_id?.toString() ?? null,
    source: lead.source,
    notes: lead.notes,
    annual_income: lead.annual_income?.toString() ?? null,
    bonuses: lead.bonuses?.toString() ?? null,
    credit_score_range: lead.credit_score_range,
    pre_approved: lead.pre_approved,
    pre_approved_amount: lead.pre_approved_amount?.toString() ?? null,
    down_payment: lead.down_payment?.toString() ?? null,
    available_funds: lead.available_funds?.toString() ?? null,
    monthly_debt: lead.monthly_debt?.toString() ?? null,
    employer: lead.employer,
    work_title: lead.work_title,
    lease_start_date: lead.lease_start_date,
    lease_end_date: lead.lease_end_date,
    rent_per_month: lead.rent_per_month?.toString() ?? null,
    rental_deposit: lead.rental_deposit?.toString() ?? null,
    total_monthly_expense: lead.total_monthly_expense?.toString() ?? null,
    secondary_first_name: lead.secondary_first_name,
    secondary_last_name: lead.secondary_last_name,
    secondary_email: lead.secondary_email,
    secondary_phone: lead.secondary_phone,
    secondary_relationship: lead.secondary_relationship,
    property_address: lead.property_address,
    home_address: lead.home_address,
    unit_number: lead.unit_number,
    legal_ownership_name: lead.legal_ownership_name,
    // Attorney
    attorney_name: lead.attorney_name,
    attorney_email: lead.attorney_email,
    attorney_phone: lead.attorney_phone,
    attorney_firm: lead.attorney_firm,
    // Entity ownership
    entity_name: lead.entity_name,
    entity_type: lead.entity_type,
    authorized_signatories: lead.authorized_signatories,
    // Seller intake
    home_prep_checklist: lead.home_prep_checklist,
    building_mgmt_requirements: lead.building_mgmt_requirements,
    disclosures: lead.disclosures,
    documents_collected: lead.documents_collected,
    marketing_strategy: lead.marketing_strategy,
    // Landlord intake
    property_disclosures: lead.property_disclosures,
    lease_terms: lead.lease_terms,
    fee_structure: lead.fee_structure,
    // Investor
    is_investor: lead.is_investor,
    investment_strategy: lead.investment_strategy,
    cap_rate_target: lead.cap_rate_target?.toString() ?? null,
    cash_on_cash_target: lead.cash_on_cash_target?.toString() ?? null,
    holding_period_years: lead.holding_period_years,
    // Seller/landlord
    seller_potential: lead.seller_potential,
    vacancy_risk: lead.vacancy_risk,
    active_sale_listing_id: lead.active_sale_listing_id,
    active_rental_listing_id: lead.active_rental_listing_id,
    // Renter
    no_fee_only: lead.no_fee_only,
    guarantor_needed: lead.guarantor_needed,
    building_type_pref: lead.building_type_pref,
    docs_readiness: lead.docs_readiness,
    buyer_potential: lead.buyer_potential,
    // Automation
    sales_drip_on: lead.sales_drip_on,
    rental_drip_on: lead.rental_drip_on,
    renewal_drip_on: lead.renewal_drip_on,
    sales_drip_status: lead.sales_drip_status,
    rental_drip_status: lead.rental_drip_status,
    renewal_status: lead.renewal_status,
    non_renewal_date: lead.non_renewal_date,
    reengage_anchor_date: lead.reengage_anchor_date,
    // Outreach dates
    outreach_6mo_date: lead.outreach_6mo_date,
    outreach_90d_date: lead.outreach_90d_date,
    outreach_60d_date: lead.outreach_60d_date,
    outreach_30d_date: lead.outreach_30d_date,
    // Behavior tracking
    last_login_at: lead.last_login_at,
    login_count: lead.login_count,
    last_viewed_listing_at: lead.last_viewed_listing_at,
    // Buyer rep
    buyer_rep_agreement: lead.buyer_rep_agreement,
    buyer_rep_agreement_date: lead.buyer_rep_agreement_date,
    created_at: lead.created_at,
    updated_at: lead.updated_at,
    activity_logs: activityLogs.map((a) => ({
      id: a.id.toString(),
      activity_type: a.activity_type,
      title: a.title,
      detail: a.detail,
      created_at: a.created_at,
    })),
    preferences: lead.preferences
      ? {
          ...lead.preferences,
          id: lead.preferences.id.toString(),
          lead_id: lead.preferences.lead_id.toString(),
          min_price: lead.preferences.min_price?.toString() ?? null,
          max_price: lead.preferences.max_price?.toString() ?? null,
        }
      : null,
    actions: lead.actions.map((a) => ({
      id: a.id.toString(),
      listing_id: a.listing_id.toString(),
      action: a.action,
      comment: a.comment,
      created_at: a.created_at,
      listing: {
        ...a.listing,
        id: a.listing.id.toString(),
        list_price: a.listing.list_price.toString(),
      },
    })),
  });
}

/**
 * PATCH /api/crm/clients/[id]
 * Update client fields. Owner agent or broker.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const lead = await findLead(id);

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  let reassignmentAgentId: bigint | null | undefined;

  if (body.first_name !== undefined) update.first_name = String(body.first_name);
  if (body.last_name !== undefined) update.last_name = String(body.last_name);
  if (body.phone !== undefined) update.phone = String(body.phone);
  if (body.status !== undefined) update.status = String(body.status);
  // DEFENCE IN DEPTH — same reason as the invite route. This took the value
  // straight from the request body with no allow-list, and it is reachable by
  // any agent on a client they manage.
  if (body.portal_role !== undefined) {
    if (body.portal_role !== null && !isPortalRole(body.portal_role)) {
      return NextResponse.json(
        {
          error: "portal_role must be a client portal role",
          allowed: PORTAL_ROLE_VALUES,
        },
        { status: 400 },
      );
    }
    update.portal_role = body.portal_role as string | null;
  }
  if (body.notes !== undefined) {
    const noteText = body.notes ? String(body.notes) : null;
    const fhViolations = scanTextForFairHousing(noteText, "notes");
    if (fhViolations.length > 0) {
      return NextResponse.json(
        { error: "Fair Housing violation in notes", violations: fhViolations },
        { status: 422 }
      );
    }
    update.notes = noteText;
  }
  if (body.source !== undefined) update.source = String(body.source);
  if (body.pipeline_stage !== undefined) {
    const validStages = ["new", "contacted", "nurturing", "active", "showing", "offer", "deal", "closed", "past"];
    const stage = String(body.pipeline_stage);
    if (validStages.includes(stage)) update.pipeline_stage = stage;
  }

  // Financial fields
  if (body.annual_income !== undefined) update.annual_income = body.annual_income ? parseFloat(String(body.annual_income)) : null;
  if (body.bonuses !== undefined) update.bonuses = body.bonuses ? parseFloat(String(body.bonuses)) : null;
  if (body.credit_score_range !== undefined) update.credit_score_range = body.credit_score_range ? String(body.credit_score_range) : null;
  if (body.pre_approved !== undefined) update.pre_approved = Boolean(body.pre_approved);
  if (body.pre_approved_amount !== undefined) update.pre_approved_amount = body.pre_approved_amount ? parseFloat(String(body.pre_approved_amount)) : null;
  if (body.down_payment !== undefined) update.down_payment = body.down_payment ? parseFloat(String(body.down_payment)) : null;
  if (body.available_funds !== undefined) update.available_funds = body.available_funds ? parseFloat(String(body.available_funds)) : null;
  if (body.monthly_debt !== undefined) update.monthly_debt = body.monthly_debt ? parseFloat(String(body.monthly_debt)) : null;
  if (body.employer !== undefined) update.employer = body.employer ? String(body.employer) : null;
  if (body.work_title !== undefined) update.work_title = body.work_title ? String(body.work_title) : null;
  if (body.rent_per_month !== undefined) update.rent_per_month = body.rent_per_month ? parseFloat(String(body.rent_per_month)) : null;
  if (body.rental_deposit !== undefined) update.rental_deposit = body.rental_deposit ? parseFloat(String(body.rental_deposit)) : null;
  if (body.total_monthly_expense !== undefined) update.total_monthly_expense = body.total_monthly_expense ? parseFloat(String(body.total_monthly_expense)) : null;
  if (body.lease_start_date !== undefined) update.lease_start_date = body.lease_start_date ? new Date(String(body.lease_start_date)) : null;
  if (body.lease_end_date !== undefined) update.lease_end_date = body.lease_end_date ? new Date(String(body.lease_end_date)) : null;
  if (body.next_follow_up !== undefined) update.next_follow_up = body.next_follow_up ? new Date(String(body.next_follow_up)) : null;
  // Agent reassignment (broker only)
  if (body.agent_id !== undefined) {
    if (auth.role !== "BROKER") {
      return NextResponse.json({ error: "Only broker can reassign clients" }, { status: 403 });
    }
    if (body.agent_id) {
      const parsedAgentId = safeBigInt(String(body.agent_id));
      if (!parsedAgentId) {
        return NextResponse.json({ error: "Invalid agent_id" }, { status: 400 });
      }
      reassignmentAgentId = parsedAgentId;
    } else {
      reassignmentAgentId = null;
    }
  }

  if (body.roles !== undefined) {
    const validRoles = ["buyer", "renter", "seller", "landlord", "uncategorized"];
    const roles = body.roles as string[];
    if (!roles.every((r) => validRoles.includes(r))) {
      return NextResponse.json(
        { error: "roles must be from: buyer, renter, seller, landlord, uncategorized" },
        { status: 400 }
      );
    }
    update.roles = roles;
  }

  // Secondary person fields
  if (body.secondary_first_name !== undefined) update.secondary_first_name = body.secondary_first_name ? String(body.secondary_first_name) : null;
  if (body.secondary_last_name !== undefined) update.secondary_last_name = body.secondary_last_name ? String(body.secondary_last_name) : null;
  if (body.secondary_email !== undefined) update.secondary_email = body.secondary_email ? String(body.secondary_email) : null;
  if (body.secondary_phone !== undefined) update.secondary_phone = body.secondary_phone ? String(body.secondary_phone) : null;
  if (body.secondary_relationship !== undefined) update.secondary_relationship = body.secondary_relationship ? String(body.secondary_relationship) : null;

  // Address fields
  if (body.property_address !== undefined) update.property_address = body.property_address ? String(body.property_address) : null;
  if (body.home_address !== undefined) update.home_address = body.home_address ? String(body.home_address) : null;
  if (body.unit_number !== undefined) update.unit_number = body.unit_number ? String(body.unit_number) : null;
  if (body.legal_ownership_name !== undefined) update.legal_ownership_name = body.legal_ownership_name ? String(body.legal_ownership_name) : null;

  // Attorney fields
  if (body.attorney_name !== undefined) update.attorney_name = body.attorney_name ? String(body.attorney_name) : null;
  if (body.attorney_email !== undefined) update.attorney_email = body.attorney_email ? String(body.attorney_email) : null;
  if (body.attorney_phone !== undefined) update.attorney_phone = body.attorney_phone ? String(body.attorney_phone) : null;
  if (body.attorney_firm !== undefined) update.attorney_firm = body.attorney_firm ? String(body.attorney_firm) : null;

  // Entity ownership fields
  if (body.entity_name !== undefined) update.entity_name = body.entity_name ? String(body.entity_name) : null;
  if (body.entity_type !== undefined) update.entity_type = body.entity_type ? String(body.entity_type) : null;
  if (body.entity_ein !== undefined) update.entity_ein = body.entity_ein ? String(body.entity_ein) : null;
  if (body.entity_state !== undefined) update.entity_state = body.entity_state ? String(body.entity_state) : null;
  if (body.entity_managing_member !== undefined) update.entity_managing_member = body.entity_managing_member ? String(body.entity_managing_member) : null;
  if (body.authorized_signatories !== undefined) update.authorized_signatories = body.authorized_signatories ?? null;

  // Seller intake fields (JSON)
  if (body.home_prep_checklist !== undefined) update.home_prep_checklist = body.home_prep_checklist ?? null;
  if (body.building_mgmt_requirements !== undefined) update.building_mgmt_requirements = body.building_mgmt_requirements ?? null;
  if (body.disclosures !== undefined) update.disclosures = body.disclosures ?? null;
  if (body.documents_collected !== undefined) update.documents_collected = body.documents_collected ?? null;
  if (body.marketing_strategy !== undefined) update.marketing_strategy = body.marketing_strategy ?? null;

  // Seller/landlord fields
  if (body.seller_potential !== undefined) {
    const valid = ["none", "low", "medium", "high"];
    const sp = String(body.seller_potential);
    if (valid.includes(sp)) update.seller_potential = sp;
  }

  // Landlord intake fields
  if (body.property_disclosures !== undefined) update.property_disclosures = body.property_disclosures ?? null;
  if (body.lease_terms !== undefined) update.lease_terms = body.lease_terms ?? null;
  if (body.fee_structure !== undefined) update.fee_structure = body.fee_structure ? String(body.fee_structure) : null;

  // Investor fields
  if (body.is_investor !== undefined) update.is_investor = Boolean(body.is_investor);
  if (body.investment_strategy !== undefined) update.investment_strategy = body.investment_strategy ? String(body.investment_strategy) : null;
  if (body.cap_rate_target !== undefined) update.cap_rate_target = body.cap_rate_target ? parseFloat(String(body.cap_rate_target)) : null;
  if (body.cash_on_cash_target !== undefined) update.cash_on_cash_target = body.cash_on_cash_target ? parseFloat(String(body.cash_on_cash_target)) : null;
  if (body.holding_period_years !== undefined) update.holding_period_years = body.holding_period_years ? parseInt(String(body.holding_period_years)) : null;

  // Seller/landlord potential
  if (body.seller_potential !== undefined) update.seller_potential = body.seller_potential ? String(body.seller_potential) : null;
  if (body.vacancy_risk !== undefined) update.vacancy_risk = body.vacancy_risk ? String(body.vacancy_risk) : null;

  // Renter fields
  if (body.no_fee_only !== undefined) update.no_fee_only = Boolean(body.no_fee_only);
  if (body.guarantor_needed !== undefined) update.guarantor_needed = Boolean(body.guarantor_needed);
  if (body.building_type_pref !== undefined) update.building_type_pref = body.building_type_pref ?? [];
  if (body.docs_readiness !== undefined) update.docs_readiness = body.docs_readiness ?? null;

  // Renewal / automation
  if (body.renewal_status !== undefined) update.renewal_status = body.renewal_status ? String(body.renewal_status) : null;
  if (body.non_renewal_date !== undefined) update.non_renewal_date = body.non_renewal_date ? new Date(String(body.non_renewal_date)) : null;
  if (body.reengage_anchor_date !== undefined) update.reengage_anchor_date = body.reengage_anchor_date ? new Date(String(body.reengage_anchor_date)) : null;
  if (body.sales_drip_on !== undefined) update.sales_drip_on = Boolean(body.sales_drip_on);
  if (body.rental_drip_on !== undefined) update.rental_drip_on = Boolean(body.rental_drip_on);
  if (body.renewal_drip_on !== undefined) update.renewal_drip_on = Boolean(body.renewal_drip_on);
  if (body.buyer_potential !== undefined) update.buyer_potential = body.buyer_potential != null ? parseInt(String(body.buyer_potential)) : null;

  // Outreach dates
  if (body.outreach_6mo_date !== undefined) update.outreach_6mo_date = body.outreach_6mo_date ? new Date(String(body.outreach_6mo_date)) : null;
  if (body.outreach_90d_date !== undefined) update.outreach_90d_date = body.outreach_90d_date ? new Date(String(body.outreach_90d_date)) : null;
  if (body.outreach_60d_date !== undefined) update.outreach_60d_date = body.outreach_60d_date ? new Date(String(body.outreach_60d_date)) : null;
  if (body.outreach_30d_date !== undefined) update.outreach_30d_date = body.outreach_30d_date ? new Date(String(body.outreach_30d_date)) : null;

  if (Object.keys(update).length === 0 && reassignmentAgentId === undefined) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const updated = Object.keys(update).length > 0
    ? await prisma.lead.update({
        where: { id: lead.id },
        data: update,
      })
    : lead;

  const assignment = reassignmentAgentId !== undefined
    ? await assignLeadToAgent({
        leadId: lead.id,
        agentId: reassignmentAgentId,
        assignedById: auth.userId,
        assignedByRole: auth.role,
        notify: true,
      })
    : null;

  await logAuditEvent(
    "update",
    "lead",
    lead.id.toString(),
    auth,
    {
      fields: Object.keys(update).concat(reassignmentAgentId !== undefined ? ["agent_id"] : []),
      inherited: assignment?.inherited,
    },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: (assignment?.lead_id ?? updated.id).toString(),
    status: assignment?.status ?? updated.status,
    agent_id: assignment?.assigned_agent_id?.toString() ?? updated.agent_id?.toString() ?? null,
    inherited: assignment?.inherited,
  });
}

/**
 * DELETE /api/crm/clients/[id]
 * Delete a client/lead. Broker only.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // Broker only — agents cannot delete clients
  if (auth.role !== "BROKER") {
    return NextResponse.json({ error: "Only broker can delete clients" }, { status: 403 });
  }

  const { id } = await params;
  const lead = await findLead(id);

  if (!lead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Cascade-delete all related records in a transaction
  await prisma.$transaction([
    prisma.clientPreference.deleteMany({ where: { lead_id: lead.id } }),
    prisma.clientListingAction.deleteMany({ where: { lead_id: lead.id } }),
    prisma.session.deleteMany({ where: { user_id: lead.id, user_type: "lead" } }),
    prisma.activityLog.deleteMany({ where: { lead_id: lead.id } }),
    prisma.followUpTask.deleteMany({ where: { lead_id: lead.id } }),
    prisma.showingFeedback.deleteMany({ where: { lead_id: lead.id } }),
    prisma.showing.deleteMany({ where: { lead_id: lead.id } }),
    prisma.notification.deleteMany({ where: { recipient_id: lead.id, recipient_type: "lead" } }),
    prisma.leadScore.deleteMany({ where: { lead_id: lead.id } }),
    prisma.convictionScore.deleteMany({ where: { lead_id: lead.id } }),
    prisma.savedSearch.deleteMany({ where: { lead_id: lead.id } }),
    prisma.comment.deleteMany({ where: { lead_id: lead.id } }),
    prisma.intentEvent.deleteMany({ where: { lead_id: lead.id } }),
    prisma.behavioralEvent.deleteMany({ where: { lead_id: lead.id } }),
    prisma.familyMember.deleteMany({ where: { OR: [{ lead_id: lead.id }, { member_lead_id: lead.id }] } }),
    prisma.lead.delete({ where: { id: lead.id } }),
  ]);

  await logAuditEvent(
    "delete",
    "lead",
    lead.id.toString(),
    auth,
    { email: lead.email },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ success: true, deleted: lead.email });
}
