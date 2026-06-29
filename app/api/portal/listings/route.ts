// GET /api/portal/listings
// Listings shared with this client (via actions). Lead users only.
// Uses centralized DTO for REBNY-compliant masking (address, agent PII, owner opt-out).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";
import { sanitizeListingForPortal, sanitizeOwnedListingForOwner } from "@/lib/compliance/dto";
import { isListingDisplayable } from "@/lib/search/listing-access-decision";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  if (auth.userType !== "lead") {
    return NextResponse.json(
      { error: "Portal access requires a client account" },
      { status: 403 }
    );
  }

  const lead = await prisma.lead.findUnique({
    where: { id: auth.userId },
    select: { portal_role: true },
  });

  const portalRole = lead?.portal_role ?? "buyer";
  const isOwnerRole = portalRole === "seller" || portalRole === "landlord";

  // Sellers/landlords: their OWNED listings (owner_client_id), regardless of public-display status —
  // owners must see every listing they own (active, withdrawn, closed/sold) to track what is
  // happening with their listing. Field-level masking still applies via the portal DTO; the PUBLIC
  // IDX-display gate (isListingDisplayable) is intentionally NOT applied to an owner's own data.
  if (isOwnerRole) {
    const owned = await prisma.listing.findMany({
      where: { owner_client_id: auth.userId },
      orderBy: { updated_at: "desc" },
    });
    // Owner-view serializer: no public-dissemination gates (so opted-out / participant-only /
    // CRM-exclusive owned listings still appear to their owner), same field masking. Ownership was
    // already enforced by the owner_client_id filter above.
    const ownedListings = owned.map((listing) => ({
      ...sanitizeOwnedListingForOwner(listing, portalRole),
      reactions: {} as Record<string, boolean>,
    }));
    return NextResponse.json({ listings: ownedListings });
  }

  // Buyers/tenants: listings this client has interacted with (clientListingAction).
  const actions = await prisma.clientListingAction.findMany({
    where: { lead_id: auth.userId },
    include: {
      listing: true,
    },
  });

  // Group by listing, attach reaction status
  const listingMap = new Map<string, {
    listing: typeof actions[0]["listing"];
    reactions: Record<string, boolean>;
  }>();

  for (const a of actions) {
    const lid = a.listing_id.toString();
    if (!listingMap.has(lid)) {
      listingMap.set(lid, {
        listing: a.listing,
        reactions: {},
      });
    }
    listingMap.get(lid)!.reactions[a.action] = true;
  }

  const listings = Array.from(listingMap.values())
    .map(({ listing, reactions }) => {
      if (!isListingDisplayable(listing)) return null;
      // DTO sanitization (address suppression, agent masking, additional checks)
      const sanitized = sanitizeListingForPortal(listing, portalRole);
      if (!sanitized) return null;
      // Gate 5: Coming Soon — display allowed but flag for badge (UCBA D3: no showings/open houses)
      const isComingSoon = listing.status === "ComingSoon";
      return { ...sanitized, reactions, ...(isComingSoon ? { comingSoon: true, comingSoonNotice: "Coming Soon. No showings or open houses permitted until listed." } : {}) };
    })
    .filter(Boolean);

  return NextResponse.json({ listings });
}
