// /api/crm/documents/[id] — GET: detail, PATCH: update status
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id: BigInt(id) },
    include: {
      signatures: true,
      deal: { select: { id: true, property_address: true, status: true } },
      agent: { select: { id: true, full_name: true } },
    },
  });

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (auth.role !== "BROKER" && doc.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ item: {
      ...doc, id: doc.id.toString(), agent_id: doc.agent_id.toString(),
      deal_id: doc.deal_id?.toString() ?? null,
      deal: doc.deal ? { ...doc.deal, id: doc.deal.id.toString() } : null,
      agent: doc.agent ? { ...doc.agent, id: doc.agent.id.toString() } : null,
      signatures: doc.signatures.map(s => ({ ...s, id: s.id.toString(), document_id: s.document_id.toString() })),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const docId = BigInt(id);

  const existing = await prisma.document.findUnique({ where: { id: docId } });
  if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (auth.role !== "BROKER" && existing.agent_id !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.notes !== undefined) data.notes = body.notes;

  const updated = await prisma.document.update({ where: { id: docId }, data });
  await logAuditEvent("update", "document", id, auth, data);

  return NextResponse.json({ item: { ...updated, id: updated.id.toString(), agent_id: updated.agent_id.toString(), deal_id: updated.deal_id?.toString() ?? null },
  });
}
