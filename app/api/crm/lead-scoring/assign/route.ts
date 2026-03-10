// /api/crm/lead-scoring/assign — POST: auto-assign a lead
import { NextRequest, NextResponse } from "next/server";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { autoAssignLead } from "@/lib/lead-scoring/scorer";

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { lead_id } = await req.json();
  if (!lead_id) return NextResponse.json({ ok: false, error: "lead_id is required" }, { status: 400 });

  const assignedTo = await autoAssignLead(BigInt(lead_id));

  if (assignedTo) {
    await logAuditEvent("auto_assign", "lead", lead_id, auth, { assigned_to: assignedTo.toString() });
  }

  return NextResponse.json({
    ok: true,
    assigned_to: assignedTo?.toString() ?? null,
  });
}
