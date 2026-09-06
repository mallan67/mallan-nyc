// POST /api/crm/listings/[id]/validate
// Dry-run compliance validation — does not persist any changes.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { validateListing } from "@/lib/compliance/rebny-validator";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { listingCapabilities, CAPABILITY_DENIED } from "@/lib/auth/listing-capabilities";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Resolve listing by numeric BigInt id or string listing_id (SL-/RL- prefix).
  let listing;
  const numericId = safeBigInt(id);
  if (numericId) {
    listing = await prisma.listing.findUnique({
      where: { id: numericId },
    });
  }
  if (!listing) {
    listing = await prisma.listing.findUnique({
      where: { listing_id: id },
    });
  }

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Dry-run only — persists nothing — so this stays at READ level
  // (`mayViewHistory`), matching GET /api/crm/listings/[id]. Running a
  // compliance check against a source-owned row is a legitimate reconciliation
  // action; it is the WRITE routes that are restricted to local listings.
  if (!listingCapabilities(auth, listing).mayViewHistory) {
    return NextResponse.json(CAPABILITY_DENIED.ACCESS, { status: 403 });
  }

  // Merge stored raw_data with any additional fields from request body
  const existingRaw = (listing.raw_data as Record<string, unknown>) ?? {};
  let merged = existingRaw;

  try {
    const body = await req.json();
    if (body && typeof body === "object") {
      merged = { ...existingRaw, ...body };
    }
  } catch {
    // No body provided — validate existing data only
  }

  // Reporting wrapper + the ONE required / conditional evaluator (rls-enforcement over REBNY_UCBA_RULES).
  const validation = validateListing(merged, {
    listingType: (listing.listing_type as string) === "rent" ? "rent" : "sale",
    isNewDevelopment: merged.NewDevelopmentYN === true,
    currentStatus: (merged._mallanStatus as string) || listing.status || undefined,
    rlsEligible: listing.rls_eligible !== false,
  });

  return NextResponse.json({
    listing_id: listing.listing_id,
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    suggestions: validation.suggestions,
    compliance: validation.compliance,
    fieldResults: validation.fieldResults,
  });
}
