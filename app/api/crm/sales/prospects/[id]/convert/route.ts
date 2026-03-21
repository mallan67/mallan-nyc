/**
 * POST /api/crm/sales/prospects/[id]/convert
 *
 * Convert a seller prospect (SellerLead) into an active Seller Lead (Lead model).
 * - Parses owner_name into first_name / last_name
 * - Upserts Lead by owner_email (or creates new)
 * - Sets status = "converted" on SellerLead
 * - Logs audit event: "seller_prospect_converted"
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";

type RouteParams = { params: Promise<{ id: string }> };

/** Parse "Jane Doe" into { first: "Jane", last: "Doe" } */
function parseName(fullName: string): { first: string; last: string } {
  const trimmed = fullName.trim();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return { first: trimmed, last: "" };
  }
  return {
    first: trimmed.slice(0, spaceIdx),
    last: trimmed.slice(spaceIdx + 1).trim(),
  };
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Ownership check
  const prospect = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // Already converted?
  if (prospect.converted_at) {
    return NextResponse.json(
      {
        error: "Prospect has already been converted",
        converted_to_lead_id: prospect.converted_to_lead_id
          ? String(prospect.converted_to_lead_id)
          : null,
      },
      { status: 409 },
    );
  }

  // Must have at minimum an email or phone to create a Lead
  if (!prospect.owner_email && !prospect.owner_phone) {
    return NextResponse.json(
      {
        error:
          "Prospect must have owner_email or owner_phone before conversion. Update the prospect first.",
      },
      { status: 400 },
    );
  }

  // Parse name
  const { first, last } = prospect.owner_name
    ? parseName(prospect.owner_name)
    : { first: "Owner", last: prospect.address };

  // Build Lead data
  const leadData = {
    first_name: first,
    last_name: last || "(unknown)",
    phone: prospect.owner_phone || "",
    roles: ["seller"],
    pipeline_stage: "active_seller",
    primary_portal_role: "seller",
    enabled_workspaces: ["seller"],
    entity_name: prospect.entity_name || null,
    entity_type: prospect.entity_type || null,
    property_address: prospect.address,
    unit_number: prospect.unit || null,
    attorney_name: prospect.attorney_name || null,
    attorney_email: prospect.attorney_email || null,
    attorney_phone: prospect.attorney_phone || null,
    source: "seller_prospect",
    agent_id: prospect.assigned_agent_id,
    consent_captured_at: prospect.consent_captured_at || null,
    legal_ownership_name: prospect.entity_name || null,
  };

  let lead;

  if (prospect.owner_email) {
    // Upsert by email
    lead = await prisma.lead.upsert({
      where: { email: prospect.owner_email },
      create: {
        ...leadData,
        email: prospect.owner_email,
      },
      update: {
        // Update existing lead with seller info — don't overwrite existing fields with empty values
        roles: { push: "seller" },
        pipeline_stage: "active_seller",
        primary_portal_role: "seller",
        enabled_workspaces: { push: "seller" },
        property_address: prospect.address,
        unit_number: prospect.unit || undefined,
        entity_name: prospect.entity_name || undefined,
        entity_type: prospect.entity_type || undefined,
        attorney_name: prospect.attorney_name || undefined,
        attorney_email: prospect.attorney_email || undefined,
        attorney_phone: prospect.attorney_phone || undefined,
        agent_id: prospect.assigned_agent_id,
      },
    });

    // De-duplicate roles and enabled_workspaces
    const uniqueRoles = Array.from(new Set(lead.roles));
    const uniqueWorkspaces = Array.from(new Set(lead.enabled_workspaces));
    if (
      uniqueRoles.length !== lead.roles.length ||
      uniqueWorkspaces.length !== lead.enabled_workspaces.length
    ) {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          roles: uniqueRoles,
          enabled_workspaces: uniqueWorkspaces,
        },
      });
    }
  } else {
    // No email — create with a placeholder email (agent can update later)
    // Use a unique placeholder to avoid unique constraint collision
    const placeholderEmail = `prospect-${String(prospectId)}@placeholder.mallan.nyc`;
    lead = await prisma.lead.create({
      data: {
        ...leadData,
        email: placeholderEmail,
      },
    });
  }

  // Mark prospect as converted
  const updatedProspect = await prisma.sellerLead.update({
    where: { id: prospectId },
    data: {
      status: "converted",
      converted_to_lead_id: lead.id,
      converted_at: new Date(),
    },
  });

  await logAuditEvent(
    "seller_prospect_converted",
    "seller_lead",
    String(prospectId),
    auth,
    {
      lead_id: String(lead.id),
      lead_email: lead.email,
      address: prospect.address,
    },
  );

  return NextResponse.json({
    lead: serializeBigInts(lead),
    prospect: serializeBigInts(updatedProspect),
  });
}
