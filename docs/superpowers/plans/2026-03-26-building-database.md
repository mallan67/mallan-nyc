# Building Database — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Building table in PostgreSQL that persists building data forever, silently populates from Trestle during normal operations, stores all amenities/features/floor plans, and includes manual-only fields (management company, super, board). NYC-specific: no HOA — maintenance for co-ops, common charges for condos.

**Architecture:** Building model in Prisma keyed by `building_key` (Trestle `BuildingKeyNumeric`). Silent upsert in `/api/buildings` and `/api/idx/search`. Floor plans stored per unit via `BuildingUnit` child model. Tracker bar updated to show building count from DB. Existing `extractBuildingInfo()` reused for mapping.

**Tech Stack:** Prisma (PostgreSQL), Next.js 16 API routes, existing `fetchFromTrestle()` + `extractBuildingInfo()`.

---

## What Exists (DO NOT REBUILD)

| Component | File | Status |
|-----------|------|--------|
| `extractBuildingInfo()` | `app/api/buildings/route.ts:99-196` | Works — parses 30+ fields from Trestle records |
| `formatAmenities()` | `app/api/buildings/route.ts:201-298` | Works — whitelist-based amenity categorization |
| `BUILDING_SELECT` fields | `app/api/buildings/route.ts:65-95` | 40+ Trestle $select fields |
| Building search API | `app/api/buildings/search/route.ts` | Works — free-text search |
| Building profile API | `app/api/buildings/route.ts` | Works — full building data from Trestle |
| Floor plan detection | `app/listing/[id]/page.tsx:890` | Works — `MediaCategory = FloorPlan` |
| Listing `building_name` | `prisma/schema.prisma:945` | Exists but no FK to building |
| RLS tracker | `public/crm/js/init/init-tracker.js` | Works — sale/rental counts |

---

## File Structure

| File | Purpose |
|------|---------|
| **Create:** `prisma/schema.prisma` (add models) | `Building` + `BuildingUnit` models |
| **Create:** `lib/buildings/upsert.ts` | Silent upsert logic — shared by all callers |
| **Modify:** `app/api/buildings/route.ts` | Add upsert after Trestle fetch |
| **Modify:** `app/api/idx/search/route.ts` | Add lightweight upsert from search results |
| **Create:** `app/api/crm/buildings/route.ts` | CRM CRUD: list/search local DB, edit manual fields |
| **Create:** `app/api/crm/buildings/[id]/route.ts` | GET single building, PATCH manual fields |
| **Modify:** `public/crm/js/init/init-tracker.js` | Add building count |
| **Create:** `lib/buildings/__tests__/upsert.test.ts` | Tests for NYC mapping logic |

---

## Phase 1: Schema

### Task 1: Add Building + BuildingUnit models

**Files:** `prisma/schema.prisma`

- [ ] Add `Building` model after `ListingView` (~line 625):

```prisma
// ═══════════════════════════════════════════════════════════
// BUILDING — Standalone building database (persists forever)
// Populated silently from Trestle. Manual fields for management/board.
// ═══════════════════════════════════════════════════════════
model Building {
  id              BigInt   @id @default(autoincrement())
  building_key    Int      @unique @map("building_key") // Trestle BuildingKeyNumeric
  name            String?  @map("name")
  // Address
  street_number   String?  @map("street_number")
  street_name     String?  @map("street_name")
  street_dir      String?  @map("street_dir") // E, W, N, S
  street_suffix   String?  @map("street_suffix") // Street, Avenue, etc.
  neighborhood    String?  @map("neighborhood") // SubdivisionName
  borough         String?  @map("borough") // CityRegion
  zip             String?  @map("zip")
  city            String?  @map("city") // PostalCity
  latitude        Decimal? @map("latitude") @db.Decimal(10, 7)
  longitude       Decimal? @map("longitude") @db.Decimal(10, 7)
  // Classification
  ownership_type  String?  @map("ownership_type") // Condo, Co-op (StockCooperative), Condop
  structure_type  String?  @map("structure_type") // HighRise, MidRise, WalkUp, Townhouse, etc.
  // New construction / conversion / development
  new_construction    Boolean? @map("new_construction") // NewConstructionYN
  building_condition  String?  @map("building_condition") // NewConstruction, UnderConstruction, UpdatedRemodeled, etc.
  development_status  String?  @map("development_status") // Proposed, UnderConstruction, Completed, etc.
  construction_materials String? @map("construction_materials") // Brick, Steel, Concrete, etc.
  // Size
  year_built      Int?     @map("year_built")
  stories_total   Int?     @map("stories_total")
  total_units     Int?     @map("total_units") // NumberOfUnitsTotal or NumberOfUnitsInCommunity
  units_leased    Int?     @map("units_leased") // NumberOfUnitsLeased
  units_vacant    Int?     @map("units_vacant") // NumberOfUnitsVacant
  units_mo_to_mo  Int?     @map("units_mo_to_mo") // NumberOfUnitsMoMo
  // Amenities (from BuildingFeatures — 57 possible values)
  building_features   String[] @default([]) @map("building_features")
  // Doorman / lobby / concierge (from AttendanceType)
  attendance_type     String[] @default([]) @map("attendance_type")
  // Security (from SecurityFeatures)
  security_features   String[] @default([]) @map("security_features")
  // Other amenity categories
  community_features      String[] @default([]) @map("community_features")
  association_amenities   String[] @default([]) @map("association_amenities")
  accessibility_features  String[] @default([]) @map("accessibility_features")
  exterior_features       String[] @default([]) @map("exterior_features")
  patio_porch_features    String[] @default([]) @map("patio_porch_features")
  pool_features           String[] @default([]) @map("pool_features")
  spa_features            String[] @default([]) @map("spa_features")
  laundry_features        String[] @default([]) @map("laundry_features")
  parking_features        String[] @default([]) @map("parking_features")
  heating                 String[] @default([]) @map("heating")
  cooling                 String[] @default([]) @map("cooling")
  flooring                String[] @default([]) @map("flooring")
  interior_features       String[] @default([]) @map("interior_features")
  appliances              String[] @default([]) @map("appliances")
  door_features           String[] @default([]) @map("door_features")
  window_features         String[] @default([]) @map("window_features")
  roof                    String[] @default([]) @map("roof")
  // Utilities
  electric                String[] @default([]) @map("electric")
  water_source            String[] @default([]) @map("water_source")
  sewer                   String[] @default([]) @map("sewer")
  utilities               String[] @default([]) @map("utilities")
  // Pets
  pets_allowed            String[] @default([]) @map("pets_allowed")
  // Views & waterfront
  view                    String[] @default([]) @map("view")
  waterfront_features     String[] @default([]) @map("waterfront_features")
  // Green
  green_features          String[] @default([]) @map("green_features")
  // Parking numbers
  garage_spaces   Int?     @map("garage_spaces")
  parking_total   Int?     @map("parking_total")
  carport_spaces  Int?     @map("carport_spaces")
  open_parking    Int?     @map("open_parking")
  garage_yn       Boolean? @map("garage_yn")
  // Financial — NYC terms (NOT "HOA")
  // Co-op: maintenance | Condo: common charges | Both: AssociationFee on Trestle
  maintenance_fee Decimal? @map("maintenance_fee") @db.Decimal(10, 2) // AssociationFee
  maintenance_fee_frequency String? @map("maintenance_fee_frequency") // Monthly, Quarterly, etc.
  maintenance_includes  String[] @default([]) @map("maintenance_includes") // AssociationFeeIncludes
  tax_annual      Decimal? @map("tax_annual") @db.Decimal(12, 2)
  mgmt_expense    Decimal? @map("mgmt_expense") @db.Decimal(10, 2) // ProfessionalManagementExpense
  // Board / Association (Trestle data)
  board_name      String?  @map("board_name") // AssociationName
  board_phone     String?  @map("board_phone") // AssociationPhone
  board_name_2    String?  @map("board_name_2") // AssociationName2
  board_phone_2   String?  @map("board_phone_2") // AssociationPhone2
  // Walk score
  walk_score      Int?     @map("walk_score")
  // ── Manual-entry fields (NOT from Trestle) ──
  management_company  String?  @map("management_company")
  management_phone    String?  @map("management_phone")
  management_email    String?  @map("management_email")
  super_name          String?  @map("super_name")
  super_phone         String?  @map("super_phone")
  super_live_in       Boolean? @map("super_live_in")
  porter_name         String?  @map("porter_name")
  porter_phone        String?  @map("porter_phone")
  board_approval_required Boolean? @map("board_approval_required")
  board_notes         String?  @db.Text @map("board_notes")
  agent_notes         String?  @db.Text @map("agent_notes") // Your private notes
  custom_tags         String[] @default([]) @map("custom_tags") // Freeform tags
  // Tracking
  first_seen_at       DateTime @default(now()) @map("first_seen_at")
  last_synced_at      DateTime @default(now()) @map("last_synced_at")
  active_listing_count Int    @default(0) @map("active_listing_count")
  total_listing_count  Int    @default(0) @map("total_listing_count")
  // Relations
  units BuildingUnit[]
  @@index([borough])
  @@index([neighborhood])
  @@index([zip])
  @@index([name])
  @@index([new_construction])
  @@map("buildings")
}

model BuildingUnit {
  id             BigInt   @id @default(autoincrement())
  building_id    BigInt   @map("building_id")
  unit_number    String   @map("unit_number")
  listing_id     String?  @map("listing_id") // Trestle ListingId (if from IDX)
  // Unit details (from the listing)
  bedrooms       Int?
  bathrooms_full Int?     @map("bathrooms_full")
  bathrooms_half Int?     @map("bathrooms_half")
  living_area    Int?     @map("living_area") // sqft
  floor_number   Int?     @map("floor_number")
  // Floor plan
  floor_plan_url String?  @map("floor_plan_url") // MediaCategory=FloorPlan URL (proxied)
  // Status snapshot
  status         String?  // Active, Closed, etc.
  list_price     Decimal? @map("list_price") @db.Decimal(14, 2)
  close_price    Decimal? @map("close_price") @db.Decimal(14, 2)
  close_date     DateTime? @map("close_date")
  last_synced_at DateTime @default(now()) @map("last_synced_at")
  building Building @relation(fields: [building_id], references: [id], onDelete: Cascade)
  @@unique([building_id, unit_number])
  @@index([building_id])
  @@index([listing_id])
  @@map("building_units")
}
```

- [ ] Run: `npx prisma validate` — expected: "The schema is valid"
- [ ] Run: `npx prisma generate`
- [ ] Commit: `feat(schema): add Building + BuildingUnit models`

---

## Phase 2: Upsert Library

### Task 2: Create building upsert logic

**Files:** Create `lib/buildings/upsert.ts`

This is the shared function called by both the buildings API and the search API. It takes Trestle records grouped by building key and upserts into the Building + BuildingUnit tables.

- [ ] Create `lib/buildings/upsert.ts`:

```typescript
/**
 * Silent building upsert — called from /api/buildings and /api/idx/search.
 * Takes Trestle records and upserts Building + BuildingUnit rows.
 * Never throws — logs errors and continues.
 */

import prisma from "@/lib/prisma";

interface TrestleRecord {
  [key: string]: unknown;
  Media?: Array<{
    MediaURL?: string;
    MediaCategory?: string;
    Order?: number;
  }>;
}

/** Parse comma-separated Trestle value list into string array */
function parseList(raw: unknown): string[] {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.toLowerCase() !== "none");
}

/** Map Trestle CommonInterest to NYC display term */
function mapOwnershipType(raw: unknown): string | null {
  const val = String(raw || "");
  if (val === "StockCooperative") return "Co-op";
  if (val === "Condominium") return "Condo";
  if (val === "Condop") return "Condop";
  if (val) return val;
  return null;
}

/**
 * Upsert a building from a set of Trestle listing records.
 * All records should share the same BuildingKeyNumeric.
 * Extracts the richest data across all records for each field.
 */
export async function upsertBuildingFromRecords(
  buildingKey: number,
  records: TrestleRecord[]
): Promise<void> {
  if (!buildingKey || records.length === 0) return;

  try {
    // Find richest value across all records for each field
    const first = <T>(field: string): T | null => {
      for (const r of records) {
        if (r[field] != null && r[field] !== "") return r[field] as T;
      }
      return null;
    };

    const firstList = (field: string): string[] => {
      for (const r of records) {
        const parsed = parseList(r[field]);
        if (parsed.length > 0) return parsed;
      }
      return [];
    };

    // Green features: merge multiple source fields
    let greenFeatures: string[] = [];
    for (const r of records) {
      const green = [
        ...parseList(r.GreenBuildingVerificationType),
        ...parseList(r.GreenEnergyEfficient),
      ];
      if (green.length > 0) { greenFeatures = green; break; }
    }

    // Count active listings
    let activeCount = 0;
    for (const r of records) {
      const st = String(r.StandardStatus || r.MlsStatus || "");
      if (["Active", "ComingSoon", "ActiveUnderContract"].includes(st)) activeCount++;
    }

    // Address from first record
    const addr = records[0];

    const data = {
      name: first<string>("BuildingName") || null,
      street_number: addr.StreetNumber ? String(addr.StreetNumber) : null,
      street_name: addr.StreetName ? String(addr.StreetName) : null,
      street_dir: addr.StreetDirPrefix ? String(addr.StreetDirPrefix) : null,
      street_suffix: addr.StreetSuffix ? String(addr.StreetSuffix) : null,
      neighborhood: first<string>("SubdivisionName") || null,
      borough: first<string>("CityRegion") || null,
      zip: first<string>("PostalCode") || null,
      city: first<string>("PostalCity") || first<string>("City") || null,
      latitude: addr.Latitude != null ? Number(addr.Latitude) : null,
      longitude: addr.Longitude != null ? Number(addr.Longitude) : null,
      // Classification
      ownership_type: mapOwnershipType(first("CommonInterest") || first("OwnershipType")),
      structure_type: first<string>("StructureType") || null,
      new_construction: first<boolean>("NewConstructionYN") ?? null,
      building_condition: first<string>("BuildingCondition") || null,
      development_status: first<string>("DevelopmentStatus") || null,
      construction_materials: parseList(first("ConstructionMaterials")).join(", ") || null,
      // Size
      year_built: first<number>("YearBuilt") ? Number(first("YearBuilt")) : null,
      stories_total: first<number>("StoriesTotal") ? Number(first("StoriesTotal")) : null,
      total_units: Number(first("NumberOfUnitsInCommunity") || first("NumberOfUnitsTotal") || 0) || null,
      units_leased: first<number>("NumberOfUnitsLeased") ? Number(first("NumberOfUnitsLeased")) : null,
      units_vacant: first<number>("NumberOfUnitsVacant") ? Number(first("NumberOfUnitsVacant")) : null,
      units_mo_to_mo: first<number>("NumberOfUnitsMoMo") ? Number(first("NumberOfUnitsMoMo")) : null,
      // Amenities (all string arrays from Trestle)
      building_features: firstList("BuildingFeatures"),
      attendance_type: firstList("AttendanceType"),
      security_features: firstList("SecurityFeatures"),
      community_features: firstList("CommunityFeatures"),
      association_amenities: firstList("AssociationAmenities"),
      accessibility_features: firstList("AccessibilityFeatures"),
      exterior_features: firstList("ExteriorFeatures"),
      patio_porch_features: firstList("PatioAndPorchFeatures"),
      pool_features: firstList("PoolFeatures"),
      spa_features: firstList("SpaFeatures"),
      laundry_features: firstList("LaundryFeatures"),
      parking_features: firstList("ParkingFeatures"),
      heating: firstList("Heating"),
      cooling: firstList("Cooling"),
      flooring: firstList("Flooring"),
      interior_features: firstList("InteriorFeatures"),
      appliances: firstList("Appliances"),
      door_features: firstList("DoorFeatures"),
      window_features: firstList("WindowFeatures"),
      roof: firstList("Roof"),
      electric: firstList("Electric"),
      water_source: firstList("WaterSource"),
      sewer: firstList("Sewer"),
      utilities: firstList("Utilities"),
      pets_allowed: firstList("PetsAllowed"),
      view: firstList("View"),
      waterfront_features: firstList("WaterfrontFeatures"),
      green_features: greenFeatures,
      // Parking numbers
      garage_spaces: first<number>("GarageSpaces") ? Number(first("GarageSpaces")) : null,
      parking_total: first<number>("ParkingTotal") ? Number(first("ParkingTotal")) : null,
      carport_spaces: first<number>("CarportSpaces") ? Number(first("CarportSpaces")) : null,
      open_parking: first<number>("OpenParkingSpaces") ? Number(first("OpenParkingSpaces")) : null,
      garage_yn: first<boolean>("GarageYN") ?? null,
      // Financial (NYC: maintenance/common charges, NOT HOA)
      maintenance_fee: first<number>("AssociationFee") ? Number(first("AssociationFee")) : null,
      maintenance_fee_frequency: first<string>("AssociationFeeFrequency") || null,
      maintenance_includes: firstList("AssociationFeeIncludes"),
      tax_annual: first<number>("TaxAnnualAmount") ? Number(first("TaxAnnualAmount")) : null,
      mgmt_expense: first<number>("ProfessionalManagementExpense") ? Number(first("ProfessionalManagementExpense")) : null,
      // Board (from Trestle)
      board_name: first<string>("AssociationName") || null,
      board_phone: first<string>("AssociationPhone") || null,
      board_name_2: first<string>("AssociationName2") || null,
      board_phone_2: first<string>("AssociationPhone2") || null,
      // Walk score
      walk_score: first<number>("WalkScore") ? Number(first("WalkScore")) : null,
      // Tracking
      last_synced_at: new Date(),
      active_listing_count: activeCount,
      total_listing_count: records.length,
    };

    // Upsert building — never overwrite manual-only fields
    await prisma.building.upsert({
      where: { building_key: buildingKey },
      create: { building_key: buildingKey, ...data },
      update: data, // Manual fields not in `data` → preserved
    });

    // Upsert units — each listing = one unit
    for (const r of records) {
      const unit = String(r.UnitNumber || "").trim();
      if (!unit) continue;

      // Find floor plan from Media (MediaCategory = "FloorPlan")
      let floorPlanUrl: string | null = null;
      if (r.Media && Array.isArray(r.Media)) {
        const fp = r.Media.find(
          (m) => String(m.MediaCategory || "").toLowerCase() === "floorplan"
        );
        if (fp?.MediaURL) {
          floorPlanUrl = `/api/media/proxy?url=${encodeURIComponent(String(fp.MediaURL))}`;
        }
      }

      const building = await prisma.building.findUnique({
        where: { building_key: buildingKey },
        select: { id: true },
      });
      if (!building) continue;

      await prisma.buildingUnit.upsert({
        where: {
          building_id_unit_number: {
            building_id: building.id,
            unit_number: unit,
          },
        },
        create: {
          building_id: building.id,
          unit_number: unit,
          listing_id: r.ListingId ? String(r.ListingId) : null,
          bedrooms: r.BedroomsTotal != null ? Number(r.BedroomsTotal) : null,
          bathrooms_full: r.BathroomsFull != null ? Number(r.BathroomsFull) : null,
          bathrooms_half: r.BathroomsHalf != null ? Number(r.BathroomsHalf) : null,
          living_area: r.LivingArea != null ? Number(r.LivingArea) : null,
          floor_number: r.FloorNumber != null ? Number(r.FloorNumber) : null,
          floor_plan_url: floorPlanUrl,
          status: String(r.StandardStatus || r.MlsStatus || ""),
          list_price: r.ListPrice != null ? Number(r.ListPrice) : null,
          close_price: r.ClosePrice != null ? Number(r.ClosePrice) : null,
          close_date: r.CloseDate ? new Date(String(r.CloseDate)) : null,
        },
        update: {
          listing_id: r.ListingId ? String(r.ListingId) : null,
          bedrooms: r.BedroomsTotal != null ? Number(r.BedroomsTotal) : null,
          bathrooms_full: r.BathroomsFull != null ? Number(r.BathroomsFull) : null,
          bathrooms_half: r.BathroomsHalf != null ? Number(r.BathroomsHalf) : null,
          living_area: r.LivingArea != null ? Number(r.LivingArea) : null,
          floor_number: r.FloorNumber != null ? Number(r.FloorNumber) : null,
          floor_plan_url: floorPlanUrl || undefined, // Don't overwrite with null
          status: String(r.StandardStatus || r.MlsStatus || ""),
          list_price: r.ListPrice != null ? Number(r.ListPrice) : null,
          close_price: r.ClosePrice != null ? Number(r.ClosePrice) : null,
          close_date: r.CloseDate ? new Date(String(r.CloseDate)) : null,
          last_synced_at: new Date(),
        },
      });
    }
  } catch (err) {
    // Silent — never break the caller
    console.error(`[Building upsert] key=${buildingKey}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Lightweight upsert from search results (less data than full building lookup).
 * Only updates core fields — doesn't overwrite richer data from full lookups.
 */
export async function upsertBuildingFromSearchResult(
  buildingKey: number,
  record: Record<string, unknown>
): Promise<void> {
  if (!buildingKey) return;
  try {
    const existing = await prisma.building.findUnique({
      where: { building_key: buildingKey },
      select: { id: true, last_synced_at: true },
    });

    // If already synced in the last hour, skip (avoid hammering DB on every search)
    if (existing && existing.last_synced_at > new Date(Date.now() - 3600_000)) return;

    await prisma.building.upsert({
      where: { building_key: buildingKey },
      create: {
        building_key: buildingKey,
        name: record.BuildingName ? String(record.BuildingName) : null,
        neighborhood: record.SubdivisionName ? String(record.SubdivisionName) : null,
        borough: record.CityRegion ? String(record.CityRegion) : null,
        zip: record.PostalCode ? String(record.PostalCode) : null,
        ownership_type: mapOwnershipType(record.CommonInterest || record.OwnershipType),
        year_built: record.YearBuilt ? Number(record.YearBuilt) : null,
        stories_total: record.StoriesTotal ? Number(record.StoriesTotal) : null,
        total_units: record.NumberOfUnitsTotal ? Number(record.NumberOfUnitsTotal) : null,
        new_construction: record.NewConstructionYN != null ? Boolean(record.NewConstructionYN) : null,
        street_number: record.StreetNumber ? String(record.StreetNumber) : null,
        street_name: record.StreetName ? String(record.StreetName) : null,
        street_dir: record.StreetDirPrefix ? String(record.StreetDirPrefix) : null,
        latitude: record.Latitude != null ? Number(record.Latitude) : null,
        longitude: record.Longitude != null ? Number(record.Longitude) : null,
      },
      update: {
        // Only update fields if they're empty (don't overwrite rich data from full lookup)
        ...(existing ? {} : {
          name: record.BuildingName ? String(record.BuildingName) : undefined,
          neighborhood: record.SubdivisionName ? String(record.SubdivisionName) : undefined,
          borough: record.CityRegion ? String(record.CityRegion) : undefined,
        }),
        last_synced_at: new Date(),
      },
    });
  } catch {
    // Silent
  }
}
```

- [ ] Commit: `feat(buildings): add silent upsert library`

---

## Phase 3: Wire Upsert Into Existing APIs

### Task 3: Add upsert to /api/buildings (full building lookup)

**Files:** Modify `app/api/buildings/route.ts`

- [ ] After `extractBuildingInfo()` is called and records are available, add silent upsert. Find the line where `formatAmenities(buildingInfo)` is called and add before the response:

```typescript
import { upsertBuildingFromRecords } from "@/lib/buildings/upsert";

// After Trestle records are fetched and before response:
// Silent upsert — populate building DB without triggering alerts
const bKey = records[0]?.BuildingKeyNumeric;
if (bKey) {
  upsertBuildingFromRecords(Number(bKey), records).catch(() => {});
}
```

- [ ] Commit: `feat(buildings): upsert on building profile lookup`

### Task 4: Add lightweight upsert to /api/idx/search

**Files:** Modify `app/api/idx/search/route.ts`

- [ ] After search results are mapped to listings (the `displayable` loop), add background upsert for each unique building key:

```typescript
import { upsertBuildingFromSearchResult } from "@/lib/buildings/upsert";

// After the displayable loop, fire-and-forget building upserts:
const seenKeys = new Set<number>();
for (const record of result.records) {
  const bk = record.BuildingKeyNumeric;
  if (bk && !seenKeys.has(Number(bk))) {
    seenKeys.add(Number(bk));
    upsertBuildingFromSearchResult(Number(bk), record).catch(() => {});
  }
}
```

- [ ] Commit: `feat(buildings): silent upsert from search results`

---

## Phase 4: CRM Building API

### Task 5: Create CRM building list + search endpoint

**Files:** Create `app/api/crm/buildings/route.ts`

- [ ] GET: list buildings from local DB with filters (borough, neighborhood, ownership_type, new_construction). Supports `?q=` free-text search on name + address.
- [ ] Include count of buildings for tracker.
- [ ] Auth: `requireAgentOrBroker`

### Task 6: Create CRM building detail + edit endpoint

**Files:** Create `app/api/crm/buildings/[id]/route.ts`

- [ ] GET: single building with all units (include floor_plan_url for each unit)
- [ ] PATCH: update manual-only fields (management_company, super_name, agent_notes, custom_tags, etc.)
- [ ] Auth: `requireAgentOrBroker`
- [ ] Audit log the edit

---

## Phase 5: Tracker + Migration

### Task 7: Add building count to RLS tracker

**Files:** Modify `public/crm/js/init/init-tracker.js`

- [ ] Add a third count fetch: `MallanAPI._fetch('/api/crm/buildings?count_only=true')` → display in tracker bar
- [ ] Add `trackerBuildingCount` element to the RLS bar in `index-built.html`

### Task 8: Create and run migration

- [ ] Run: `npx prisma migrate dev --name add_buildings`
- [ ] Verify tables created: `buildings` + `building_units`
- [ ] Commit: `feat(buildings): database migration`

### Task 9: Run validator + smoke test

- [ ] Run: `npm run idx:validate` — expect 0 critical
- [ ] Run: `npm run crm:test` — expect 0 fail
- [ ] Commit any fixes
