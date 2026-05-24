// POST /api/portal/tenant/signals
// First-party tenant workflow signals: rental links, lease timing, docs, rent-vs-buy.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { isAuthError, logAuditEvent, requirePortalRole } from "@/lib/auth";
import { normalizeTenantSignalPayload } from "@/lib/rental-signals/summary";

import { checkPortalWriteRateLimit } from "@/lib/middleware/rate-limiter";
const SIGNAL_EVENTS = [
  "tenant_rental_link_saved",
  "tenant_rent_vs_buy_signal",
  "tenant_lease_timing_update",
  "tenant_document_readiness_update",
];

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requirePortalRole(req, "tenant", "renter");
  if (isAuthError(auth)) return auth;
  // PR-CRM.5 (2026-05-24) — portal_write rate limit (30/hr/user)
  const limited = await checkPortalWriteRateLimit(auth.userId);
  if (limited) return limited;


  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = normalizeTenantSignalPayload(body);
  if (
    payload.monthly_rent === null &&
    payload.target_purchase_price === null &&
    payload.monthly_ownership_budget === null &&
    !payload.lease_end_date &&
    !payload.move_timing &&
    !payload.lease_intent &&
    !payload.document_readiness &&
    !payload.outside_rental_url &&
    !payload.outside_rental_address
  ) {
    return NextResponse.json({ error: "Provide at least one tenant signal" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { id: true, lease_end_date: true, rent_per_month: true },
  });
  if (!lead) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const metadata = {
    ...payload,
    lease_end_date: payload.lease_end_date || lead.lease_end_date?.toISOString() || null,
    monthly_rent: payload.monthly_rent ?? (lead.rent_per_month ? Number(lead.rent_per_month) : null),
  };

  const created = await prisma.$transaction(
    SIGNAL_EVENTS.map((eventType) =>
      prisma.portalEvent.create({
        data: {
          lead_id: lead.id,
          workspace: "tenant",
          event_type: eventType,
          metadata: metadata as Prisma.InputJsonValue,
        },
      }),
    ),
  );

  await logAuditEvent(
    "tenant_signals_captured",
    "lead",
    lead.id.toString(),
    auth,
    {
      event_count: created.length,
      lease_intent: metadata.lease_intent,
      document_readiness: metadata.document_readiness,
      move_timing: metadata.move_timing,
    },
    req.headers.get("x-forwarded-for") ?? undefined,
  );

  return NextResponse.json({
    ok: true,
    events: created.map((event) => ({
      id: event.id.toString(),
      event_type: event.event_type,
      recorded_at: event.created_at.toISOString(),
    })),
  }, { status: 201 });
}
