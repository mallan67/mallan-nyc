// /api/crm/documents/[id]/signatures — POST: add signer or record signature
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { addSigner, recordSignature } from "@/lib/document-vault/manager";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const docId = BigInt(id);

  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
  if (auth.role !== "BROKER" && doc.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // If signature_id provided, record a signature
  if (body.signature_id) {
    try {
      const sig = await recordSignature(BigInt(body.signature_id as string), body.ip_address as string | undefined);
      await logAuditEvent("sign", "document_signature", sig.id.toString(), auth);
      return NextResponse.json({
        ok: true,
        item: { ...sig, id: sig.id.toString(), document_id: sig.document_id.toString() },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  }

  // Otherwise, add a new signer
  const { signer_name, signer_email, signer_role } = body as { signer_name?: string; signer_email?: string; signer_role?: string };
  if (!signer_name || !signer_email || !signer_role) {
    return NextResponse.json({ ok: false, error: "signer_name, signer_email, signer_role required" }, { status: 400 });
  }

  try {
    const sig = await addSigner({ document_id: docId, signer_name, signer_email, signer_role });
    await logAuditEvent("add_signer", "document", id, auth);
    return NextResponse.json({
      ok: true,
      item: { ...sig, id: sig.id.toString(), document_id: sig.document_id.toString() },
    }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
