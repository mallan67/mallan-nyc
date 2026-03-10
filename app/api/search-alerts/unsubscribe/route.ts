// POST /api/search-alerts/unsubscribe
// CAN-SPAM compliant unsubscribe — disables alerts for given email.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, searchId } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const sanitizedEmail = email.toLowerCase().trim();

    // If specific search ID, disable just that one
    if (searchId) {
      await prisma.savedSearch.updateMany({
        where: {
          id: BigInt(searchId),
          alert_email: sanitizedEmail,
        },
        data: { alert_enabled: false },
      });
    } else {
      // Disable all alerts for this email
      await prisma.savedSearch.updateMany({
        where: { alert_email: sanitizedEmail },
        data: { alert_enabled: false },
      });
    }

    await prisma.auditEvent.create({
      data: {
        action: "search_alert_unsubscribed",
        entity_type: "saved_search",
        entity_id: searchId || "all",
        user_type: "public",
        user_id: null,
        changes: { email: sanitizedEmail },
      },
    });

    return NextResponse.json({
      success: true,
      message: "You have been unsubscribed from listing alerts.",
    });
  } catch (err) {
    console.error("[/api/search-alerts/unsubscribe] Error:", err);
    return NextResponse.json(
      { error: "Failed to unsubscribe. Please try again." },
      { status: 500 }
    );
  }
}
