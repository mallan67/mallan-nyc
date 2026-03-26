/**
 * lib/buildings/upsert.ts
 *
 * Silent upsert library for Building and BuildingUnit records.
 *
 * - NEVER throws. All errors are caught and logged with console.error.
 * - Called from /api/buildings (full upsert) and /api/idx/search (lightweight upsert).
 * - NYC ownership terminology: Co-op (StockCooperative), Condo (Condominium), Condop.
 */

import prisma from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single Trestle property record (full or partial). */
export type TrestleRecord = Record<string, unknown>;

/** A Trestle Media object as returned in the Media array. */
interface TrestleMedia {
  MediaCategory?: string;
  MediaURL?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the first non-empty string value from a list of candidates. */
function first(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

/** Return the first non-null integer value. */
function firstInt(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (!isNaN(n) && Number.isFinite(n)) return Math.round(n);
  }
  return undefined;
}

/** Return the first non-null decimal value as a string (Prisma Decimal input). */
function firstDecimal(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (!isNaN(n) && Number.isFinite(n)) return String(n);
  }
  return undefined;
}

/** Return the first non-null boolean value. */
function firstBool(...values: unknown[]): boolean | undefined {
  for (const v of values) {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return undefined;
}

/**
 * Convert a Trestle CommonInterest value to NYC ownership terminology.
 * StockCooperative → Co-op, Condominium → Condo, Condop → Condop.
 */
function mapOwnershipType(commonInterest: unknown): string | undefined {
  if (typeof commonInterest !== 'string') return undefined;
  const ci = commonInterest.trim();
  if (ci === 'StockCooperative') return 'Co-op';
  if (ci === 'Condominium') return 'Condo';
  if (ci === 'Condop') return 'Condop';
  if (ci !== '') return ci; // pass through any other value
  return undefined;
}

/**
 * Coerce a value into a string array.
 * Handles arrays of strings and pipe-delimited strings.
 */
function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string' && v.trim() !== '') as string[];
  }
  if (typeof value === 'string' && value.trim() !== '') {
    // Trestle sometimes uses pipe-delimited values
    return value.split('|').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Pick the richest (first non-empty) string array across multiple records.
 * Returns the first record's array that has at least one item.
 */
function richestArray(records: TrestleRecord[], field: string): string[] {
  for (const rec of records) {
    const arr = toStringArray(rec[field]);
    if (arr.length > 0) return arr;
  }
  return [];
}

/**
 * Pick the richest scalar value for a field across multiple records.
 */
function richestStr(records: TrestleRecord[], field: string): string | undefined {
  return first(...records.map((r) => r[field]));
}

function richestInt(records: TrestleRecord[], field: string): number | undefined {
  return firstInt(...records.map((r) => r[field]));
}

function richestDecimal(records: TrestleRecord[], field: string): string | undefined {
  return firstDecimal(...records.map((r) => r[field]));
}

function richestBool(records: TrestleRecord[], field: string): boolean | undefined {
  return firstBool(...records.map((r) => r[field]));
}

/**
 * Extract the floor plan URL from a Trestle Media array.
 * Returns a proxied URL or undefined.
 */
function extractFloorPlanUrl(media: unknown): string | undefined {
  if (!Array.isArray(media)) return undefined;
  const item = (media as TrestleMedia[]).find(
    (m) =>
      typeof m.MediaCategory === 'string' &&
      m.MediaCategory.toLowerCase() === 'floorplan' &&
      typeof m.MediaURL === 'string' &&
      m.MediaURL.trim() !== '',
  );
  if (!item || typeof item.MediaURL !== 'string') return undefined;
  return `/api/media/proxy?url=${encodeURIComponent(item.MediaURL)}`;
}

/**
 * Merge GreenBuildingVerificationType and GreenEnergyEfficient into a single array.
 */
function mergeGreenFeatures(record: TrestleRecord): string[] {
  const set = new Set<string>();
  toStringArray(record['GreenBuildingVerificationType']).forEach((v) => set.add(v));
  toStringArray(record['GreenEnergyEfficient']).forEach((v) => set.add(v));
  return Array.from(set);
}

function mergeGreenFeaturesFromRecords(records: TrestleRecord[]): string[] {
  const set = new Set<string>();
  for (const rec of records) {
    mergeGreenFeatures(rec).forEach((v) => set.add(v));
  }
  return Array.from(set);
}

// ---------------------------------------------------------------------------
// upsertBuildingFromRecords — full upsert from building profile API
// ---------------------------------------------------------------------------

/**
 * Upsert a Building row and its BuildingUnit rows from a set of Trestle records.
 *
 * Scans ALL records to find the richest data for each field (first non-empty wins).
 * Manual-only fields (management_company, super_name, etc.) are never overwritten.
 * BuildingUnit rows are upserted for every record that has a UnitNumber.
 *
 * NEVER throws — catches all errors and logs with console.error.
 */
export async function upsertBuildingFromRecords(
  buildingKey: number,
  records: TrestleRecord[],
): Promise<void> {
  try {
    if (!records || records.length === 0) return;

    // ── Build the richest data object across all records ──────────────────
    const greenFeatures = mergeGreenFeaturesFromRecords(records);

    const buildingData = {
      // Address
      street_number: richestStr(records, 'StreetNumber'),
      street_name: richestStr(records, 'StreetName'),
      street_dir: richestStr(records, 'StreetDirPrefix') ?? richestStr(records, 'StreetDirSuffix'),
      street_suffix: richestStr(records, 'StreetSuffix'),
      neighborhood: richestStr(records, 'SubdivisionName'),
      borough: richestStr(records, 'CityRegion'),
      zip: richestStr(records, 'PostalCode'),
      city: richestStr(records, 'PostalCity') ?? richestStr(records, 'City'),
      latitude: richestDecimal(records, 'Latitude'),
      longitude: richestDecimal(records, 'Longitude'),

      // Classification
      ownership_type: mapOwnershipType(richestStr(records, 'CommonInterest')),
      structure_type: richestStr(records, 'PropertySubType'),

      // New construction / development
      new_construction: richestBool(records, 'NewConstructionYN'),
      building_condition: richestStr(records, 'PropertyCondition'),
      development_status: richestStr(records, 'DevelopmentStatus'),
      construction_materials: richestStr(records, 'ConstructionMaterials'),

      // Size
      year_built: richestInt(records, 'YearBuilt'),
      stories_total: richestInt(records, 'StoriesTotal'),
      total_units:
        richestInt(records, 'NumberOfUnitsTotal') ??
        richestInt(records, 'NumberOfUnitsInCommunity'),
      units_leased: richestInt(records, 'NumberOfUnitsLeased'),
      units_vacant: richestInt(records, 'NumberOfUnitsVacant'),
      units_mo_to_mo: richestInt(records, 'NumberOfUnitsMoMo'),

      // Amenities
      building_features: richestArray(records, 'BuildingFeatures'),
      attendance_type: richestArray(records, 'AttendanceType'),
      security_features: richestArray(records, 'SecurityFeatures'),
      community_features: richestArray(records, 'CommunityFeatures'),
      association_amenities: richestArray(records, 'AssociationAmenities'),
      accessibility_features: richestArray(records, 'AccessibilityFeatures'),
      exterior_features: richestArray(records, 'ExteriorFeatures'),
      patio_porch_features: richestArray(records, 'PatioAndPorchFeatures'),
      pool_features: richestArray(records, 'PoolFeatures'),
      spa_features: richestArray(records, 'SpaFeatures'),
      laundry_features: richestArray(records, 'LaundryFeatures'),
      parking_features: richestArray(records, 'ParkingFeatures'),
      heating: richestArray(records, 'Heating'),
      cooling: richestArray(records, 'Cooling'),
      flooring: richestArray(records, 'Flooring'),
      interior_features: richestArray(records, 'InteriorFeatures'),
      appliances: richestArray(records, 'Appliances'),
      door_features: richestArray(records, 'DoorFeatures'),
      window_features: richestArray(records, 'WindowFeatures'),
      roof: richestArray(records, 'Roof'),

      // Utilities
      electric: richestArray(records, 'Electric'),
      water_source: richestArray(records, 'WaterSource'),
      sewer: richestArray(records, 'Sewer'),
      utilities: richestArray(records, 'Utilities'),

      // Pets
      pets_allowed: richestArray(records, 'PetsAllowed'),

      // Views
      view: richestArray(records, 'View'),
      waterfront_features: richestArray(records, 'WaterfrontFeatures'),

      // Green
      green_features: greenFeatures,

      // Parking numbers
      garage_spaces: richestInt(records, 'GarageSpaces'),
      parking_total: richestInt(records, 'ParkingTotal'),
      carport_spaces: richestInt(records, 'CarportSpaces'),
      open_parking: richestInt(records, 'OpenParkingSpaces'),
      garage_yn: richestBool(records, 'GarageYN'),

      // Financial
      maintenance_fee: richestDecimal(records, 'AssociationFee'),
      maintenance_fee_frequency: richestStr(records, 'AssociationFeeFrequency'),
      maintenance_includes: richestArray(records, 'AssociationFeeIncludes'),
      tax_annual: richestDecimal(records, 'TaxAnnualAmount'),
      mgmt_expense: richestDecimal(records, 'ProfessionalManagementExpense'),

      // Board / Association
      board_name: richestStr(records, 'AssociationName'),
      board_phone: richestStr(records, 'AssociationPhone'),
      board_name_2: richestStr(records, 'AssociationName2'),
      board_phone_2: richestStr(records, 'AssociationPhone2'),

      // Building name (if present on any record)
      name: richestStr(records, 'BuildingName'),

      // Tracking
      last_synced_at: new Date(),
    };

    // Strip undefined values so Prisma doesn't overwrite with null on update
    const cleanData = Object.fromEntries(
      Object.entries(buildingData).filter(([, v]) => v !== undefined),
    );

    // ── Upsert the Building row ───────────────────────────────────────────
    const building = await prisma.building.upsert({
      where: { building_key: buildingKey },
      create: {
        building_key: buildingKey,
        ...cleanData,
      },
      update: {
        // On update: never overwrite manual-only fields.
        // Only update Trestle-sourced fields (everything in cleanData except manual fields).
        ...cleanData,
      },
    });

    // ── Upsert BuildingUnit for each record that has a unit number ────────
    for (const record of records) {
      const unitNumber = first(record['UnitNumber']);
      if (!unitNumber) continue;

      try {
        const floorPlanUrl = extractFloorPlanUrl(record['Media']);
        const listPrice = firstDecimal(record['ListPrice']);
        const closePrice = firstDecimal(record['ClosePrice']);
        const closeDateRaw = record['CloseDate'];
        const closeDate =
          typeof closeDateRaw === 'string' && closeDateRaw.trim() !== ''
            ? new Date(closeDateRaw)
            : undefined;

        const unitData = {
          listing_id: first(record['ListingId']),
          bedrooms: firstInt(record['BedroomsTotal']),
          bathrooms_full: firstInt(record['BathroomsFull']),
          bathrooms_half: firstInt(record['BathroomsHalf']),
          living_area: firstInt(record['LivingArea']),
          floor_number: firstInt(record['FloorNumber']),
          floor_plan_url: floorPlanUrl || undefined,
          status: first(record['StandardStatus']),
          list_price: listPrice,
          close_price: closePrice,
          close_date: closeDate,
          last_synced_at: new Date(),
        };

        const cleanUnitData = Object.fromEntries(
          Object.entries(unitData).filter(([, v]) => v !== undefined),
        );

        await prisma.buildingUnit.upsert({
          where: {
            building_id_unit_number: {
              building_id: building.id,
              unit_number: unitNumber,
            },
          },
          create: {
            building_id: building.id,
            unit_number: unitNumber,
            ...cleanUnitData,
          },
          update: cleanUnitData,
        });
      } catch (unitErr) {
        console.error(
          `[buildings/upsert] Failed to upsert unit ${unitNumber} for building_key=${buildingKey}:`,
          unitErr,
        );
      }
    }
  } catch (err) {
    console.error(
      `[buildings/upsert] upsertBuildingFromRecords failed for building_key=${buildingKey}:`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// upsertBuildingFromSearchResult — lightweight upsert from search results
// ---------------------------------------------------------------------------

/**
 * Lightweight upsert from a search result record (IDX/search, less data).
 *
 * - Skips entirely if the building was synced within the last hour.
 * - On create: sets core fields only (address, ownership type, year built, etc.).
 * - On update: only refreshes last_synced_at (never overwrites rich data).
 *
 * NEVER throws — catches all errors and logs with console.error.
 */
export async function upsertBuildingFromSearchResult(
  buildingKey: number,
  record: Record<string, unknown>,
): Promise<void> {
  try {
    // Check if already synced within the last hour
    const existing = await prisma.building.findUnique({
      where: { building_key: buildingKey },
      select: { id: true, last_synced_at: true },
    });

    if (existing) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (existing.last_synced_at > oneHourAgo) {
        // Synced recently — skip to avoid overwriting rich data unnecessarily
        return;
      }
      // Update only last_synced_at
      await prisma.building.update({
        where: { building_key: buildingKey },
        data: { last_synced_at: new Date() },
      });
      return;
    }

    // Building doesn't exist yet — create with core fields only
    const coreData = {
      street_number: first(record['StreetNumber']),
      street_name: first(record['StreetName']),
      street_dir:
        first(record['StreetDirPrefix']) ?? first(record['StreetDirSuffix']),
      street_suffix: first(record['StreetSuffix']),
      neighborhood: first(record['SubdivisionName']),
      borough: first(record['CityRegion']),
      zip: first(record['PostalCode']),
      city: first(record['PostalCity']) ?? first(record['City']),
      latitude: firstDecimal(record['Latitude']),
      longitude: firstDecimal(record['Longitude']),
      ownership_type: mapOwnershipType(record['CommonInterest']),
      structure_type: first(record['PropertySubType']),
      year_built: firstInt(record['YearBuilt']),
      stories_total: firstInt(record['StoriesTotal']),
      total_units:
        firstInt(record['NumberOfUnitsTotal']) ??
        firstInt(record['NumberOfUnitsInCommunity']),
      new_construction: firstBool(record['NewConstructionYN']),
      name: first(record['BuildingName']),
      last_synced_at: new Date(),
    };

    const cleanCoreData = Object.fromEntries(
      Object.entries(coreData).filter(([, v]) => v !== undefined),
    );

    await prisma.building.create({
      data: {
        building_key: buildingKey,
        ...cleanCoreData,
      },
    });
  } catch (err) {
    console.error(
      `[buildings/upsert] upsertBuildingFromSearchResult failed for building_key=${buildingKey}:`,
      err,
    );
  }
}
