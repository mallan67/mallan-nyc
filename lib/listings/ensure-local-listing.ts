/**
 * ENSURE A LOCAL LISTING IDENTITY for a provider (Cotality / IDX) listing.
 *
 * Mallan's canonical client history — ClientListingAction(lead, listing, "sent") — references
 * the local Listing row. A provider listing that has not been synced yet has none, so the CRM
 * has always created a MINIMAL local record from the hydrated Search DTO the shell holds
 * (POST /api/idx/ensure-listing) before listing-sends and showings. This module is that
 * creation logic, extracted so the alert cron can obtain the same identity without an
 * authenticated HTTP round-trip. The route delegates here; semantics are unchanged:
 *
 *   - identity: `listing_id` = provider ListingId (also stored in `mls_id` as before);
 *   - `rls_eligible = false` — an external listing, never a Mallan exclusive;
 *   - display gates FAIL-CLOSED from the DTO's own reading of the provider flags;
 *   - `last_synced_from_trestle` stays NULL so the Trestle cursor never sees this row;
 *     the real sync reconciles it by `listing_id` when the listing is in the feed;
 *   - the values come from the live provider response (the DTO), never invented locally.
 *
 * Cotality remains the authority for what the listing IS; the local row only gives it an
 * identity Mallan's history can reference.
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { affirmPermission } from "@/lib/compliance/gates";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { TERMINAL_STATUSES, normalizeStandardStatus } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";

/** The ensure-listing request body shape (what the CRM shell posts from a Search DTO). */
export interface EnsureListingInput {
  listing_id: string;
  address?: unknown; unit?: unknown; neighborhood?: unknown; borough?: unknown; zip?: unknown;
  latitude?: unknown; longitude?: unknown; cross_street?: unknown;
  price?: unknown; beds?: unknown; baths?: unknown; full_baths?: unknown; half_baths?: unknown; int_sqft?: unknown;
  property_type?: unknown; property_sub_type?: unknown; status?: unknown;
  listing_category?: unknown; listing_type?: unknown;
  agent_name?: unknown; agent_email?: unknown; agent_phone?: unknown; company?: unknown;
  images?: unknown; internet_display_yn?: unknown; address_display_yn?: unknown;
}

export interface EnsuredListing { id: bigint; listing_id: string; created: boolean }

/** Build the ensure input from the shared Search DTO (the same mapping the CRM shell uses). */
export function ensureInputFromSearchDto(dto: Record<string, unknown>): EnsureListingInput {
  return {
    listing_id: String(dto.id ?? ""),
    address: dto.address, unit: dto.unit, neighborhood: dto.neighborhood, borough: dto.borough, zip: dto.zip,
    latitude: dto.latitude, longitude: dto.longitude, cross_street: dto.crossStreet,
    price: dto.price, beds: dto.beds, baths: dto.baths, full_baths: dto.fullBaths, half_baths: dto.halfBaths, int_sqft: dto.intSqft,
    property_type: dto.propertyType, property_sub_type: dto.propertySubType,
    // The provider's own status string (StandardStatus / MlsStatus) normalizes exactly; the
    // CRM's uppercase display code is the fallback the shell has always posted.
    status: dto.mlsStatus || dto.status,
    listing_category: dto.listingCategory, listing_type: dto.listingCategory === "rental" ? "rent" : "sale",
    agent_name: dto.agentName, agent_email: dto.agentEmail, agent_phone: dto.agentPhone, company: dto.company,
    images: dto.images, internet_display_yn: dto.internetDisplayYN, address_display_yn: dto.addressDisplayYN,
  };
}

/**
 * Find or create the local row. `audit` is called only when a row is created (the route logs
 * with the acting agent; the cron logs as system).
 */
export async function ensureLocalListing(
  input: EnsureListingInput,
  audit?: (listing: { id: bigint; listing_id: string }) => Promise<void>,
): Promise<EnsuredListing> {
  const trimmedId = String(input.listing_id ?? "").trim();
  if (!trimmedId) throw new Error("listing_id is required (Trestle ListingId)");

  // 1. By listing_id
  const existing = await prisma.listing.findUnique({ where: { listing_id: trimmedId }, select: { id: true, listing_id: true } });
  if (existing) return { id: existing.id, listing_id: existing.listing_id, created: false };
  // 2. By mls_id (the Trestle ListingId may have been stored there)
  const byMlsId = await prisma.listing.findFirst({ where: { mls_id: trimmedId }, select: { id: true, listing_id: true } });
  if (byMlsId) return { id: byMlsId.id, listing_id: byMlsId.listing_id, created: false };

  // 3. Create the minimal record from the DTO-shaped input
  const addressStr = typeof input.address === "string" ? input.address : "";
  const isRental = input.listing_category === "rental" ||
    String(input.listing_type || "").toLowerCase().includes("rent") ||
    String(input.listing_type || "").toLowerCase().includes("lease");
  const addressJson: Record<string, unknown> = {
    full: addressStr,
    unit: (input.unit as string) || "",
    neighborhood: (input.neighborhood as string) || "",
    borough: (input.borough as string) || "",
    zip: (input.zip as string) || "",
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    cross_street: (input.cross_street as string) || "",
  };
  const agentInfoJson: Record<string, unknown> = {
    name: (input.agent_name as string) || "",
    email: (input.agent_email as string) || "",
    phone: (input.agent_phone as string) || "",
    company: (input.company as string) || "",
  };
  // Normalize the status BEFORE the terminal guard and the write (H1, 2026-05-13).
  const canonicalStatus = normalizeStandardStatus(input.status);
  try {
    const listing = await prisma.listing.create({
      data: {
        listing_id: trimmedId,
        mls_id: trimmedId,
        listing_type: isRental ? "rent" : "sale",
        status: canonicalStatus,
        address: addressJson as Prisma.InputJsonValue,
        list_price: input.price != null ? Number(input.price) : 0,
        bedrooms_total: input.beds != null ? Number(input.beds) : null,
        bathrooms_full: input.full_baths != null ? Number(input.full_baths) : (input.baths != null ? Math.floor(Number(input.baths)) : null),
        bathrooms_half: input.half_baths != null ? Number(input.half_baths) : null,
        living_area: input.int_sqft != null ? Number(input.int_sqft) : null,
        borough: (input.borough as string) || null,
        neighborhood: (input.neighborhood as string) || null,
        postal_code: (input.zip as string) || null,
        property_type: (input.property_type as string) || null,
        property_sub_type: (input.property_sub_type as string) || null,
        rls_eligible: false, // External IDX listing, not our exclusive
        // §2.05 secondary-writer guard: the same canonical status decides display.
        idx_display_yn: !TERMINAL_STATUSES.has(canonicalStatus),
        ...computeTerminalSincePatch({ previousStatus: undefined, newStatus: canonicalStatus, raw_data: {}, features: {} }),
        // Fail-CLOSED: untrusted input; missing/null never becomes displayable.
        internet_entire_listing_display_yn: affirmPermission(input.internet_display_yn),
        internet_address_display_yn: affirmPermission(input.address_display_yn),
        ...typedAgentColumnsFromJson(agentInfoJson),
        media: (input.images as Prisma.InputJsonValue) ?? ([] as Prisma.InputJsonValue),
        features: {} as Prisma.InputJsonValue,
        compliance: {} as Prisma.InputJsonValue,
        // Trestle cursor safety: NOT a sync writer, so last_synced_from_trestle stays NULL and
        // this row is outside the cursor query; local NOW is safe for the non-nullable column.
        modification_timestamp: new Date(),
        sync_status: "pending",
      },
    });
    if (audit) await audit({ id: listing.id, listing_id: listing.listing_id });
    // H1 Tier-1 dual-write — non-fatal; ops:projection-backfill heals on the next run.
    try {
      await dualWriteProjectionForListingId(prisma, listing.listing_id);
    } catch (projErr) {
      console.warn("[ensure-listing] projection dual-write failed:", projErr instanceof Error ? projErr.message : projErr);
    }
    return { id: listing.id, listing_id: listing.listing_id, created: true };
  } catch (err) {
    // Race: another writer created it between the check and the create.
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      const raced = await prisma.listing.findUnique({ where: { listing_id: trimmedId }, select: { id: true, listing_id: true } });
      if (raced) return { id: raced.id, listing_id: raced.listing_id, created: false };
    }
    throw err;
  }
}
