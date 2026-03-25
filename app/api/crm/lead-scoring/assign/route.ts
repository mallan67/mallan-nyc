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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { lead_id } = body as { lead_id?: string };
  if (!lead_id) return NextResponse.json({ error: "lead_id is required" }, { status: 400 });

  const assignedTo = await autoAssignLead(BigInt(lead_id));

  if (assignedTo) {
    await logAuditEvent("auto_assign", "lead", lead_id, auth, { assigned_to: assignedTo.toString() });
  }

  return NextResponse.json({ assigned_to: assignedTo?.toString() ?? null,
  });
}
