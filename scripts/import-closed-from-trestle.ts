/**
 * Import closed listings from Trestle into the local DB.
 * Fetches all closed listings for Maya Allan, creates them as DB records.
 *
 * Usage: npx tsx scripts/import-closed-from-trestle.ts
 */
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve('.env.local'), override: true });

import { PrismaClient } from '@prisma/client';
import { getAccessToken } from '../lib/idx/auth';

const prisma = new PrismaClient();

async function main() {
  const token = await getAccessToken();
  const TRESTLE_API = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

  // Get Maya's agent ID
  const maya = await prisma.agent.findFirst({
    where: { public_slug: 'maya-allan' },
    select: { id: true },
  });
  if (!maya) throw new Error('Maya Allan not found in DB');

  // Fetch all closed listings by agent name
  const filter = `ListAgentFullName eq 'Maya Allan' and StandardStatus eq 'Closed'`;
  const select = [
    'ListingId', 'ListAgentFullName', 'ListOfficeName', 'StandardStatus',
    'CloseDate', 'ClosePrice', 'ListPrice', 'OriginalListPrice',
    'StreetNumber', 'StreetName', 'StreetSuffix', 'UnitNumber',
    'City', 'StateOrProvince', 'PostalCode', 'CountyOrParish',
    'BedroomsTotal', 'BathroomsFull', 'BathroomsHalf',
    'LivingArea', 'LotSizeArea', 'YearBuilt', 'StoriesTotal',
    'PropertyType', 'PropertySubType', 'CommonInterest',
    'PublicRemarks', 'BuildingName',
    'ModificationTimestamp', 'ListingContractDate', 'OnMarketDate',
    'AssociationFee', 'AssociationFeeFrequency',
    'TaxAnnualAmount', 'TaxYear',
  ].join(',');

  const params = new URLSearchParams();
  params.set('$filter', filter);
  params.set('$select', select);
  params.set('$top', '200');
  params.set('$orderby', 'CloseDate desc');

  console.log('Fetching closed listings from Trestle...');
  const resp = await fetch(`${TRESTLE_API}/odata/Property?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`Trestle API error: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  const records = data.value || [];
  console.log(`Found ${records.length} closed listings`);

  // Also fetch photos for all listings
  console.log('Fetching photos...');
  const listingIds = records.map((r: Record<string, unknown>) => String(r.ListingId));
  const photoMap = await fetchPhotos(token, TRESTLE_API, listingIds);

  let created = 0;
  let skipped = 0;

  for (const r of records) {
    const listingId = String(r.ListingId);

    // Skip if already exists
    const existing = await prisma.listing.findUnique({
      where: { listing_id: listingId },
    });
    if (existing) {
      console.log(`  SKIP (exists): ${listingId} - ${r.StreetNumber} ${r.StreetName} ${r.UnitNumber || ''}`);
      skipped++;
      continue;
    }

    // Determine listing type from price and property type
    const isRental = String(r.PropertyType || '').toLowerCase().includes('lease') ||
      (r.ClosePrice && Number(r.ClosePrice) < 15000) ||
      (r.ListPrice && Number(r.ListPrice) < 15000);

    // Map property type
    let propertyType = 'Residential';
    const ci = String(r.CommonInterest || '');
    if (ci === 'Condominium') propertyType = 'Condo';
    else if (ci === 'StockCooperative') propertyType = 'Co-op';
    else if (ci === 'Condop') propertyType = 'Condop';
    else if (r.PropertySubType) propertyType = String(r.PropertySubType);

    // Build address
    const streetNumber = String(r.StreetNumber || '');
    const streetName = String(r.StreetName || '');
    const streetSuffix = String(r.StreetSuffix || '');
    const unitNumber = r.UnitNumber ? String(r.UnitNumber) : null;
    const city = String(r.City || 'New York');
    const postalCode = String(r.PostalCode || '');

    // Determine borough from county
    const county = String(r.CountyOrParish || '').toLowerCase();
    let borough = 'Manhattan';
    if (county.includes('kings')) borough = 'Brooklyn';
    else if (county.includes('queens')) borough = 'Queens';
    else if (county.includes('bronx')) borough = 'Bronx';
    else if (county.includes('richmond')) borough = 'Staten Island';

    const photos = photoMap.get(listingId) || [];

    await prisma.listing.create({
      data: {
        listing_id: listingId,
        agent_id: maya.id,
        status: 'Closed',
        listing_type: isRental ? 'rent' : 'sale',
        property_type: propertyType,
        property_sub_type: r.PropertySubType ? String(r.PropertySubType) : null,
        list_price: Number(r.ListPrice || r.ClosePrice || 0),
        bedrooms_total: r.BedroomsTotal != null ? Number(r.BedroomsTotal) : null,
        bathrooms_full: r.BathroomsFull != null ? Number(r.BathroomsFull) : null,
        bathrooms_half: r.BathroomsHalf != null ? Number(r.BathroomsHalf) : null,
        living_area: r.LivingArea ? Number(r.LivingArea) : null,
        borough,
        neighborhood: null,
        city,
        postal_code: postalCode,
        address: {
          StreetNumber: streetNumber,
          StreetName: streetName,
          StreetSuffix: streetSuffix,
          UnitNumber: unitNumber,
          City: city,
          StateOrProvince: String(r.StateOrProvince || 'NY'),
          PostalCode: postalCode,
          Borough: borough,
        },
        features: {
          YearBuilt: r.YearBuilt || null,
          StoriesTotal: r.StoriesTotal || null,
          PublicRemarks: r.PublicRemarks || null,
          AssociationFee: r.AssociationFee || null,
          AssociationFeeFrequency: r.AssociationFeeFrequency || null,
          TaxAnnualAmount: r.TaxAnnualAmount || null,
          TaxYear: r.TaxYear || null,
          ClosePrice: r.ClosePrice || null,
          CloseDate: r.CloseDate || null,
          OriginalListPrice: r.OriginalListPrice || null,
          CommonInterest: r.CommonInterest || null,
        },
        media: photos,
        agent_info: {
          ListAgentFullName: String(r.ListAgentFullName || 'Maya Allan'),
          ListOfficeName: String(r.ListOfficeName || 'MAllan Real Estate Inc'),
        },
        // Closed listings — distribution gates don't matter for display
        // but set them correctly for compliance
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        internet_address_display_yn: true,
        owner_opt_out: false,
        participant_only: false,
        modification_timestamp: r.ModificationTimestamp ? new Date(String(r.ModificationTimestamp)) : new Date(),
        listing_contract_date: r.ListingContractDate ? new Date(String(r.ListingContractDate)) : null,
      },
    });

    const closePrice = r.ClosePrice ? `$${Number(r.ClosePrice).toLocaleString()}` : 'no price';
    console.log(`  CREATED: ${streetNumber} ${streetName} ${unitNumber || ''} | ${closePrice} | ${isRental ? 'rental' : 'sale'} | ${propertyType}`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped (already exist)`);
}

async function fetchPhotos(
  token: string,
  apiUrl: string,
  listingIds: string[]
): Promise<Map<string, { MediaURL: string; MediaType: string; Order: number }[]>> {
  const map = new Map<string, { MediaURL: string; MediaType: string; Order: number }[]>();
  if (listingIds.length === 0) return map;

  // Batch in groups of 20 to avoid URL length limits
  const batches: string[][] = [];
  for (let i = 0; i < listingIds.length; i += 20) {
    batches.push(listingIds.slice(i, i + 20));
  }

  for (const batch of batches) {
    try {
      const filterParts = batch.map(id => `ResourceRecordID eq '${id.replace(/'/g, "''")}'`);
      const mediaFilter = `(${filterParts.join(' or ')}) and Order le 3`;
      const params = new URLSearchParams();
      params.set('$filter', mediaFilter);
      params.set('$select', 'ResourceRecordID,MediaURL,MediaType,MediaCategory,Order,PreferredPhotoYN');
      params.set('$orderby', 'ResourceRecordID asc,Order asc');
      params.set('$top', String(batch.length * 4));

      const resp = await fetch(`${apiUrl}/odata/Media?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });

      if (!resp.ok) continue;

      const data = await resp.json();
      for (const m of (data.value || [])) {
        const lid = String(m.ResourceRecordID || '');
        if (!lid || !m.MediaURL) continue;
        const cat = String(m.MediaCategory || '').toLowerCase();
        if (cat.includes('floor plan')) continue;
        if (!map.has(lid)) map.set(lid, []);
        map.get(lid)!.push({
          MediaURL: String(m.MediaURL),
          MediaType: 'Photo',
          Order: Number(m.Order ?? 0),
        });
      }
    } catch {
      // Non-fatal
    }
  }

  return map;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
