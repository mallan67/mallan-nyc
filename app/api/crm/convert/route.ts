// /api/crm/convert — POST: convert a lead through pipeline actions
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent, type SessionUser } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { assertLeadAccess } from "@/lib/crm/access";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { TERMINAL_STATUSES, normalizeStandardStatus } from "@/lib/idx/trestle-mapper";
import { initialPublication, withPublication } from "@/lib/crm/publication-state";
import type { Prisma } from "@prisma/client";

const VALID_ACTIONS = [
  "promote_to_listing",
  "buyer_rep_signed",
  "activate_renter",
  "sign_lease",
  "promote_to_buyer",
  "role_transition",
] as const;

type ConvertAction = (typeof VALID_ACTIONS)[number];

interface AddressDraft {
  streetNumber?: string;
  streetName?: string;
  unitNumber?: string;
  city?: string;
  postalCode?: string;
}

interface ListingDraft {
  // Structured address (original spec)
  address?: AddressDraft | string;
  // Price — accept either field name
  price_usd?: number;
  list_price?: number;
  // Type
  listing_type?: "sale" | "rent";
  propertyType?: string;
  property_type?: string;
  // Exclusive dates — accept either naming
  exclusiveStart?: string;
  exclusiveExpires?: string;
  exclusive_start_date?: string;
  exclusive_expire_date?: string;
  exclusive_end_date?: string;
  // Rental-specific
  fee_structure?: string;
  property_address?: string;
  unit_number?: string;
  lease_term?: string;
}

interface LeaseData {
  lease_start_date?: string;
  lease_end_date?: string;
  rent_per_month?: number;
  property_address?: string;
  unit_number?: string;
}

interface ConvertPayload {
  personId: string;
  action: ConvertAction;
  listingDraft?: ListingDraft;
  agentId?: string;
  targetRole?: string;
  leaseData?: LeaseData;
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: ConvertPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { personId, action, listingDraft, targetRole, leaseData } = body;

  // --- Validation ---
  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  if (body.agentId && auth.role !== "BROKER") {
    return NextResponse.json({ error: "Only broker can choose another agent" }, { status: 403 });
  }

  const agentId = body.agentId ? BigInt(body.agentId) : auth.userId;
  const ip = req.headers.get("x-forwarded-for") || "unknown";

  // Fetch the lead
  const lead = await prisma.lead.findUnique({
    where: { id: BigInt(personId) },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  const access = await assertLeadAccess(auth, lead.id);
  if (access) return access;

  // --- Action handlers ---

  if (action === "promote_to_listing") {
    return handlePromoteToListing(lead, listingDraft, agentId, auth, ip);
  }

  if (action === "buyer_rep_signed") {
    return handleBuyerRepSigned(lead, agentId, auth, ip);
  }

  if (action === "activate_renter") {
    return handleActivateRenter(lead, agentId, auth, ip);
  }

  if (action === "sign_lease") {
    return handleSignLease(lead, leaseData, agentId, auth, ip);
  }

  if (action === "promote_to_buyer") {
    return handlePromoteToBuyer(lead, agentId, auth, ip);
  }

  if (action === "role_transition") {
    return handleRoleTransition(lead, targetRole, agentId, auth, ip);
  }

  return NextResponse.json({ error: "Unhandled action" }, { status: 400 });
}

// ─── promote_to_listing ─────────────────────────────────────────────────────

async function handlePromoteToListing(
  lead: { id: bigint; roles: string[]; pipeline_stage: string; active_sale_listing_id: string | null; active_rental_listing_id: string | null },
  listingDraft: ListingDraft | undefined,
  agentId: bigint,
  auth: SessionUser,
  ip: string
) {
  if (!listingDraft) {
    return NextResponse.json({ error: "listingDraft is required for promote_to_listing" }, { status: 400 });
  }

  // Normalize flexible field names from frontend
  const price = listingDraft.price_usd || listingDraft.list_price || 0;
  const rawAddress = listingDraft.address || listingDraft.property_address || "";
  const listingType = listingDraft.listing_type || (lead.roles.includes("landlord") ? "rent" : "sale");
  const exclusiveStart = listingDraft.exclusiveStart || listingDraft.exclusive_start_date || null;
  const exclusiveExpires = listingDraft.exclusiveExpires || listingDraft.exclusive_expire_date || listingDraft.exclusive_end_date || null;
  const unitNumber = (typeof rawAddress === "object" ? rawAddress.unitNumber : listingDraft.unit_number) || "";

  if (!rawAddress) {
    return NextResponse.json({ error: "listingDraft requires an address" }, { status: 400 });
  }

  const isSale = listingType === "sale";
  const listingIdField = isSale ? "active_sale_listing_id" : "active_rental_listing_id";

  // Idempotency: check if Lead already has an active listing linked
  const existingListingId = isSale ? lead.active_sale_listing_id : lead.active_rental_listing_id;
  if (existingListingId) {
    return NextResponse.json(
      { success: true, listingId: existingListingId, existing: true },
      { status: 200 }
    );
  }

  const prefix = isSale ? "SL" : "RL";
  const generatedListingId = `${prefix}-${Date.now()}`;

  // Build address JSON — accept structured object or plain string
  let addressJson: Record<string, string>;
  if (typeof rawAddress === "object") {
    addressJson = {
      StreetNumber: rawAddress.streetNumber || "",
      StreetName: rawAddress.streetName || "",
      UnitNumber: rawAddress.unitNumber || "",
      City: rawAddress.city || "New York",
      PostalCode: rawAddress.postalCode || "",
      StateOrProvince: "NY",
      Country: "US",
    };
  } else {
    // Plain string address — store as UnparsedAddress
    addressJson = {
      UnparsedAddress: rawAddress,
      UnitNumber: unitNumber,
      City: "New York",
      StateOrProvince: "NY",
      Country: "US",
    };
  }

  // A LEAD CONVERTED INTO A LISTING IS NOT ON THE MARKET YET.
  //
  // This was the Mallan word "Draft" written into the column that holds the
  // Cotality market fact. NULL is the truthful value, and it matches the other
  // create path (STATUS_INITIAL in app/api/crm/listings/route.ts) exactly —
  // one initial state, not two. Mallan publication state lives in
  // `compliance.mallan_publication`, written below.
  //
  // H1 fix (2026-05-13) + amend: the defence-in-depth terminal-status guard is
  // kept for symmetry with the other CRM writers — if a future refactor lets
  // convert produce a real initial status, the SAME guard (normalize → check
  // TERMINAL_STATUSES) prevents a terminal listing from being born with
  // idx_display_yn=true. Single source of truth: lib/idx/trestle-mapper.ts.
  const convertInitialStatus: string | null = null;
  await prisma.listing.create({
    data: {
      listing_id: generatedListingId,
      agent_id: agentId,
      owner_client_id: lead.id,
      status: convertInitialStatus,
      listing_type: listingType,
      list_price: price || 0,
      property_type: listingDraft.propertyType || listingDraft.property_type || null,
      address: addressJson,
      modification_timestamp: new Date(),
      listing_contract_date: exclusiveStart ? new Date(exclusiveStart) : null,
      expiration_date: exclusiveExpires ? new Date(exclusiveExpires) : null,
      rls_eligible: true,
      // No market status = not on the market = not IDX-displayable. The
      // terminal check alone is a DENY-list, so without the null branch a
      // status-less listing would read as displayable.
      idx_display_yn:
        convertInitialStatus !== null &&
        !TERMINAL_STATUSES.has(normalizeStandardStatus(convertInitialStatus)),
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
      // Mallan DRAFT lives here, not in the market-status column — the same
      // initial record the direct create path writes.
      compliance: withPublication({}, initialPublication()) as Prisma.InputJsonValue,
    },
  });

  // H1 Tier-1 dual-write — lib/idx/sync.ts is the only listing-writer that
  // shares this pattern natively; non-sync writers (this route + 4 others)
  // must call the canonical projection helper to keep listing_search_projection
  // in parity. Failure is non-fatal so the convert flow itself still completes;
  // ops:projection-backfill heals on next run.
  try {
    await dualWriteProjectionForListingId(prisma, generatedListingId);
  } catch (err) {
    console.warn(
      "[crm/convert] projection dual-write failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const newRole = isSale ? "seller" : "landlord";
  const newPipelineStage = isSale ? "active_seller" : "active_landlord";
  const updatedRoles = lead.roles.includes(newRole) ? lead.roles : [...lead.roles, newRole];

  // Enable the appropriate workspace
  const wsKey = isSale ? "seller" : "landlord";
  const existingWs: string[] = (lead as Record<string, unknown>).enabled_workspaces as string[] || [];
  const updatedWs = existingWs.includes(wsKey) ? existingWs : [...existingWs, wsKey];

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      roles: updatedRoles,
      pipeline_stage: newPipelineStage,
      [listingIdField]: generatedListingId,
      fee_structure: !isSale ? listingDraft.fee_structure || null : undefined,
      enabled_workspaces: updatedWs,
    },
  });

  await logAuditEvent("promote_to_listing", "lead", lead.id.toString(), auth, {
    listing_id: generatedListingId,
    listing_type: listingType,
    before: { roles: lead.roles, pipeline_stage: lead.pipeline_stage },
    after: { roles: updatedRoles, pipeline_stage: newPipelineStage },
  }, ip);

  return NextResponse.json(
    { success: true, listingId: generatedListingId },
    { status: 201 }
  );
}

// ─── buyer_rep_signed ────────────────────────────────────────────────────────

async function handleBuyerRepSigned(
  lead: { id: bigint; roles: string[]; pipeline_stage: string; buyer_rep_agreement: boolean },
  agentId: bigint,
  auth: SessionUser,
  ip: string
) {
  const updatedRoles = lead.roles.includes("buyer") ? lead.roles : [...lead.roles, "buyer"];

  // Ensure buyer workspace is enabled
  const currentWorkspaces: string[] = (lead as Record<string, unknown>).enabled_workspaces as string[] || [];
  const newWorkspaces = currentWorkspaces.includes("buyer") ? currentWorkspaces : [...currentWorkspaces, "buyer"];

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      buyer_rep_agreement: true,
      buyer_rep_agreement_date: new Date(),
      pipeline_stage: "active_buyer",
      roles: updatedRoles,
      enabled_workspaces: newWorkspaces,
    },
  });

  await logAuditEvent("buyer_rep_signed", "lead", lead.id.toString(), auth, {
    before: {
      roles: lead.roles,
      pipeline_stage: lead.pipeline_stage,
      buyer_rep_agreement: lead.buyer_rep_agreement,
    },
    after: {
      roles: updatedRoles,
      pipeline_stage: "active_buyer",
      buyer_rep_agreement: true,
    },
  }, ip);

  return NextResponse.json({ success: true });
}

// ─── activate_renter ─────────────────────────────────────────────────────────

async function handleActivateRenter(
  lead: { id: bigint; pipeline_stage: string },
  _agentId: bigint,
  auth: SessionUser,
  ip: string
) {
  await prisma.lead.update({
    where: { id: lead.id },
    data: { pipeline_stage: "active_renter" },
  });

  await logAuditEvent("activate_renter", "lead", lead.id.toString(), auth, {
    before: { pipeline_stage: lead.pipeline_stage },
    after: { pipeline_stage: "active_renter" },
  }, ip);

  return NextResponse.json({ success: true });
}

// ─── sign_lease ──────────────────────────────────────────────────────────────

async function handleSignLease(
  lead: { id: bigint; pipeline_stage: string },
  leaseData: LeaseData | undefined,
  _agentId: bigint,
  auth: SessionUser,
  ip: string
) {
  if (!leaseData) {
    return NextResponse.json({ error: "leaseData is required for sign_lease" }, { status: 400 });
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      pipeline_stage: "current_tenant",
      lease_start_date: leaseData.lease_start_date ? new Date(leaseData.lease_start_date) : null,
      lease_end_date: leaseData.lease_end_date ? new Date(leaseData.lease_end_date) : null,
      rent_per_month: leaseData.rent_per_month || null,
      property_address: leaseData.property_address || null,
      unit_number: leaseData.unit_number || null,
      renewal_status: "pending",
    },
  });

  await logAuditEvent("sign_lease", "lead", lead.id.toString(), auth, {
    before: { pipeline_stage: lead.pipeline_stage },
    after: {
      pipeline_stage: "current_tenant",
      lease_start_date: leaseData.lease_start_date,
      lease_end_date: leaseData.lease_end_date,
      rent_per_month: leaseData.rent_per_month,
      property_address: leaseData.property_address,
      unit_number: leaseData.unit_number,
      renewal_status: "pending",
    },
  }, ip);

  return NextResponse.json({ success: true });
}

// ─── promote_to_buyer ────────────────────────────────────────────────────────

async function handlePromoteToBuyer(
  lead: { id: bigint; roles: string[]; buyer_potential: number | null },
  _agentId: bigint,
  auth: SessionUser,
  ip: string
) {
  const updatedRoles = lead.roles.includes("buyer") ? lead.roles : [...lead.roles, "buyer"];

  const buyerWs: string[] = (lead as Record<string, unknown>).enabled_workspaces as string[] || [];
  const updatedBuyerWs = buyerWs.includes("buyer") ? buyerWs : [...buyerWs, "buyer"];

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      roles: updatedRoles,
      promoted_to_buyer_at: new Date(),
      promotion_source: (lead.roles || []).includes("renter") ? "renter" : (lead.roles || []).includes("landlord") ? "landlord" : "viewer",
      enabled_workspaces: updatedBuyerWs,
    },
  });

  await logAuditEvent("promote_to_buyer", "lead", lead.id.toString(), auth, {
    before: { roles: lead.roles },
    after: { roles: updatedRoles, promoted_to_buyer_at: new Date().toISOString() },
    buyer_potential: lead.buyer_potential,
  }, ip);

  return NextResponse.json({ success: true });
}

// ─── role_transition ─────────────────────────────────────────────────────────

async function handleRoleTransition(
  lead: { id: bigint; roles: string[] },
  targetRole: string | undefined,
  _agentId: bigint,
  auth: SessionUser,
  ip: string
) {
  if (!targetRole) {
    return NextResponse.json({ error: "targetRole is required for role_transition" }, { status: 400 });
  }

  const validRoles = ["buyer", "seller", "landlord", "renter"];
  if (!validRoles.includes(targetRole)) {
    return NextResponse.json(
      { error: `Invalid targetRole. Must be one of: ${validRoles.join(", ")}` },
      { status: 400 }
    );
  }

  const updatedRoles = lead.roles.includes(targetRole) ? lead.roles : [...lead.roles, targetRole];

  await prisma.lead.update({
    where: { id: lead.id },
    data: { roles: updatedRoles },
  });

  await logAuditEvent("role_transition", "lead", lead.id.toString(), auth, {
    from: lead.roles,
    to: updatedRoles,
    added_role: targetRole,
  }, ip);

  return NextResponse.json({ success: true });
}
