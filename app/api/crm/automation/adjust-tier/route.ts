// POST /api/crm/automation/adjust-tier — manual tier override
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";
import { assertLeadIdStringAccess } from "@/lib/crm/access";

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { lead_id, drip_type, tier } = body;

  if (!lead_id || !drip_type || !tier) {
    return NextResponse.json({ error: "lead_id, drip_type, tier required" }, { status: 400 });
  }

  const validTiers = ["active", "monthly", "quarterly", "biannual", "paused"];
  if (!validTiers.includes(tier)) {
    return NextResponse.json({ error: "Invalid tier. Must be: " + validTiers.join(", ") }, { status: 400 });
  }

  const access = await assertLeadIdStringAccess(auth, lead_id);
  if (access.response) return access.response;

  const updateData: Record<string, unknown> = {};
  if (drip_type === "sales") {
    updateData.sales_drip_status = tier;
    updateData.sales_drip_on = tier !== "paused";
  } else if (drip_type === "rental") {
    updateData.rental_drip_status = tier;
    updateData.rental_drip_on = tier !== "paused";
  } else if (drip_type === "renewal") {
    updateData.renewal_drip_on = tier !== "paused";
  }

  await prisma.lead.update({
    where: { id: access.leadId! },
    data: updateData,
  });

  await logAuditEvent(
    "adjust_drip_tier",
    "lead",
    lead_id,
    auth,
    { drip_type, tier },
  );

  return NextResponse.json({ success: true, drip_type, tier });
}
