// /api/crm/syndication/refresh — POST: broker-only syndication refresh trigger
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { listing_id } = body as { listing_id?: string };

  if (!listing_id) {
    return NextResponse.json({ error: "listing_id is required" },
      { status: 400 }
    );
  }

  // Verify listing exists
  const listing = await prisma.listing.findUnique({
    where: { listing_id },
    select: { id: true, listing_id: true, rls_eligible: true },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;
  const now = new Date();

  // Log the syndication refresh request as an audit event.
  // Actual sync happens via cron — this just records the request.
  await logAuditEvent(
    "syndication_refresh_requested",
    "listing",
    listing_id,
    auth,
    {
      listing_db_id: listing.id.toString(),
      rls_eligible: listing.rls_eligible,
      requested_at: now.toISOString(),
    },
    ipAddress
  );

  return NextResponse.json({ status: "queued",
    listing_id,
    requested_at: now.toISOString(),
  });
}
