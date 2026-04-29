// GET /api/portal/listings
// Listings shared with this client (via actions). Lead users only.
// Uses centralized DTO for REBNY-compliant masking (address, agent PII, owner opt-out).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";
import { sanitizeListingForPortal } from "@/lib/compliance/dto";
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

  // Find all listings this client has interacted with
  const actions = await prisma.clientListingAction.findMany({
    where: { lead_id: auth.userId },
    include: {
      listing: true,
    },
  });

  const portalRole = lead?.portal_role ?? "buyer";

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
