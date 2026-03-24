// POST /api/crm/communications/[id]/read — Mark a communication as read.
// Since communications are stored as AuditEvents, this is a no-op that returns 200.
// The frontend tracks read state locally. This endpoint prevents 404s.
import { NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export async function POST() {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  return NextResponse.json({ ok: true });
}
