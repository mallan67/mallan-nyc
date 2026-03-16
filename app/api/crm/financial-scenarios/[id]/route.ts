// DELETE /api/crm/financial-scenarios/[id]
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numericId = BigInt(id);

  const event = await prisma.auditEvent.findUnique({
    where: { id: numericId },
  });

  if (!event || event.action !== "financial_scenario") {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  // Scope: agents can only delete their own scenarios
  if (auth.role !== "BROKER" && event.user_id !== auth.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  await prisma.auditEvent.delete({ where: { id: numericId } });

  return NextResponse.json({ deleted: id });
}
