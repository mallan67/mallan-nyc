/**
 * ENSURE A LOCAL LISTING IDENTITY for a provider (Cotality / IDX) listing.
 *
 * Mallan's canonical client history — ClientListingAction(lead, listing, "sent") — references
 * the local Listing row. A provider listing that has not been synced yet has none, so the CRM
 * has always created a MINIMAL local record from the hydrated Search DTO (POST
 * /api/idx/ensure-listing) before listing-sends and showings. This module is that creation
 * logic, shared by the route and the alert cron. The SOURCE BOUNDARY is absolute:
 *
 *   - the row is Cotality-source-owned, exactly as the Trestle sync writes it:
 *     `rls_eligible = true` (Trestle-sourced rows are REBNY-eligible by definition — the
 *     mapper, the sync and computeGateColumns all say so). `rls_eligible = false` is Mallan's
 *     WEBSITE-ONLY marker and makes a row `mallan-local` (isMallanLocalListing,
 *     listingCapabilities, isMallanExclusiveListing, decideDbPublicAddress). A provider
 *     stub must never carry it. (The former route did; that was a source-classification
 *     defect, corrected here.)
 *   - distribution restrictions come from the CANONICAL gate helper (computeGateColumns):
 *     IDX Plus pre-filter semantics for the entire-listing and address flags, fail-closed
 *     per-row opt-outs, the §2.05 terminal guard, participant-only / owner-opt-out.
 *   - NO FABRICATED PROVIDER FACTS. Cotality declares ListPrice nullable; the local column
 *     is not. A DTO without a price, without a live StandardStatus, or without an explicit
 *     inventory type is UNREPRESENTABLE and refused (UnrepresentableListingError) — never a
 *     $0 / "Active" / "sale" row invented for the sake of a foreign key.
 *   - `last_synced_from_trestle` stays NULL (outside the Trestle cursor); the real sync
 *     reconciles the row by `listing_id` and keeps `rls_eligible: true`.
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { computeGateColumns, resolveMember, STANDARD_STATUS_MEMBERS as LIVE_STATUS } from "./ensure-local-listing.deps";
import { dualWriteProjectionForListingId } from "@/lib/search/listing-search-projection";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { computeTerminalSincePatch } from "@/lib/listings/terminal-since";

export type EnsureListingType = "sale" | "rent";

/** The ensure-listing input shape (what the CRM shell posts from a Search DTO). */
export interface EnsureListingInput {
  listing_id: string;
  address?: unknown; unit?: unknown; neighborhood?: unknown; borough?: unknown; zip?: unknown;
  latitude?: unknown; longitude?: unknown; cross_street?: unknown;
  price?: unknown; list_price?: unknown; beds?: unknown; baths?: unknown; full_baths?: unknown; half_baths?: unknown; int_sqft?: unknown;
  property_type?: unknown; property_sub_type?: unknown; status?: unknown;
  listing_category?: unknown; listing_type?: unknown;
  agent_name?: unknown; agent_email?: unknown; agent_phone?: unknown; company?: unknown;
  images?: unknown; internet_display_yn?: unknown; address_display_yn?: unknown;
  owner_opt_out?: unknown; participant_only?: unknown;
}

export interface EnsuredListing { id: bigint; listing_id: string; created: boolean }

export class UnrepresentableListingError extends Error {
  constructor(public readonly listingId: string, public readonly reasons: string[]) {
    super(`listing ${listingId} cannot be represented locally without fabricating facts: ${reasons.join("; ")}`);
    this.name = "UnrepresentableListingError";
  }
}

/** Build the ensure input from the shared Search DTO. `listingType` is the KNOWN inventory type (never inferred from absence). */
export function ensureInputFromSearchDto(dto: Record<string, unknown>, listingType?: EnsureListingType): EnsureListingInput {
  const perms = (dto.permissions && typeof dto.permissions === "object" ? dto.permissions : {}) as Record<string, unknown>;
  return {
    listing_id: String(dto.id ?? ""),
    address: dto.address, unit: dto.unit, neighborhood: dto.neighborhood, borough: dto.borough, zip: dto.zip,
    latitude: dto.latitude, longitude: dto.longitude, cross_street: dto.crossStreet,
    price: dto.price, beds: dto.beds, baths: dto.baths, full_baths: dto.fullBaths, half_baths: dto.halfBaths, int_sqft: dto.intSqft,
    property_type: dto.propertyType, property_sub_type: dto.propertySubType,
    // The provider's own status string; the CRM's uppercase code only as the shell's legacy fallback.
    status: dto.mlsStatus || dto.status,
    listing_category: dto.listingCategory,
    listing_type: listingType ?? (dto.listingCategory === "rental" ? "rent" : dto.listingCategory === "sale" ? "sale" : undefined),
    agent_name: dto.agentName, agent_email: dto.agentEmail, agent_phone: dto.agentPhone, company: dto.company,
    images: dto.images, internet_display_yn: dto.internetDisplayYN, address_display_yn: dto.addressDisplayYN,
    owner_opt_out: perms.ownerOptOut, participant_only: perms.participantOnly,
  };
}

function inventoryType(input: EnsureListingInput): EnsureListingType | null {
  const t = String(input.listing_type ?? "").trim().toLowerCase();
  if (t === "rent" || t === "rental" || t === "lease") return "rent";
  if (t === "sale") return "sale";
  const c = String(input.listing_category ?? "").trim().toLowerCase();
  if (c === "rental") return "rent";
  if (c === "sale") return "sale";
  return null;
}

/**
 * Find or create the local row. `audit` is called only when a row is created (the route logs
 * with the acting agent; the cron logs as system). Throws UnrepresentableListingError when a
 * required local fact is absent from the provider data.
 */
export async function ensureLocalListing(
  input: EnsureListingInput,
  audit?: (listing: { id: bigint; listing_id: string }) => Promise<void>,
): Promise<EnsuredListing> {
  const trimmedId = String(input.listing_id ?? "").trim();
  if (!trimmedId) throw new UnrepresentableListingError("", ["listing_id is required (Trestle ListingId)"]);

  // 1. By listing_id
  const existing = await prisma.listing.findUnique({ where: { listing_id: trimmedId }, select: { id: true, listing_id: true } });
  if (existing) return { id: existing.id, listing_id: existing.listing_id, created: false };
  // 2. By mls_id (the Trestle ListingId may have been stored there)
  const byMlsId = await prisma.listing.findFirst({ where: { mls_id: trimmedId }, select: { id: true, listing_id: true } });
  if (byMlsId) return { id: byMlsId.id, listing_id: byMlsId.listing_id, created: false };

  // 3. Required local facts — refused, never fabricated.
  const reasons: string[] = [];
  const priceRaw = input.price ?? input.list_price;
  const price = priceRaw === null || priceRaw === undefined || priceRaw === "" ? null : Number(priceRaw);
  if (price === null || !Number.isFinite(price)) reasons.push("ListPrice is absent (Cotality declares it nullable; a $0 row would be a fabricated fact)");
  const statusRaw = String(input.status ?? "").trim();
  const liveStatus = statusRaw ? resolveMember(statusRaw, LIVE_STATUS) : null;
  if (!liveStatus) reasons.push(statusRaw ? `status "${statusRaw}" is not a live StandardStatus member` : "status is absent (never defaulted to Active)");
  const type = inventoryType(input);
  if (!type) reasons.push("inventory type (sale / rent) is not stated (never inferred from absence)");
  if (reasons.length) throw new UnrepresentableListingError(trimmedId, reasons);

  // 4. Canonical distribution gates for a Cotality-source-owned row.
  const gates = computeGateColumns({
    status: liveStatus,
    internetEntireListingDisplayYN: input.internet_display_yn,
    internetAddressDisplayYN: input.address_display_yn,
    participantOnly: input.participant_only === true,
    ownerOptOut: input.owner_opt_out === true,
    rls_eligible: true,
  });

  const addressJson: Record<string, unknown> = {
    full: typeof input.address === "string" ? input.address : "",
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
  try {
    const listing = await prisma.listing.create({
      data: {
        listing_id: trimmedId,
        mls_id: trimmedId,
        listing_type: type as string,
        status: gates.normalized_status,
        address: addressJson as Prisma.InputJsonValue,
        list_price: price as number,
        bedrooms_total: input.beds != null ? Number(input.beds) : null,
        bathrooms_full: input.full_baths != null ? Number(input.full_baths) : (input.baths != null ? Math.floor(Number(input.baths)) : null),
        bathrooms_half: input.half_baths != null ? Number(input.half_baths) : null,
        living_area: input.int_sqft != null ? Number(input.int_sqft) : null,
        borough: (input.borough as string) || null,
        neighborhood: (input.neighborhood as string) || null,
        postal_code: (input.zip as string) || null,
        property_type: (input.property_type as string) || null,
        property_sub_type: (input.property_sub_type as string) || null,
        // SOURCE BOUNDARY: Cotality-source-owned, RLS-backed, exactly as the sync writes it.
        rls_eligible: true,
        idx_display_yn: gates.idx_display_yn,
        internet_entire_listing_display_yn: gates.internet_entire_listing_display_yn,
        internet_address_display_yn: gates.internet_address_display_yn,
        internet_automated_valuation_display_yn: gates.internet_automated_valuation_display_yn,
        internet_consumer_comment_yn: gates.internet_consumer_comment_yn,
        participant_only: input.participant_only === true,
        owner_opt_out: input.owner_opt_out === true,
        ...computeTerminalSincePatch({ previousStatus: undefined, newStatus: gates.normalized_status, raw_data: {}, features: {} }),
        ...typedAgentColumnsFromJson(agentInfoJson),
        media: (input.images as Prisma.InputJsonValue) ?? ([] as Prisma.InputJsonValue),
        features: {} as Prisma.InputJsonValue,
        compliance: {} as Prisma.InputJsonValue,
        // Trestle cursor safety: NOT a sync writer; last_synced_from_trestle stays NULL.
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
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      const raced = await prisma.listing.findUnique({ where: { listing_id: trimmedId }, select: { id: true, listing_id: true } });
      if (raced) return { id: raced.id, listing_id: raced.listing_id, created: false };
    }
    throw err;
  }
}
