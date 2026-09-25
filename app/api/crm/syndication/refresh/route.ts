// /api/crm/syndication/refresh — POST: broker-only. RECORDS a syndication
// refresh request. It does not export anything: syndication is held closed
// (lib/syndication/mallan-identity.ts, empty MALLAN_OFFICE_MLS_IDS) and no
// export path exists. The response says so rather than implying otherwise.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { MALLAN_OFFICE_MLS_IDS } from "@/lib/syndication/mallan-identity";

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

  // IS THERE ANYWHERE FOR THIS TO GO?
  //
  // Derived, never hardcoded. `MALLAN_OFFICE_MLS_IDS` is the Layer 1.PRE
  // empty-config guard (lib/syndication/mallan-identity.ts invariant I.5: with
  // it empty, ALL listings are blocked at Layer 1). Reading it here means that
  // when Maya populates it, this route stops reporting "not configured" on its
  // own — nobody has to remember to come back and edit a string.
  const syndicationConfigured = MALLAN_OFFICE_MLS_IDS.length > 0;

  // Record the request either way. Audit is not conditional on outcome.
  await logAuditEvent(
    "syndication_refresh_requested",
    "listing",
    listing_id,
    auth,
    {
      listing_db_id: listing.id.toString(),
      rls_eligible: listing.rls_eligible,
      requested_at: now.toISOString(),
      syndication_configured: syndicationConfigured,
    },
    ipAddress
  );

  // THIS USED TO ANSWER `{ status: "queued" }`.
  //
  // There is no queue. Nothing reads the audit event this route just wrote; no
  // export route exists in the tree; and the syndication program is held closed
  // by the empty-config guard above. The CRM turned that word into the toast
  // "Syndication refresh queued", and the natural next thing a broker does with
  // that is tell a seller their listing has been re-published to the portals —
  // a representation made to a client on the strength of a status this system
  // invented.
  //
  // REQUESTED, EXPORTED and DELIVERED are three different facts. The honest
  // report is the first one only: the request is on the record, nothing was
  // exported, and here is why.
  return NextResponse.json({
    status: "recorded",
    exported: false,
    reason: syndicationConfigured ? null : "SYNDICATION_NOT_CONFIGURED",
    listing_id,
    requested_at: now.toISOString(),
  });
}
