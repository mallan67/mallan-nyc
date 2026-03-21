// POST /api/crm/documents/upload — Upload a file to the Document Vault
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { uploadToR2, hasR2Config } from "@/lib/images/r2";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  if (!hasR2Config()) {
    return NextResponse.json({ error: "File storage not configured" }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }

  // 20MB max for documents
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
  }

  const title = (formData.get("title") as string) || file.name || "Untitled";
  const docType = (formData.get("doc_type") as string) || "other";
  const dealId = formData.get("deal_id") as string | null;
  const scope = (formData.get("scope") as string) || "agent";

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name || "file").split(".").pop() || "pdf";
  const key = `documents/${auth.userId}/${Date.now()}-${title.replace(/[^a-zA-Z0-9.-]/g, "_")}.${ext}`;
  const publicUrl = await uploadToR2(key, rawBuffer, file.type || "application/octet-stream");

  const doc = await prisma.document.create({
    data: {
      name: title,
      doc_type: docType,
      file_url: publicUrl,
      file_size: file.size,
      mime_type: file.type || null,
      status: "draft",
      agent_id: auth.userId,
      deal_id: dealId ? BigInt(dealId) : null,
    },
  });

  await logAuditEvent("create", "document", doc.id.toString(), auth, {
    title,
    doc_type: docType,
    scope,
    file_size: file.size,
  });

  return NextResponse.json({
    ok: true,
    document: {
      id: doc.id.toString(),
      name: doc.name,
      file_url: doc.file_url,
      status: doc.status,
    },
  });
}
