// /api/crm/documents — GET: list, POST: create
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const dealId = searchParams.get("deal_id");
  const docType = searchParams.get("doc_type");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};
  if (auth.role !== "BROKER") where.agent_id = auth.userId;
  if (dealId) where.deal_id = BigInt(dealId);
  if (docType) where.doc_type = docType;
  if (status) where.status = status;

  const [docs, total] = await Promise.all([
    prisma.document.findMany({
      where, orderBy: { created_at: "desc" }, take: limit, skip: offset,
      include: {
        _count: { select: { signatures: true } },
        deal: { select: { id: true, property_address: true, status: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  const serialized = docs.map(d => ({
    ...d, id: d.id.toString(), agent_id: d.agent_id.toString(),
    deal_id: d.deal_id?.toString() ?? null,
    deal: d.deal ? { ...d.deal, id: d.deal.id.toString() } : null,
  }));

  return NextResponse.json({ ok: true, total, items: serialized });
}

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
  const { deal_id, name, doc_type, file_url, file_size, mime_type, requires_signature, notes } = body as { deal_id?: string; name?: string; doc_type?: string; file_url?: string; file_size?: number; mime_type?: string; requires_signature?: boolean; notes?: string };

  if (!name || !doc_type || !file_url) {
    return NextResponse.json({ ok: false, error: "name, doc_type, and file_url are required" }, { status: 400 });
  }

  const doc = await prisma.document.create({
    data: {
      deal_id: deal_id ? BigInt(deal_id) : null,
      agent_id: auth.userId,
      name, doc_type, file_url,
      file_size: file_size ?? null,
      mime_type: mime_type ?? null,
      requires_signature: requires_signature ?? false,
      notes: notes ?? null,
    },
  });

  await logAuditEvent("create", "document", doc.id.toString(), auth);

  return NextResponse.json({
    ok: true,
    item: { ...doc, id: doc.id.toString(), agent_id: doc.agent_id.toString(), deal_id: doc.deal_id?.toString() ?? null },
  }, { status: 201 });
}
