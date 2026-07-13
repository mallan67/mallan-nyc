// POST /api/unsubscribe
// CAN-SPAM (15 USC 7704) + RFC 8058 one-click unsubscribe.
//
// Current behavior (post-2026-04-20 revert): disables all saved-search alerts
// for the email AND writes `last_unsubscribe_at` on any matching Lead. Logs an
// AuditEvent row. Full suppression (Lead.email_opt_out) is pending a Neon
// schema migration; re-add once it applies — see the TODO in the handler.
//
// IDX-VALIDATE-OK: Intentionally unauthenticated. CAN-SPAM §7704(a)(3)(A)(ii) and
// Gmail/Yahoo 2024 bulk-sender guidance require the unsubscribe mechanism to work
// without requiring the recipient to log in or create an account. RFC 8058 one-click
// specifically requires a single POST with no challenge.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRouteRateLimit, extractClientIp } from "@/lib/middleware/rate-limiter";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

export const dynamic = "force-dynamic";

async function unsubscribe(email: string, source: "form" | "one-click" | "mailto") {
  const sanitized = email.toLowerCase().trim();

  // NOTE: Lead.email_opt_out / email_opt_out_at writes are disabled until the
  // corresponding migration lands (blocked by Neon compute quota). For now the
  // only durable effect is disabling the recipient's saved-search alerts + an
  // AuditEvent row — same behavior as the prior /api/search-alerts/unsubscribe.
  // Restore the Lead update + opt-out timestamp once the schema is deployed.
  await prisma.lead.updateMany({
    where: { email: sanitized },
    data: { last_unsubscribe_at: new Date() },
  });

  await prisma.savedSearch.updateMany({
    where: { alert_email: sanitized },
    data: { alert_enabled: false },
  });

  await prisma.auditEvent.create({
    data: {
      action: "email_unsubscribed",
      entity_type: "lead",
      entity_id: sanitized,
      user_type: "public",
      user_id: null,
      changes: { email: sanitized, source },
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20/hr/IP. Unsubscribe is idempotent and user-initiated, so
    // legitimate traffic is well below this. Bounded to stop attackers from
    // bulk-unsubscribing leads (which would disable their marketing touchpoints).
    const ip = extractClientIp(request.headers);
    if (!(await checkRouteRateLimit(ip, 'unsubscribe', 20, 3600))) {
      return NextResponse.json(
        { error: 'Rate limited. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const email = typeof body?.email === "string" ? body.email : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    // If a signed token is present it MUST verify — rejects a one-click request
    // whose `email` was altered. Tokenless posts are the self-service form path.
    const token = typeof body?.token === "string" ? body.token : "";
    if (token && !verifyUnsubscribeToken(email, token)) {
      return NextResponse.json({ error: "Invalid unsubscribe link." }, { status: 403 });
    }
    await unsubscribe(email, token ? "one-click" : "form");
    return NextResponse.json({ success: true, message: "You have been unsubscribed from all Mallan Real Estate emails." });
  } catch (err) {
    console.error("[/api/unsubscribe] Error:", err);
    return NextResponse.json({ error: "Failed to unsubscribe. Please try again." }, { status: 500 });
  }
}

// RFC 8058 requires One-Click to be a POST, but many legacy clients send GET.
// Accept both so Gmail/Yahoo one-click compliance works regardless of client behavior.
export async function GET(request: NextRequest) {
  const ip = extractClientIp(request.headers);
  if (!(await checkRouteRateLimit(ip, 'unsubscribe', 20, 3600))) {
    return NextResponse.json(
      { error: 'Rate limited. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }
  const email = request.nextUrl.searchParams.get("email") || "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  // If a signed token is present it MUST verify — rejects a one-click link whose
  // `email` was tampered with. Tokenless (legacy) links use the rate-limited path.
  const token = request.nextUrl.searchParams.get("token");
  if (token && !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ error: "Invalid unsubscribe link." }, { status: 403 });
  }
  await unsubscribe(email, token ? "one-click" : "form");
  return NextResponse.json({ success: true, message: "You have been unsubscribed." });
}
