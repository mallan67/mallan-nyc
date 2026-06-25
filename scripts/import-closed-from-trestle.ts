/**
 * Import closed listings from Trestle into the local DB.
 *
 * Fetches ALL closed listings for Maya Allan (by name) + all agents
 * at MAllan Real Estate Inc (by office), deduplicates, and stores
 * with proper Trestle field mapping.
 *
 * Usage: npx tsx scripts/import-closed-from-trestle.ts
 *
 * Idempotent — skips listings that already exist in DB.
 */
import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(".env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import { getAccessToken } from "../lib/idx/auth";
import { dualWriteProjectionForListingId } from "../lib/search/listing-search-projection";
import { typedAgentColumnsFromJson } from "../lib/listings/agent-info-typed-columns";
import { deriveTerminalSince } from "../lib/listings/terminal-since";

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════
// TRESTLE FIELD SELECTION
// All fields needed for a complete closed-listing record.
// Uses REBNY RLS field names (Trestle canonical names).
// ═══════════════════════════════════════════════════════════
// Use only fields validated on the IDX Plus feed.
// We import trestle-mapper's IDX_PLUS_SELECT_FIELDS and add back a few
// closed-listing-specific fields that may not be on the live IDX feed
// but ARE returned for closed records.
const SELECT_FIELDS = [
  // B1: Address
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
  "StreetSuffix", "UnitNumber", "City", "CityRegion", "SubdivisionName", "PostalCity",
  "PostalCode", "StateOrProvince", "CountyOrParish",
  "CrossStreet", "Latitude", "Longitude",
  "BuildingName",

  // B2: Classification — ListingKey needed for Media.ResourceRecordKey (Trestle guidance 2026-04-07)
  "ListingId", "ListingKey", "ListingKeyNumeric", "SourceSystemKey",
  "PropertyType", "PropertySubType", "CommonInterest",
  "OwnershipType", "StructureType",
  "StoriesTotal",

  // B4: Status & Dates
  "StandardStatus", "ModificationTimestamp",
  "OnMarketDate", "CloseDate", "ClosePrice",
  "DaysOnMarket", "CumulativeDaysOnMarket",
  "OriginalListPrice", "PreviousListPrice", "ListPrice",
  "ListingContractDate", "PurchaseContractDate",

  // B5: Pricing
  "LeaseAmount", "LeaseAmountFrequency",

  // B7: Listing Agent
  "ListAgentFullName", "ListAgentFirstName", "ListAgentLastName",
  "ListAgentEmail", "ListAgentDirectPhone", "ListAgentMlsId",
  "ListAgentStateLicense",

  // B8: List Office
  "ListOfficeName", "ListOfficeMlsId", "ListOfficePhone",

  // B9: Buyer Agent
  "BuyerAgentFullName", "BuyerAgentMlsId",
  "BuyerOfficeName", "BuyerOfficeMlsId",

  // B10: Property Details
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf",
  "LivingArea", "LotSizeArea", "YearBuilt",

  // B11: Interior
  "Flooring", "LaundryFeatures", "FireplaceYN",

  // B13: Building
  "BuildingKeyNumeric",

  // B15: Views
  "View", "ViewYN",

  // B17: Tax & HOA
  "AssociationFee", "AssociationFeeFrequency",
  "TaxAnnualAmount", "TaxYear",

  // B18: Remarks
  "PublicRemarks",
].join(",");

/**
 * Phase A: build the agent_info JSON for a closed-import row, INCLUDING the
 * selected ListAgentEmail / ListAgentDirectPhone (previously dropped from the
 * write). CoList* are NOT selected by this import, so they are absent (→ null
 * typed columns). The typed-column dual-write derives from this same object.
 */
function closedAgentInfo(r: Record<string, unknown>): Record<string, unknown> {
  const s = (v: unknown) => (v != null && String(v).trim().length ? String(v) : null);
  return {
    ListAgentFullName: String(r.ListAgentFullName || ""),
    ListAgentEmail: s(r.ListAgentEmail),
    ListAgentDirectPhone: s(r.ListAgentDirectPhone),
    ListAgentMlsId: s(r.ListAgentMlsId),
    ListAgentStateLicense: s(r.ListAgentStateLicense),
    ListOfficeName: String(r.ListOfficeName || ""),
    ListOfficeMlsId: s(r.ListOfficeMlsId),
  };
}

async function main() {
  const token = await getAccessToken();
  const TRESTLE_API =
    process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";

  // ── Look up all agents in DB ──
  const agents = await prisma.agent.findMany({
    select: { id: true, full_name: true, email: true, trestle_mls_id: true },
  });
  if (agents.length === 0) throw new Error("No agents found in DB");

  const agentByName = new Map(
    agents.map((a) => [a.full_name?.toLowerCase() || "", a])
  );
  const defaultAgent = agents.find((a) => a.email === "maya@mallan.nyc") || agents[0];

  // ── Fetch from Trestle ──
  // Two queries: by agent name (Maya Allan) + by office (catches all agents)
  const allRecords = new Map<string, Record<string, unknown>>();

  // Query 1: By agent name
  await fetchTrestle(
    token,
    TRESTLE_API,
    `ListAgentFullName eq 'Maya Allan' and StandardStatus eq 'Closed'`,
    allRecords
  );

  // Query 2: By office name (catches Leda, Julia, any future agents)
  await fetchTrestle(
    token,
    TRESTLE_API,
    `contains(ListOfficeName,'Mallan') and StandardStatus eq 'Closed'`,
    allRecords
  );

  console.log(`\nTotal unique closed listings from Trestle: ${allRecords.size}`);

  // ── Fetch photos for all listings ──
  // Trestle guidance (2026-04-07): use ResourceRecordKey (always unique), not ResourceRecordID.
  // Build listingKey → listingId map for the photo fetch.
  console.log("Fetching photos...");
  const idToKeyMap = new Map<string, string>();
  for (const [listingId, r] of allRecords) {
    const listingKey = String(r.ListingKey || r.SourceSystemKey || "");
    if (listingKey) idToKeyMap.set(listingId, listingKey);
  }
  const listingIds = Array.from(allRecords.keys());
  const photoMap = await fetchPhotos(token, TRESTLE_API, listingIds, idToKeyMap);

  // ── Import into DB ──
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const [listingId, r] of allRecords) {
    // Skip if already exists
    const existing = await prisma.listing.findUnique({
      where: { listing_id: listingId },
    });
    if (existing) {
      skipped++;
      continue;
    }

    try {
      // ── Resolve agent ──
      const agentName = String(r.ListAgentFullName || "").toLowerCase();
      const agent = agentByName.get(agentName) || defaultAgent;

      // ── Listing type: rental vs sale ──
      const propType = String(r.PropertyType || "");
      const isRental =
        propType.toLowerCase().includes("lease") ||
        propType === "ResidentialLease" ||
        (r.LeaseAmount != null && Number(r.LeaseAmount) > 0) ||
        (r.ClosePrice != null && Number(r.ClosePrice) <= 15000 && Number(r.ClosePrice) > 0) ||
        (r.ListPrice != null && Number(r.ListPrice) <= 15000 && Number(r.ListPrice) > 0);

      // ── Property type mapping ──
      const ci = String(r.CommonInterest || "");
      let propertyType = r.PropertySubType ? String(r.PropertySubType) : "Residential";
      if (ci === "Condominium") propertyType = "Condominium";
      else if (ci === "StockCooperative") propertyType = "Cooperative";
      else if (ci === "Condop") propertyType = "Condop";

      // ── Full address construction ──
      const streetNumber = String(r.StreetNumber || "").trim();
      const streetDirPrefix = String(r.StreetDirPrefix || "").trim();
      const streetName = String(r.StreetName || "").trim();
      const streetSuffix = String(r.StreetSuffix || "").trim();
      const streetDirSuffix = String(r.StreetDirSuffix || "").trim();
      const unitNumber = r.UnitNumber ? String(r.UnitNumber).trim() : null;
      const city = String(r.City || "New York").trim();
      const postalCode = String(r.PostalCode || "").trim();
      const stateOrProvince = String(r.StateOrProvince || "NY").trim();
      // UnparsedAddress may not be available on IDX Plus feed for closed listings
      // Build it from components instead
      const unparsedAddress: string | null = null;

      // Build human-readable street from components
      const streetParts = [streetNumber, streetDirPrefix, streetName, streetSuffix, streetDirSuffix]
        .filter(Boolean)
        .join(" ");
      // Full display address: "425 EAST PARK AVENUE, #4D"
      const street = unparsedAddress || streetParts || "Address Unavailable";

      // ── Borough from CountyOrParish ──
      const county = String(r.CountyOrParish || "").toLowerCase();
      let borough = "Manhattan";
      if (county.includes("kings") || county.includes("brooklyn")) borough = "Brooklyn";
      else if (county.includes("queens")) borough = "Queens";
      else if (county.includes("bronx")) borough = "Bronx";
      else if (county.includes("richmond") || county.includes("staten")) borough = "Staten Island";

      // ── Neighborhood from SubdivisionName (the REBNY RLS neighborhood field) ──
      // CityRegion = borough (Manhattan/Brooklyn/etc.), SubdivisionName = real neighborhood
      const neighborhood = r.SubdivisionName ? String(r.SubdivisionName).trim() : null;

      // ── Photos ──
      const photos = photoMap.get(listingId) || [];

      // ── Price: prefer ClosePrice, fall back to ListPrice ──
      const closePrice = r.ClosePrice != null ? Number(r.ClosePrice) : null;
      const listPrice = r.ListPrice != null ? Number(r.ListPrice) : 0;
      const price = closePrice ?? listPrice;

      // ── Create listing record ──
      await prisma.listing.create({
        data: {
          listing_id: listingId,
          mls_id: listingId, // Mark as Trestle-sourced
          agent_id: agent.id,
          status: "Closed",
          listing_type: isRental ? "rent" : "sale",
          property_type: propertyType,
          property_sub_type: r.PropertySubType ? String(r.PropertySubType) : null,
          list_price: price,
          bedrooms_total: r.BedroomsTotal != null ? Number(r.BedroomsTotal) : null,
          bathrooms_full: r.BathroomsFull != null ? Number(r.BathroomsFull) : null,
          bathrooms_half: r.BathroomsHalf != null ? Number(r.BathroomsHalf) : null,
          living_area: r.LivingArea ? Number(r.LivingArea) : null,
          borough,
          neighborhood,
          city,
          postal_code: postalCode,
          address: {
            // All Trestle address components (for _resolveAddress in CRM JS)
            street: street + (unitNumber ? `, #${unitNumber}` : ""),
            StreetNumber: streetNumber || null,
            StreetDirPrefix: streetDirPrefix || null,
            StreetName: streetName || null,
            StreetSuffix: streetSuffix || null,
            StreetDirSuffix: streetDirSuffix || null,
            UnitNumber: unitNumber,
            UnparsedAddress: unparsedAddress,
            City: city,
            StateOrProvince: stateOrProvince,
            PostalCode: postalCode,
            Borough: borough,
            CrossStreet: r.CrossStreet ? String(r.CrossStreet) : null,
            BuildingName: r.BuildingName ? String(r.BuildingName) : null,
            Latitude: r.Latitude != null ? Number(r.Latitude) : null,
            Longitude: r.Longitude != null ? Number(r.Longitude) : null,
          },
          features: {
            // Status & dates
            ClosePrice: closePrice,
            CloseDate: r.CloseDate || null,
            OriginalListPrice: r.OriginalListPrice != null ? Number(r.OriginalListPrice) : null,
            PreviousListPrice: r.PreviousListPrice != null ? Number(r.PreviousListPrice) : null,
            ListingContractDate: r.ListingContractDate || null,
            PurchaseContractDate: r.PurchaseContractDate || null,
            OnMarketDate: r.OnMarketDate || null,
            DaysOnMarket: r.DaysOnMarket != null ? Number(r.DaysOnMarket) : null,
            CumulativeDaysOnMarket: r.CumulativeDaysOnMarket != null ? Number(r.CumulativeDaysOnMarket) : null,

            // Classification
            CommonInterest: r.CommonInterest || null,
            OwnershipType: r.OwnershipType || null,
            StructureType: r.StructureType || null,
            NewConstructionYN: r.NewConstructionYN || null,
            StoriesTotal: r.StoriesTotal != null ? Number(r.StoriesTotal) : null,

            // Building & property
            YearBuilt: r.YearBuilt != null ? Number(r.YearBuilt) : null,
            LotSizeArea: r.LotSizeArea != null ? Number(r.LotSizeArea) : null,
            BuildingKeyNumeric: r.BuildingKeyNumeric != null ? Number(r.BuildingKeyNumeric) : null,

            // Interior & amenities
            Flooring: r.Flooring || null,
            LaundryFeatures: r.LaundryFeatures || null,
            FireplaceYN: r.FireplaceYN || null,
            View: r.View || null,
            ViewYN: r.ViewYN || null,

            // Financial
            AssociationFee: r.AssociationFee != null ? Number(r.AssociationFee) : null,
            AssociationFeeFrequency: r.AssociationFeeFrequency || null,
            TaxAnnualAmount: r.TaxAnnualAmount != null ? Number(r.TaxAnnualAmount) : null,
            TaxYear: r.TaxYear != null ? Number(r.TaxYear) : null,

            // Remarks
            PublicRemarks: r.PublicRemarks || null,

            // Buyer side (for deals where we represented buyer)
            BuyerAgentFullName: r.BuyerAgentFullName || null,
            BuyerAgentMlsId: r.BuyerAgentMlsId || null,
            BuyerOfficeName: r.BuyerOfficeName || null,
            BuyerOfficeMlsId: r.BuyerOfficeMlsId || null,

            // Rental-specific (if present)
            LeaseAmount: r.LeaseAmount != null ? Number(r.LeaseAmount) : null,
            LeaseAmountFrequency: r.LeaseAmountFrequency || null,

            // Lot
            LotSizeArea: r.LotSizeArea != null ? Number(r.LotSizeArea) : null,
          },
          media: photos,
          // Phase C: agent_info JSON is no longer persisted. Write only the 8 typed
          // agent columns, derived in-memory from the same closedAgentInfo(r) object.
          ...typedAgentColumnsFromJson(closedAgentInfo(r)),

          // Closed listings: distribution gates set correctly
          idx_display_yn: true,
          internet_entire_listing_display_yn: true,
          internet_address_display_yn: true,
          owner_opt_out: false,
          participant_only: false,

          modification_timestamp: r.ModificationTimestamp
            ? new Date(String(r.ModificationTimestamp))
            : new Date(),
          listing_contract_date: r.ListingContractDate
            ? new Date(String(r.ListingContractDate))
            : null,
          // Archive eligibility clock (#415): closed imports are terminal on create.
          // Derive the stable terminal-age date from the CloseDate stored in features
          // (sanity-windowed); fall back to now if absent/invalid.
          terminal_since:
            deriveTerminalSince({ status: "Closed", features: { CloseDate: r.CloseDate ?? null } }) ??
            new Date(),
        },
      });

      // H1 Tier-1 dual-write — projection upsert via canonical builder.
      // Failure is non-fatal so the import loop continues across the full
      // closed-listing batch; ops:projection-backfill heals on next run.
      try {
        await dualWriteProjectionForListingId(prisma, listingId);
      } catch (projErr) {
        console.error(
          `  ! ${listingId} projection dual-write failed:`,
          projErr instanceof Error ? projErr.message : projErr,
        );
      }

      const displayAddr = street + (unitNumber ? ` #${unitNumber}` : "");
      const displayPrice = price
        ? `$${price.toLocaleString()}`
        : "no price";
      console.log(
        `  + ${listingId} | ${displayAddr} | ${displayPrice} | ${isRental ? "rental" : "sale"} | ${propertyType} | ${neighborhood || borough} | ${photos.length} photos`
      );
      created++;
    } catch (err) {
      console.error(`  ERROR ${listingId}:`, err);
      errors++;
    }
  }

  console.log(
    `\nDone: ${created} created, ${skipped} skipped, ${errors} errors`
  );

  // Verify
  const totalInDb = await prisma.listing.count();
  console.log(`Total listings in DB: ${totalInDb}`);
}

// ═══════════════════════════════════════════════════════════
// Fetch listings from Trestle (with pagination)
// ═══════════════════════════════════════════════════════════
async function fetchTrestle(
  token: string,
  apiUrl: string,
  filter: string,
  records: Map<string, Record<string, unknown>>
): Promise<void> {
  console.log(`Fetching: ${filter}`);

  const params = new URLSearchParams();
  params.set("$filter", filter);
  params.set("$select", SELECT_FIELDS);
  params.set("$top", "200");
  params.set("$orderby", "CloseDate desc");
  params.set("$count", "true");

  let url: string | null = `${apiUrl}/odata/Property?${params.toString()}`;
  let total = 0;

  while (url) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`  Trestle API error: ${resp.status} ${text.substring(0, 200)}`);
      break;
    }

    const data = await resp.json();
    const count = data["@odata.count"] ?? 0;
    if (count > 0) total = count;

    for (const r of data.value || []) {
      const id = String(r.ListingId || "");
      if (id && !records.has(id)) {
        records.set(id, r);
      }
    }

    url = data["@odata.nextLink"] || null;
  }

  console.log(`  Found ${total} listings (${records.size} unique so far)`);
}

// ═══════════════════════════════════════════════════════════
// Fetch photos from Trestle Media endpoint
// ═══════════════════════════════════════════════════════════
// Trestle guidance (2026-04-07): use ResourceRecordKey (always unique across MLOs),
// NOT ResourceRecordID (can duplicate). idToKeyMap maps ListingId → ListingKey.
async function fetchPhotos(
  token: string,
  apiUrl: string,
  listingIds: string[],
  idToKeyMap?: Map<string, string>
): Promise<
  Map<string, { MediaURL: string; MediaType: string; Order: number }[]>
> {
  const map = new Map<
    string,
    { MediaURL: string; MediaType: string; Order: number }[]
  >();
  if (listingIds.length === 0) return map;

  // Batch in groups of 20 to avoid URL length limits
  const batches: string[][] = [];
  for (let i = 0; i < listingIds.length; i += 20) {
    batches.push(listingIds.slice(i, i + 20));
  }

  let totalPhotos = 0;
  for (const batch of batches) {
    try {
      // Build key→id mapping for this batch
      const keyToId = new Map<string, string>();
      const filterParts: string[] = [];
      for (const id of batch) {
        const key = idToKeyMap?.get(id);
        if (key) {
          filterParts.push(`ResourceRecordKey eq '${key.replace(/'/g, "''")}'`);
          keyToId.set(key, id);
        } else {
          filterParts.push(`ResourceRecordID eq '${id.replace(/'/g, "''")}'`);
          keyToId.set(id, id);
        }
      }
      // Get top 8 photos per listing (sorted by Order)
      const mediaFilter = `(${filterParts.join(" or ")})`;
      const params = new URLSearchParams();
      params.set("$filter", mediaFilter);
      params.set(
        "$select",
        "ResourceRecordKey,ResourceRecordID,MediaURL,MediaType,MediaCategory,Order,PreferredPhotoYN,ShortDescription"
      );
      params.set("$orderby", "Order asc");
      params.set("$top", String(batch.length * 8));

      const resp = await fetch(
        `${apiUrl}/odata/Media?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      if (!resp.ok) continue;

      const data = await resp.json();
      for (const m of data.value || []) {
        // Prefer ResourceRecordKey (unique), fall back to ResourceRecordID
        const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || "");
        if (!mkey || !m.MediaURL) continue;
        // Convert key back to listing ID for the result map
        const lid = keyToId.get(mkey) || mkey;
        // Skip floor plans, virtual tours, etc. — photos only
        const cat = String(m.MediaCategory || "").toLowerCase();
        if (cat.includes("floor plan") || cat.includes("virtual tour")) continue;

        if (!map.has(lid)) map.set(lid, []);
        map.get(lid)!.push({
          MediaURL: String(m.MediaURL),
          MediaType: String(m.MediaCategory || m.MediaType || "Photo"),
          Order: Number(m.Order ?? 0),
        });
        totalPhotos++;
      }
    } catch {
      // Non-fatal — some batches may fail
    }
  }

  console.log(
    `  Fetched ${totalPhotos} photos across ${map.size}/${listingIds.length} listings`
  );
  return map;
}

main()
  .catch((e) => {
    console.error("Import failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
