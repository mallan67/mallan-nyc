// POST /api/unsubscribe
// CAN-SPAM (15 USC 7704) + RFC 8058 one-click unsubscribe.
// Sets Lead.email_opt_out=true AND disables all saved-search alerts for the email.
// The outbound mailer in lib/email consults email_opt_out before every non-transactional send.
//
// IDX-VALIDATE-OK: Intentionally unauthenticated. CAN-SPAM §7704(a)(3)(A)(ii) and
// Gmail/Yahoo 2024 bulk-sender guidance require the unsubscribe mechanism to work
// without requiring the recipient to log in or create an account. RFC 8058 one-click
// specifically requires a single POST with no challenge.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function unsubscribe(email: string, source: "form" | "one-click" | "mailto") {
  const sanitized = email.toLowerCase().trim();

  // Suppress marketing/CRM email to this recipient forever (until explicit re-opt-in).
  await prisma.lead.updateMany({
    where: { email: sanitized },
    data: { email_opt_out: true, email_opt_out_at: new Date(), last_unsubscribe_at: new Date() },
  });

  // Also disable saved-search alerts (kept for backwards compat with existing /unsubscribe page).
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
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    await unsubscribe(email, "form");
    return NextResponse.json({ success: true, message: "You have been unsubscribed from all Mallan Real Estate emails." });
  } catch (err) {
    console.error("[/api/unsubscribe] Error:", err);
    return NextResponse.json({ error: "Failed to unsubscribe. Please try again." }, { status: 500 });
  }
}

// RFC 8058 requires One-Click to be a POST, but many legacy clients send GET.
// Accept both so Gmail/Yahoo one-click compliance works regardless of client behavior.
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email") || "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  await unsubscribe(email, "one-click");
  return NextResponse.json({ success: true, message: "You have been unsubscribed." });
}
