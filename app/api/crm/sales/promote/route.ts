// /api/crm/sales/promote — POST: promote landlord→seller or renter→buyer
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { lead_id, promotion_type } = body;

  if (!lead_id || !promotion_type) {
    return NextResponse.json({ error: "lead_id and promotion_type required" }, { status: 400 });
  }

  if (!["landlord_to_seller", "renter_to_buyer"].includes(promotion_type)) {
    return NextResponse.json({ error: "Invalid promotion_type" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: BigInt(lead_id) } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Verify agent ownership (unless broker)
  if (auth.role !== "BROKER" && lead.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  const newRoles = [...lead.roles];

  if (promotion_type === "landlord_to_seller") {
    if (!newRoles.includes("seller")) newRoles.push("seller");
    updates.roles = newRoles;
    updates.seller_potential = "high";
    updates.promoted_to_seller_at = new Date();
    updates.promoted_from_landlord_at = new Date();
    updates.promotion_source = "landlord";
    updates.promotion_reason = body.reason || "Landlord-to-seller promotion";
    // Enable seller workspace
    const workspaces = [...new Set([...(lead.enabled_workspaces || []), "seller"])];
    updates.enabled_workspaces = workspaces;
  } else if (promotion_type === "renter_to_buyer") {
    if (!newRoles.includes("buyer")) newRoles.push("buyer");
    updates.roles = newRoles;
    updates.promoted_to_buyer_at = new Date();
    updates.promoted_from_tenant_at = new Date();
    updates.promotion_source = "tenant";
    updates.promotion_reason = body.reason || "Renter-to-buyer promotion";
    // Enable buyer workspace
    const workspaces = [...new Set([...(lead.enabled_workspaces || []), "buyer"])];
    updates.enabled_workspaces = workspaces;
  }

  const updated = await prisma.lead.update({
    where: { id: BigInt(lead_id) },
    data: updates,
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      lead_id: BigInt(lead_id),
      activity_type: "status_change",
      title: `Promoted: ${promotion_type.replace(/_/g, " ")}`,
      detail: `${lead.first_name} ${lead.last_name} promoted via ${promotion_type}`,
      actor_type: "agent",
      actor_id: auth.userId,
    },
  });

  await logAuditEvent(
    "promote_client",
    "lead",
    String(lead_id),
    auth,
    { promotion_type },
  );

  return NextResponse.json({
    success: true,
    lead: { ...updated, id: String(updated.id) },
  });
}
