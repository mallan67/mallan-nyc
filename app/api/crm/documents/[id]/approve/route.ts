// POST /api/crm/documents/[id]/approve — Broker approves a document
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const docId = BigInt(id);

  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await prisma.document.update({
    where: { id: docId },
    data: { status: "approved" },
  });

  // Notify the agent
  await prisma.notification.create({
    data: {
      recipient_type: "agent",
      recipient_id: doc.agent_id,
      channel: "in_app",
      type: "document_approved",
      title: "Document Approved",
      body: `"${doc.name}" has been approved.`,
      data: { document_id: doc.id.toString() },
      status: "pending",
    },
  });

  await logAuditEvent("approve", "document", id, auth, { name: doc.name });

  return NextResponse.json({ status: "approved" });
}
