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
    select: { portal_role: true, enabled_workspaces: true, roles: true },
  });

  const portalRole = lead?.portal_role ?? "buyer";
  // Multi-workspace model (Codex #458): a lead can have seller/landlord AND/OR buyer/tenant access
  // via enabled_workspaces or roles[], even when the legacy portal_role was not flipped
  // (promote/conversion flows). We serve the UNION so a lead who is BOTH a buyer and an owner keeps
  // their saved/shared buyer listings AND their owned listings on this shared endpoint — neither
  // dashboard loses data.
  // Precedence matches requireWorkspace / /api/auth/me: enabled_workspaces is the access allow-list
  // when present; fall back to roles[] only when it is empty, then to the legacy portal_role. Do NOT
  // union roles back in — a lead with enabled_workspaces:['buyer'] but stale roles:['seller'] is a
  // buyer here (the seller portal would reject them), so they must not get owner_client_id listings.
  const workspaceList = lead?.enabled_workspaces?.length
    ? lead.enabled_workspaces
    : (lead?.roles?.length ? lead.roles : [portalRole]);
  const workspaces = new Set<string>(workspaceList);
  const isOwner = workspaces.has("seller") || workspaces.has("landlord");
  const isBuyer = workspaces.has("buyer") || workspaces.has("tenant") || workspaces.has("renter") || !isOwner;

  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  // Owner set: the lead's OWNED listings (owner_client_id), regardless of public-display status —
  // owners must see every listing they own (active, withdrawn, closed/sold). The owner serializer
  // lifts only the public-dissemination gates (opt-out/participant/internet-display); ownership is
  // enforced by the owner_client_id filter. The public IDX-display gate is intentionally NOT applied.
  if (isOwner) {
    const owned = await prisma.listing.findMany({
      where: { owner_client_id: auth.userId },
      orderBy: { updated_at: "desc" },
    });
    for (const listing of owned) {
      out.push({ ...sanitizeOwnedListingForOwner(listing, portalRole), reactions: {} as Record<string, boolean> });
      seen.add(listing.id.toString());
    }
  }

  // Buyer set: listings this client has interacted with (clientListingAction), public-display gated.
  if (isBuyer) {
    const actions = await prisma.clientListingAction.findMany({
      where: { lead_id: auth.userId },
      include: { listing: true },
    });
    const listingMap = new Map<string, {
      listing: typeof actions[0]["listing"];
      reactions: Record<string, boolean>;
    }>();
    for (const a of actions) {
      const lid = a.listing_id.toString();
      if (!listingMap.has(lid)) listingMap.set(lid, { listing: a.listing, reactions: {} });
      listingMap.get(lid)!.reactions[a.action] = true;
    }
    for (const [lid, { listing, reactions }] of listingMap) {
      if (seen.has(lid)) continue; // already included as an owned listing (owner serialization wins)
      if (!isListingDisplayable(listing)) continue;
      // DTO sanitization (address suppression, agent masking, additional checks)
      const sanitized = sanitizeListingForPortal(listing, portalRole);
      if (!sanitized) continue;
      // Gate 5: Coming Soon — display allowed but flag for badge (UCBA D3: no showings/open houses)
      const isComingSoon = listing.status === "ComingSoon";
      out.push({ ...sanitized, reactions, ...(isComingSoon ? { comingSoon: true, comingSoonNotice: "Coming Soon. No showings or open houses permitted until listed." } : {}) });
      seen.add(lid);
    }
  }

  return NextResponse.json({ listings: out });
}
