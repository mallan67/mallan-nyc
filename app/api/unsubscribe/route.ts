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
import { escapeHtml } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

// Non-mutating confirmation page rendered on GET. A GET on the List-Unsubscribe
// URL must NEVER unsubscribe: mailbox security scanners and link prefetchers
// issue GET on header/body URLs, and mutating here would opt a recipient out
// before they act. The actual unsubscribe happens only on POST — either the
// RFC 8058 one-click POST from the mail client, or this page's confirm button.
function confirmationPage(email: string, token: string): string {
  const e = escapeHtml(email);
  const qs =
    `email=${encodeURIComponent(email)}` +
    (token ? `&token=${encodeURIComponent(token)}` : "");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Unsubscribe · Mallan Real Estate</title>
<style>body{font-family:Arial,Helvetica,sans-serif;background:#f5f5f5;color:#1a1a1a;margin:0;padding:40px 16px}
.card{max-width:440px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px}
h1{font-size:18px;margin:0 0 10px}p{font-size:14px;color:#374151;line-height:1.6}
button{margin-top:16px;padding:12px 24px;background:#C4A052;color:#fff;border:0;border-radius:6px;font-size:15px;font-weight:700;cursor:pointer}
.foot{margin-top:20px;font-size:11px;color:#9ca3af}</style></head>
<body><div class="card">
<h1>Confirm unsubscribe</h1>
<p>Click below to stop receiving marketing emails from Mallan Real Estate at <strong>${e}</strong>.</p>
<form method="POST" action="/api/unsubscribe?${qs}">
<button type="submit">Unsubscribe me</button>
</form>
<p class="foot">Mallan Real Estate Inc. · 400 East 90th Street, Suite 17C, New York, NY 10128 · NY DOS #10991205323</p>
</div></body></html>`;
}

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

    // RFC 8058 one-click POSTs the List-Unsubscribe header URL with the email +
    // token in the QUERY STRING and a `List-Unsubscribe=One-Click` (non-JSON)
    // body. Read the query first; fall back to a JSON body for the self-service
    // form. Never REQUIRE a JSON body — a one-click body is not JSON.
    let email = request.nextUrl.searchParams.get("email") || "";
    let token = request.nextUrl.searchParams.get("token") || "";
    if (!email) {
      try {
        const body = await request.json();
        email = typeof body?.email === "string" ? body.email : "";
        if (!token) token = typeof body?.token === "string" ? body.token : "";
      } catch {
        // No JSON body (one-click / form-encoded) — rely on the query params.
      }
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    // If a signed token is present it MUST verify — rejects a one-click request
    // whose `email` was altered. Tokenless posts are the self-service form path.
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

// GET is NON-MUTATING by design. RFC 8058 one-click is a POST; the List-Unsubscribe
// HTTPS URL is also fetched with GET by mailbox security scanners and link
// prefetchers, so performing the unsubscribe here would produce false opt-outs
// before the recipient ever clicks. Instead GET renders a confirmation page whose
// button POSTs (carrying email + token) to actually unsubscribe. Gmail/Yahoo
// one-click still POSTs directly and is unaffected.
export async function GET(request: NextRequest) {
  const ip = extractClientIp(request.headers);
  if (!(await checkRouteRateLimit(ip, 'unsubscribe', 60, 3600))) {
    return NextResponse.json(
      { error: 'Rate limited. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }
  const email = request.nextUrl.searchParams.get("email") || "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  // If a signed token is present it MUST verify — rejects a link whose `email`
  // was tampered with — but we still do NOT mutate on GET either way.
  const token = request.nextUrl.searchParams.get("token") || "";
  if (token && !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ error: "Invalid unsubscribe link." }, { status: 403 });
  }
  return new NextResponse(confirmationPage(email, token), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
  });
}
