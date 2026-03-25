// /api/crm/documents/batch-approve — POST: broker batch document approval
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

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

  const { document_ids } = body as { document_ids?: string[] };

  if (!Array.isArray(document_ids) || document_ids.length === 0) {
    return NextResponse.json({ error: "document_ids[] is required and must not be empty" },
      { status: 400 }
    );
  }

  if (document_ids.length > 100) {
    return NextResponse.json({ error: "Maximum 100 documents per batch" },
      { status: 400 }
    );
  }

  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;
  const now = new Date();

  const approved: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const docId of document_ids) {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: BigInt(docId) },
        select: { id: true, status: true },
      });

      if (!doc) {
        failed.push({ id: docId, reason: "Document not found" });
        continue;
      }

      if (doc.status === "approved") {
        failed.push({ id: docId, reason: "Already approved" });
        continue;
      }

      // Document model does not have approved_by/approved_at columns,
      // so we update status and record the approval details in an audit event.
      await prisma.document.update({
        where: { id: BigInt(docId) },
        data: { status: "approved" },
      });

      await logAuditEvent(
        "approve",
        "document",
        docId,
        auth,
        { previous_status: doc.status, approved_at: now.toISOString() },
        ipAddress
      );

      approved.push(docId);
    } catch {
      failed.push({ id: docId, reason: "Update failed" });
    }
  }

  return NextResponse.json({ approved,
    failed,
  });
}
