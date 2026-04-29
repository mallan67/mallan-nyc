// /api/crm/showing-history — GET: per-lead showing history, POST: create
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";
import { assertLeadIdStringAccess } from "@/lib/crm/access";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const leadId = url.searchParams.get("lead_id");

  if (!leadId) {
    return NextResponse.json({ error: "lead_id required" }, { status: 400 });
  }

  const access = await assertLeadIdStringAccess(auth, leadId);
  if (access.response) return access.response;

  const history = await prisma.showingHistory.findMany({
    where: { lead_id: access.leadId! },
    orderBy: { showing_date: "desc" },
    take: 200,
  });

  const enriched = history.map((h) => ({
    ...h,
    id: String(h.id),
    lead_id: String(h.lead_id),
  }));

  return NextResponse.json({ showings: enriched });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { lead_id, listing_id, address, unit, showing_date, price_at_time, reaction, what_caught_attention, why_not_rented, notes } = body;

  if (!lead_id || !address || !showing_date) {
    return NextResponse.json({ error: "lead_id, address, showing_date required" }, { status: 400 });
  }

  const access = await assertLeadIdStringAccess(auth, lead_id);
  if (access.response) return access.response;

  const record = await prisma.showingHistory.create({
    data: {
      lead_id: access.leadId!,
      listing_id: listing_id || null,
      address,
      unit: unit || null,
      showing_date: new Date(showing_date),
      price_at_time: price_at_time ? parseFloat(price_at_time) : null,
      reaction: reaction || null,
      what_caught_attention: what_caught_attention || null,
      why_not_rented: why_not_rented || null,
      notes: notes || null,
    },
  });

  await logAuditEvent(
    "create_showing_history",
    "showing_history",
    String(record.id),
    auth,
    { address },
  );

  return NextResponse.json({
    showing: { ...record, id: String(record.id), lead_id: String(record.lead_id) },
  }, { status: 201 });
}
