// POST /api/idx/ensure-listing
// Ensures an IDX/Trestle listing exists in the local DB so that showings,
// listing-sends, and other actions that require a Prisma Listing record work.
//
// If the listing already exists (by listing_id or mls_id), returns it.
// If not, creates a minimal record from the IDX search data provided in the body.
//
// Auth: agent or broker session required.
// The row is Cotality-source-owned (rls_eligible=true, like every Trestle row); it is never a
// Mallan-local listing. A body without a price, a live status or an explicit inventory type
// is refused (422) — no fact is fabricated to obtain a foreign-key identity.
//
// The creation logic lives in lib/listings/ensure-local-listing.ts (Packet 2 closure) so the
// Saved Search alert cron can obtain the same local identity without an HTTP round-trip.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { ensureLocalListing, UnrepresentableListingError, type EnsureListingInput } from "@/lib/listings/ensure-local-listing";

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const listingId = body.listing_id as string;
  if (!listingId || typeof listingId !== "string" || listingId.trim().length === 0) {
    return NextResponse.json(
      { error: "listing_id is required (Trestle ListingId)" },
      { status: 400 }
    );
  }

  try {
    const ensured = await ensureLocalListing(body as unknown as EnsureListingInput, async (listing) => {
      await logAuditEvent("create", "listing", listing.id.toString(), auth, { source: "idx_ensure", trestle_id: listingId.trim() });
    });
    return NextResponse.json(
      { listing_id: ensured.listing_id, db_id: ensured.id.toString(), created: ensured.created },
      { status: ensured.created ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof UnrepresentableListingError) {
      return NextResponse.json(
        { error: "This listing cannot be recorded locally without fabricating provider facts.", code: "unrepresentable_listing", reasons: err.reasons },
        { status: 422 },
      );
    }
    console.error("[ensure-listing] Create failed:", err);
    return NextResponse.json(
      { error: "Failed to create listing record" },
      { status: 500 }
    );
  }
}
