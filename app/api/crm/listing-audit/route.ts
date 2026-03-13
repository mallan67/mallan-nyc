// /api/crm/listing-audit — GET: list audits, POST: run audit
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { auditListing } from "@/lib/listing-auditor/auditor";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const passed = searchParams.get("passed");
  const minScore = parseInt(searchParams.get("min_score") || "0");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  const where: Record<string, unknown> = {};
  if (auth.role !== "BROKER") where.agent_id = auth.userId;
  if (passed === "true") where.passed = true;
  if (passed === "false") where.passed = false;
  if (minScore > 0) where.score = { gte: minScore };

  const [audits, total] = await Promise.all([
    prisma.listingAudit.findMany({ where, orderBy: { created_at: "desc" }, take: limit, skip: offset }),
    prisma.listingAudit.count({ where }),
  ]);

  const serialized = audits.map(a => ({
    ...a, id: a.id.toString(), agent_id: a.agent_id?.toString() ?? null,
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
  const { listing_id } = body as { listing_id?: string };
  if (!listing_id) return NextResponse.json({ ok: false, error: "listing_id is required" }, { status: 400 });

  try {
    const result = await auditListing(listing_id);
    await logAuditEvent("audit", "listing", listing_id, auth);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Audit failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
