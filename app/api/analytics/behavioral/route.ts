import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  isValidBehavioralEvent,
  recordBehavioralEvent,
  type BehavioralEventInput,
} from "@/lib/behavioral/events";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  if (!isValidBehavioralEvent(body)) {
    return new NextResponse(null, { status: 204 });
  }

  const auth = await requireAuth(req);
  const leadId = !isAuthError(auth) && auth.userType === "lead" ? auth.userId : undefined;
  const event: BehavioralEventInput = leadId ? { ...body, leadId } : body;

  try {
    await recordBehavioralEvent(event);
  } catch (err) {
    console.warn("[analytics/behavioral] failed to record event:", err instanceof Error ? err.message : err);
  }

  return new NextResponse(null, { status: 204 });
}
