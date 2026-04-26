#!/usr/bin/env tsx
/**
 * Parameterized CMA tool — pull comparable listings for any property.
 *
 * Replaces three earlier ad-hoc one-off scripts (comp-333-e-46th{,-v2,-v3}.ts)
 * that hardcoded one specific property. Any agent can now run a CMA against
 * any property without writing a fresh script.
 *
 * Phase 1: Same building (street_number + street_name match)
 * Phase 2: Comparable nearby listings (neighborhood + sqft window)
 * Phase 3 (optional, --include-rentals): Rental comps for sale/rent ratio
 *
 * Reads from local Neon DB only. No public-facing output. Read-only.
 *
 * USAGE
 *   npx tsx scripts/comps/by-property.ts [options]
 *
 * REQUIRED
 *   --street <text>          Street name to match (e.g. "East 46th Street").
 *                            Used both for same-building (Phase 1) and as a
 *                            sanity filter on Phase 2.
 *   --beds <int>             Bedrooms total
 *
 * OPTIONAL
 *   --street-number <text>   Specific street number for same-building match
 *                            (e.g. "333"). Required for Phase 1; if omitted,
 *                            Phase 1 is skipped.
 *   --sqft <int>             Subject sqft (used as center of window)
 *   --sqft-window <int>      ± sqft tolerance for Phase 2 (default 150)
 *   --neighborhoods <csv>    Neighborhoods to search (comma-separated)
 *   --postal-codes <csv>     Postal codes to search (comma-separated)
 *   --listing-type <type>    "sale" or "rent" (default "sale")
 *   --months-back <int>      Closed listings cutoff in months (default 6)
 *   --exclude-sub-types <csv>  Property sub-types to exclude
 *                              (e.g. "Condominium,Condo" if subject is co-op)
 *   --include-rentals        Also pull rental comps (Phase 3)
 *   --max-active <int>       Max active listings to show (default 15)
 *   --max-closed <int>       Max closed listings to show (default 20)
 *   --json                   Emit machine-readable JSON instead of formatted output
 *
 * EXAMPLES
 *   # The original 333 E 46th case (subject: 1bd ~800sf condop, co-op only)
 *   npx tsx scripts/comps/by-property.ts \
 *     --street "East 46th Street" --street-number 333 \
 *     --beds 1 --sqft 800 --sqft-window 150 \
 *     --neighborhoods "Turtle Bay,Midtown East" --postal-codes 10017 \
 *     --exclude-sub-types Condominium,Condo \
 *     --include-rentals
 *
 *   # 2bd condo in West Village
 *   npx tsx scripts/comps/by-property.ts \
 *     --street "Bleecker Street" \
 *     --beds 2 --sqft 1100 --sqft-window 200 \
 *     --neighborhoods "West Village" --postal-codes 10014
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';

// Self-load .env.local so this works as a standalone CLI tool.
// Mirrors the pattern from scripts/backfill-media-now.ts.
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });

import prisma from '../../lib/prisma';

// ─── Types ──────────────────────────────────────────────────────────────────

type AddrJson = {
  StreetNumber?: string;
  StreetName?: string;
  UnitNumber?: string;
  UnparsedAddress?: string;
};

interface CliArgs {
  street: string;
  streetNumber?: string;
  beds: number;
  sqft?: number;
  sqftWindow: number;
  neighborhoods: string[];
  postalCodes: string[];
  listingType: 'sale' | 'rent';
  monthsBack: number;
  excludeSubTypes: string[];
  includeRentals: boolean;
  maxActive: number;
  maxClosed: number;
  json: boolean;
}

// ─── CLI parsing ────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }

  const required = ['street', 'beds'] as const;
  for (const k of required) {
    if (args[k] === undefined) {
      console.error(`ERROR: missing required argument --${k}`);
      console.error('Run with --help for usage (or read the file header).');
      process.exit(1);
    }
  }

  const listingType = String(args['listing-type'] || 'sale');
  if (listingType !== 'sale' && listingType !== 'rent') {
    console.error(`ERROR: --listing-type must be "sale" or "rent" (got "${listingType}")`);
    process.exit(1);
  }

  const csv = (v: string | boolean | undefined): string[] => {
    if (typeof v !== 'string') return [];
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  return {
    street: String(args.street),
    streetNumber: typeof args['street-number'] === 'string' ? String(args['street-number']) : undefined,
    beds: Number(args.beds),
    sqft: args.sqft !== undefined ? Number(args.sqft) : undefined,
    sqftWindow: Number(args['sqft-window'] || 150),
    neighborhoods: csv(args.neighborhoods),
    postalCodes: csv(args['postal-codes']),
    listingType,
    monthsBack: Number(args['months-back'] || 6),
    excludeSubTypes: csv(args['exclude-sub-types']),
    includeRentals: args['include-rentals'] === true,
    maxActive: Number(args['max-active'] || 15),
    maxClosed: Number(args['max-closed'] || 20),
    json: args.json === true,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ListingRow {
  listing_id: string;
  status: string;
  list_price: unknown;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  living_area: unknown;
  address: unknown;
  days_on_market: number | null;
  neighborhood: string | null;
  property_sub_type: string | null;
  raw_data: unknown;
  features?: unknown;
  modification_timestamp: Date | string;
}

function getClosePrice(l: ListingRow): number | undefined {
  const raw = l.raw_data as Record<string, unknown> | null;
  return raw?.ClosePrice as number | undefined;
}

function getCloseDate(l: ListingRow): string | undefined {
  const raw = l.raw_data as Record<string, unknown> | null;
  return raw?.CloseDate as string | undefined;
}

function effectivePrice(l: ListingRow): number {
  const cp = getClosePrice(l);
  if (l.status === 'Closed' && cp) return Number(cp);
  return Number(l.list_price);
}

function pricePerSqft(l: ListingRow): number | null {
  const sqft = Number(l.living_area);
  if (!sqft) return null;
  return Math.round(effectivePrice(l) / sqft);
}

function fmtAddress(l: ListingRow): string {
  const a = l.address as AddrJson | null;
  const street = `${a?.StreetNumber || '?'} ${a?.StreetName || ''}`.trim();
  const unit = a?.UnitNumber ? ` #${a.UnitNumber}` : '';
  return `${street}${unit}`;
}

function fmtRow(l: ListingRow): string {
  const ppsf = pricePerSqft(l);
  const cd = getCloseDate(l);
  const cp = getClosePrice(l);
  const priceLbl =
    l.status === 'Closed' && cp ? `SOLD $${Number(cp).toLocaleString()}` : `$${Number(l.list_price).toLocaleString()}`;
  return [
    `  ${fmtAddress(l).padEnd(34)}`,
    `${priceLbl.padEnd(22)}`,
    `${l.bedrooms_total ?? '?'}bd/${l.bathrooms_full ?? '?'}ba`,
    `${String(l.living_area || '?').padEnd(5)}sf`,
    ppsf ? `$${ppsf}/sf` : '         ',
    `[${l.property_sub_type || '?'}]`,
    cd ? `closed ${String(cd).slice(0, 10)}` : `[${l.status}]`,
    `DOM ${l.days_on_market ?? '?'}`,
    `[${l.neighborhood ?? '?'}]`,
  ].join('  ');
}

function stats(values: number[]): { n: number; min?: number; med?: number; avg?: number; max?: number; p25?: number; p75?: number } {
  if (!values.length) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    n: sorted.length,
    min: sorted[0],
    p25,
    med,
    avg: Math.round(sum / sorted.length),
    p75,
    max: sorted[sorted.length - 1],
  };
}

// ─── Phases ─────────────────────────────────────────────────────────────────

async function phase1SameBuilding(args: CliArgs): Promise<ListingRow[]> {
  if (!args.streetNumber) return [];

  const since = new Date();
  since.setMonth(since.getMonth() - args.monthsBack);

  const rows = (await prisma.listing.findMany({
    where: {
      listing_type: args.listingType,
      bedrooms_total: { gte: 0, lte: args.beds + 1 },
      OR: [
        { status: 'Active' },
        { status: 'Pending' },
        { status: 'Closed', modification_timestamp: { gte: since } },
      ],
      address: {
        path: ['StreetNumber'],
        equals: args.streetNumber,
      },
    },
    select: {
      listing_id: true,
      status: true,
      list_price: true,
      bedrooms_total: true,
      bathrooms_full: true,
      living_area: true,
      address: true,
      days_on_market: true,
      neighborhood: true,
      property_sub_type: true,
      raw_data: true,
      modification_timestamp: true,
    },
    take: 50,
    orderBy: { modification_timestamp: 'desc' },
  })) as ListingRow[];

  // Filter to actual street name (street_number alone is not unique).
  const streetNeedle = args.street.toLowerCase();
  return rows.filter((l) => {
    const a = l.address as AddrJson | null;
    const sn = (a?.StreetName || '').toLowerCase();
    return sn.includes(streetNeedle.split(' ').slice(-1)[0]) || streetNeedle.includes(sn);
  });
}

async function phase2NearbyComps(args: CliArgs): Promise<ListingRow[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - args.monthsBack);

  const sqftFilter =
    args.sqft && args.sqftWindow
      ? { gte: args.sqft - args.sqftWindow, lte: args.sqft + args.sqftWindow }
      : undefined;

  const neighborhoodOR = [
    ...args.neighborhoods.map((n) => ({ neighborhood: { contains: n, mode: 'insensitive' as const } })),
    ...args.postalCodes.map((z) => ({ postal_code: z })),
  ];

  if (neighborhoodOR.length === 0) {
    console.warn('WARN: no neighborhoods or postal codes provided — Phase 2 will skip area filter');
  }

  const where: Record<string, unknown> = {
    listing_type: args.listingType,
    bedrooms_total: args.beds,
    OR: [
      { status: 'Active' },
      { status: 'Closed', modification_timestamp: { gte: since } },
    ],
  };
  if (sqftFilter) where.living_area = sqftFilter;
  if (neighborhoodOR.length > 0) where.AND = [{ OR: neighborhoodOR }];
  if (args.excludeSubTypes.length > 0) {
    where.NOT = { property_sub_type: { in: args.excludeSubTypes } };
  }
  // Distribution gates — only displayable listings (per master plan PR 1 fail-closed)
  where.idx_display_yn = true;
  where.internet_entire_listing_display_yn = true;
  where.owner_opt_out = false;
  where.participant_only = false;

  return (await prisma.listing.findMany({
    where: where as never,
    select: {
      listing_id: true,
      status: true,
      list_price: true,
      bedrooms_total: true,
      bathrooms_full: true,
      living_area: true,
      address: true,
      days_on_market: true,
      neighborhood: true,
      property_sub_type: true,
      raw_data: true,
      features: true,
      modification_timestamp: true,
    },
    take: 100,
    orderBy: [{ status: 'asc' }, { modification_timestamp: 'desc' }],
  })) as ListingRow[];
}

async function phase3RentalComps(args: CliArgs): Promise<ListingRow[]> {
  const sqftFilter =
    args.sqft && args.sqftWindow
      ? { gte: args.sqft - args.sqftWindow, lte: args.sqft + args.sqftWindow }
      : undefined;

  const neighborhoodOR = [
    ...args.neighborhoods.map((n) => ({ neighborhood: { contains: n, mode: 'insensitive' as const } })),
    ...args.postalCodes.map((z) => ({ postal_code: z })),
  ];

  const where: Record<string, unknown> = {
    listing_type: 'rent',
    bedrooms_total: args.beds,
    status: 'Active',
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
  };
  if (sqftFilter) where.living_area = sqftFilter;
  if (neighborhoodOR.length > 0) where.AND = [{ OR: neighborhoodOR }];

  return (await prisma.listing.findMany({
    where: where as never,
    select: {
      listing_id: true,
      status: true,
      list_price: true,
      bedrooms_total: true,
      bathrooms_full: true,
      living_area: true,
      address: true,
      days_on_market: true,
      neighborhood: true,
      property_sub_type: true,
      raw_data: true,
      modification_timestamp: true,
    },
    take: 50,
    orderBy: { modification_timestamp: 'desc' },
  })) as ListingRow[];
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const phase1 = await phase1SameBuilding(args);
  const phase2 = await phase2NearbyComps(args);
  const phase3 = args.includeRentals ? await phase3RentalComps(args) : [];

  const phase2Active = phase2.filter((l) => l.status === 'Active').slice(0, args.maxActive);
  const phase2Closed = phase2.filter((l) => l.status === 'Closed').slice(0, args.maxClosed);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          subject: {
            street: args.street,
            streetNumber: args.streetNumber,
            beds: args.beds,
            sqft: args.sqft,
            listingType: args.listingType,
          },
          phase1_same_building: phase1.map((l) => ({
            listing_id: l.listing_id,
            address: fmtAddress(l),
            status: l.status,
            list_price: Number(l.list_price),
            close_price: getClosePrice(l),
            close_date: getCloseDate(l),
            living_area: Number(l.living_area) || null,
            beds: l.bedrooms_total,
            baths: l.bathrooms_full,
            sub_type: l.property_sub_type,
            dom: l.days_on_market,
          })),
          phase2_nearby_comps: phase2.map((l) => ({
            listing_id: l.listing_id,
            address: fmtAddress(l),
            status: l.status,
            list_price: Number(l.list_price),
            close_price: getClosePrice(l),
            close_date: getCloseDate(l),
            living_area: Number(l.living_area) || null,
            ppsf: pricePerSqft(l),
            sub_type: l.property_sub_type,
            neighborhood: l.neighborhood,
            dom: l.days_on_market,
          })),
          phase3_rental_comps: phase3.map((l) => ({
            listing_id: l.listing_id,
            address: fmtAddress(l),
            list_price: Number(l.list_price),
            living_area: Number(l.living_area) || null,
            sub_type: l.property_sub_type,
            neighborhood: l.neighborhood,
          })),
          stats: {
            same_building: stats(phase1.map(effectivePrice)),
            nearby_closed: stats(phase2Closed.map(effectivePrice)),
            nearby_closed_ppsf: stats(phase2Closed.map(pricePerSqft).filter((v): v is number => v !== null)),
            rentals_active: stats(phase3.map(effectivePrice).filter((p) => p > 1500 && p < 20000)),
          },
        },
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    return;
  }

  // ─── Formatted output ──────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  CMA — ${args.street}${args.streetNumber ? ' (#' + args.streetNumber + ')' : ''}`);
  console.log(
    `  Subject: ${args.beds}bd${args.sqft ? ` ~${args.sqft}sf (±${args.sqftWindow})` : ''}, ` +
      `${args.listingType}${args.excludeSubTypes.length ? `, excluding ${args.excludeSubTypes.join('/')}` : ''}`,
  );
  console.log('═══════════════════════════════════════════════════════════');

  // Phase 1
  if (args.streetNumber) {
    console.log(`\n[Phase 1] Same building (${args.streetNumber} ${args.street}) — ${phase1.length} hits:`);
    if (phase1.length === 0) {
      console.log('  (none)');
    } else {
      phase1.forEach((l) => console.log(fmtRow(l)));
    }
  }

  // Phase 2
  console.log(
    `\n[Phase 2] Nearby comps — ${args.neighborhoods.join('/') || args.postalCodes.join('/')} — ` +
      `${args.beds}bd${args.sqft ? `, ${args.sqft - args.sqftWindow}-${args.sqft + args.sqftWindow}sf` : ''} ` +
      `— ${phase2.length} total`,
  );

  console.log(`\n  ── ACTIVE (${phase2Active.length}) ──`);
  phase2Active.forEach((l) => console.log(fmtRow(l)));

  console.log(`\n  ── CLOSED last ${args.monthsBack}mo (${phase2Closed.length}) ──`);
  phase2Closed.forEach((l) => console.log(fmtRow(l)));

  // Stats
  const closedPrices = phase2Closed.map(effectivePrice).filter((p) => p > 0);
  const closedPpsf = phase2Closed.map(pricePerSqft).filter((v): v is number => v !== null);
  if (closedPrices.length > 0) {
    const s = stats(closedPrices);
    const sp = stats(closedPpsf);
    console.log(`\n[Closed stats — n=${s.n}]`);
    console.log(`  price:  min $${s.min!.toLocaleString()} · p25 $${s.p25!.toLocaleString()} · median $${s.med!.toLocaleString()} · avg $${s.avg!.toLocaleString()} · p75 $${s.p75!.toLocaleString()} · max $${s.max!.toLocaleString()}`);
    if (sp.n > 0) {
      console.log(`  $/sf:   p25 $${sp.p25} · median $${sp.med} · p75 $${sp.p75}`);
    }
  }

  // Phase 3 (rentals)
  if (args.includeRentals) {
    console.log(`\n[Phase 3] Active rentals (same area, same beds) — ${phase3.length} total`);
    const rents = phase3.map(effectivePrice).filter((p) => p > 1500 && p < 20000);
    if (rents.length > 0) {
      const r = stats(rents);
      console.log(`  rent: p25 $${r.p25!.toLocaleString()} · median $${r.med!.toLocaleString()} · p75 $${r.p75!.toLocaleString()}`);
    }
    phase3.slice(0, 10).forEach((l) => {
      const a = l.address as AddrJson | null;
      console.log(
        `    ${a?.StreetNumber || '?'} ${a?.StreetName || ''} #${a?.UnitNumber || '?'}  ` +
          `$${Number(l.list_price).toLocaleString()}/mo  ${l.living_area || '?'}sf  [${l.property_sub_type || '?'}]`,
      );
    });
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
