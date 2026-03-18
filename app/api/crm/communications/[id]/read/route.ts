// POST /api/crm/communications/[id]/read — Mark a communication as read.
// Since communications are stored as AuditEvents, this is a no-op that returns 200.
// The frontend tracks read state locally. This endpoint prevents 404s.
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true });
}
