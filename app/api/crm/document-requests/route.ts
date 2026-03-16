// /api/crm/document-requests — POST: agent creates a document upload request
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { scope, scope_id, doc_type, title, notes } = body as {
    scope?: string;
    scope_id?: string;
    doc_type?: string;
    title?: string;
    notes?: string;
  };

  if (!doc_type || !title) {
    return NextResponse.json(
      { ok: false, error: "doc_type and title are required" },
      { status: 400 }
    );
  }

  const validDocTypes = ["contract", "disclosure", "co_broke", "rider", "amendment", "other"];
  if (!validDocTypes.includes(doc_type)) {
    return NextResponse.json(
      { ok: false, error: `doc_type must be one of: ${validDocTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;

  // Create a Document record with status='requested' and requires_signature=true
  // to indicate it needs broker approval.
  // deal_id is set if scope is "deal" and scope_id is provided.
  const dealId = scope === "deal" && scope_id ? BigInt(scope_id) : null;

  const doc = await prisma.document.create({
    data: {
      deal_id: dealId,
      agent_id: auth.userId,
      name: title,
      doc_type,
      file_url: "", // No file yet — this is a request
      status: "requested",
      requires_signature: true,
      notes: notes
        ? `[scope: ${scope ?? "general"}, scope_id: ${scope_id ?? "n/a"}] ${notes}`
        : `[scope: ${scope ?? "general"}, scope_id: ${scope_id ?? "n/a"}]`,
    },
  });

  await logAuditEvent(
    "create",
    "document",
    doc.id.toString(),
    auth,
    {
      action_type: "document_request",
      scope: scope ?? "general",
      scope_id: scope_id ?? null,
      doc_type,
      title,
    },
    ipAddress
  );

  return NextResponse.json({
    ok: true,
    id: doc.id.toString(),
    scope: scope ?? "general",
    doc_type,
    status: "requested",
    created_at: doc.created_at.toISOString(),
  }, { status: 201 });
}
