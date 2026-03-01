// POST /api/crm/email/bulk
// Broker sends bulk listing alert emails to matching clients.
// Rate-limited: 50 emails per hour per user.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { sendEmail } from "@/lib/email/sendgrid";
import { listingAlertEmail } from "@/lib/email/templates";

// Simple in-memory rate limit for bulk email (per user, per hour)
const bulkRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const BULK_LIMIT = 50;
const BULK_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkBulkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = bulkRateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    bulkRateLimitMap.set(userId, { count: 1, resetAt: now + BULK_WINDOW_MS });
    return true;
  }
  if (entry.count >= BULK_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  // Rate limit check
  const userId = auth.userId.toString();
  if (!checkBulkRateLimit(userId)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Maximum 50 bulk emails per hour." },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }

  try {
    const body = await req.json();
    const { listings, clientIds, subject } = body;

    if (!listings || !Array.isArray(listings) || listings.length === 0) {
      return NextResponse.json(
        { error: "listings array is required (non-empty)" },
        { status: 400 }
      );
    }

    // Get target clients
    let clients;
    if (clientIds && Array.isArray(clientIds) && clientIds.length > 0) {
      // Send to specific clients
      clients = await prisma.lead.findMany({
        where: {
          id: { in: clientIds.map((id: string | number) => BigInt(id)) },
        },
        select: { id: true, first_name: true, last_name: true, email: true },
      });
    } else {
      // Send to all active clients
      clients = await prisma.lead.findMany({
        where: { status: { in: ["active", "contacted"] } },
        select: { id: true, first_name: true, last_name: true, email: true },
      });
    }

    if (clients.length === 0) {
      return NextResponse.json(
        { error: "No matching clients found" },
        { status: 404 }
      );
    }

    // Cap at 50 per request
    const cappedClients = clients.slice(0, 50);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const client of cappedClients) {
      const clientName = `${client.first_name} ${client.last_name}`;
      const html = listingAlertEmail(listings, clientName);
      const emailSubject = subject || `${listings.length} New Listing${listings.length !== 1 ? "s" : ""} — Mallan Real Estate`;

      const result = await sendEmail(client.email, emailSubject, html, auth);
      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(`${client.email}: ${result.error}`);
      }
    }

    await logAuditEvent("email_bulk", "email", "bulk", auth, {
      listingCount: listings.length,
      recipientCount: cappedClients.length,
      sent,
      failed,
    });

    return NextResponse.json({
      success: failed === 0,
      sent,
      failed,
      total: cappedClients.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Bulk email error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
