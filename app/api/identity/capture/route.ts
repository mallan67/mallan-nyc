import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createInquiry } from "@/lib/inquiries/create";
import {
  checkRouteRateLimit,
  extractClientIp,
} from "@/lib/middleware/rate-limiter";
import {
  extractBehavioralSessionId,
  linkBehavioralSessionToLead,
} from "@/lib/behavioral/session-link";

export const dynamic = "force-dynamic";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clean(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: NextRequest) {
  const ip = extractClientIp(request.headers);
  if (!(await checkRouteRateLimit(ip, "identity_capture", 20, 3600))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const email = clean(obj.email, 254)?.toLowerCase();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const captureSource = clean(obj.source, 64) || "soft_identity_capture";
  const listingId = clean(obj.listingId, 64);
  const behavioralSessionId = extractBehavioralSessionId(obj);
  const consentDate = new Date();

  try {
    const lead = await prisma.lead.upsert({
      where: { email },
      create: {
        first_name: "",
        last_name: "",
        email,
        phone: "",
        roles: ["buyer"],
        status: "new",
        source: captureSource,
        anonymous_session_id: behavioralSessionId,
        consent_captured_at: consentDate,
      },
      update: {
        anonymous_session_id: behavioralSessionId || undefined,
        consent_captured_at: consentDate,
        updated_at: new Date(),
      },
    });

    const linkedEvents = await linkBehavioralSessionToLead(behavioralSessionId, lead.id);

    await prisma.auditEvent.create({
      data: {
        action: "soft_identity_captured",
        entity_type: "lead",
        entity_id: lead.id.toString(),
        user_type: "public",
        user_id: null,
        changes: {
          source: captureSource,
          listing_id: listingId,
          linked_events: linkedEvents,
        },
      },
    });

    await createInquiry({
      source: "soft_identity_capture",
      leadId: lead.id,
      message: listingId ? `Soft identity capture from listing ${listingId}` : null,
      email,
      phone: null,
      firstName: lead.first_name,
      lastName: lead.last_name,
      consentCapturedAt: consentDate,
      userAgent: request.headers.get("user-agent"),
      rawClientIp: ip,
      metadata: {
        listing_id: listingId ?? undefined,
        capture_source: captureSource,
        behavioral_session_id: behavioralSessionId ?? undefined,
        linked_events: linkedEvents,
      },
    });

    return NextResponse.json({
      success: true,
      id: lead.id.toString(),
      linkedEvents,
    });
  } catch (err) {
    console.error(
      "[identity/capture] failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
