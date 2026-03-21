// POST /api/crm/documents/[id]/request-approval — Agent requests broker approval
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const docId = BigInt(id);

  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (auth.role !== "BROKER" && doc.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.document.update({
    where: { id: docId },
    data: { status: "pending_approval" },
  });

  // Notify broker
  await prisma.notification.create({
    data: {
      recipient_type: "agent",
      recipient_id: auth.userId, // Will be replaced with broker ID in production
      channel: "in_app",
      type: "document_approval_requested",
      title: "Document Approval Requested",
      body: `"${doc.name}" needs your review.`,
      data: { document_id: doc.id.toString() },
      status: "pending",
    },
  });

  await logAuditEvent("request_approval", "document", id, auth, { name: doc.name });

  return NextResponse.json({ ok: true, status: "pending_approval" });
}
