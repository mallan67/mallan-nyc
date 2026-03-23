/**
 * GET /api/crm/sales/prospects/[id]/pitch-packet
 *
 * Generate pitch packet JSON data for a seller prospect.
 * Assembles 4 pillars: Property Intel, Pricing Strategy, Exposure Plan, Financial Picture.
 * Consumed by UI and PDF renderer (Task 5).
 *
 * Trestle queries are server-side only (MLS compliance).
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";

type RouteParams = { params: Promise<{ id: string }> };

// ── Trestle helper ──────────────────────────────────────────────────────
import { getAccessToken } from "@/lib/idx/auth";

const TRESTLE_API = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";

interface TrestleProperty {
  ListingId?: string;
  UnparsedAddress?: string;
  UnitNumber?: string;
  ClosePrice?: number;
  ListPrice?: number;
  CloseDate?: string;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  LivingArea?: number;
  StandardStatus?: string;
  PropertyType?: string;
  BuildingName?: string;
  StreetName?: string;
  StreetNumber?: string;
  PostalCode?: string;
}

async function queryTrestle(
  resource: string,
  filter: string,
  select: string,
  top = 10,
): Promise<TrestleProperty[]> {
  try {
    const token = await getAccessToken();
    const url = `${TRESTLE_API}/odata/${resource}?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=${top}&$orderby=ModificationTimestamp desc`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.value || [];
  } catch {
    return [];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Median of a numeric array */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Format USD */
function usd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** NYC transfer tax rate */
function nycTransferTaxRate(price: number): number {
  return price < 500_000 ? 0.01 : 0.01425;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Ownership check
  const prospect = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
    include: {
      signals: { orderBy: { collected_at: "desc" } },
    },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // Fetch agent for Exposure Plan buyer count and agent name
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true },
  });
  const agentName = agent
    ? `${agent.first_name} ${agent.last_name}`
    : "Your Agent";

  // ═══════════════════════════════════════════════════════════════════════
  // PILLAR 1: Property Intel
  // ═══════════════════════════════════════════════════════════════════════

  const compFields =
    "ListingId,UnparsedAddress,UnitNumber,ClosePrice,CloseDate,BedroomsTotal,BathroomsTotalInteger,LivingArea,BuildingName,StreetName,StreetNumber";

  // Parse pitch_data for curated comps and overrides
  type PitchComp = {
    mls_id?: string;
    address: string;
    unit?: string | null;
    close_price: number | null;
    close_date?: string | null;
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    building_name?: string | null;
    property_type?: string | null;
  };
  type PitchOverrides = {
    estimated_value?: number;
    commission_rate?: number;
    attorney_fees?: number;
  };
  type PitchData = {
    comps?: PitchComp[];
    overrides?: PitchOverrides;
  };

  const pitchData = (prospect.pitch_data ?? null) as PitchData | null;
  const curatedComps: PitchComp[] = pitchData?.comps?.length ? pitchData.comps : [];
  const overrides: PitchOverrides = pitchData?.overrides ?? {};

  const compsSource: "curated" | "auto" = curatedComps.length > 0 ? "curated" : "auto";

  // ── Recent sales: use curated comps if available, else query Trestle ──
  let recentSalesFormatted: Array<{
    address: string;
    unit: string | null;
    close_price: number | null;
    close_date: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    building_name?: string | null;
    property_type?: string | null;
  }>;

  if (curatedComps.length > 0) {
    // PILLAR 1 — use snapshotted curated comps
    recentSalesFormatted = curatedComps.map((c) => ({
      address: c.address,
      unit: c.unit ?? null,
      close_price: c.close_price ?? null,
      close_date: c.close_date ?? null,
      beds: c.beds ?? null,
      baths: c.baths ?? null,
      sqft: c.sqft ?? null,
      building_name: c.building_name ?? null,
      property_type: c.property_type ?? null,
    }));
  } else {
    // FALLBACK — live Trestle query (backward compat)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const dateStr = twelveMonthsAgo.toISOString().split("T")[0];

    let buildingFilter = "";
    if (prospect.building_name) {
      const safe = prospect.building_name.replace(/'/g, "''");
      buildingFilter = `BuildingName eq '${safe}' and StandardStatus eq 'Closed' and CloseDate ge ${dateStr}`;
    } else if (prospect.address) {
      const parts = prospect.address.trim().split(/\s+/);
      const streetNum = parts[0]?.replace(/'/g, "''") || "";
      const streetName = parts.slice(1).join(" ").replace(/'/g, "''") || "";
      if (streetNum && streetName) {
        buildingFilter = `StreetNumber eq '${streetNum}' and contains(StreetName,'${streetName}') and StandardStatus eq 'Closed' and CloseDate ge ${dateStr}`;
      }
    }

    const trestleSales = buildingFilter
      ? await queryTrestle("Property", buildingFilter, compFields, 10)
      : [];

    recentSalesFormatted = trestleSales.map((s) => ({
      address: s.UnparsedAddress || "N/A",
      unit: s.UnitNumber || null,
      close_price: s.ClosePrice || null,
      close_date: s.CloseDate || null,
      beds: s.BedroomsTotal || null,
      baths: s.BathroomsTotalInteger || null,
      sqft: s.LivingArea || null,
    }));
  }

  // Active competition: same area, similar property type, price +/-30%
  const activeFields =
    "ListingId,UnparsedAddress,UnitNumber,ListPrice,BedroomsTotal,BathroomsTotalInteger,LivingArea,StandardStatus,PropertyType";

  let competitionFilter = "";
  if (prospect.postal_code || prospect.neighborhood) {
    const areaFilter = prospect.postal_code
      ? `PostalCode eq '${prospect.postal_code.replace(/'/g, "''")}'`
      : `contains(City,'${(prospect.neighborhood || "").replace(/'/g, "''")}')`;

    // Use market_value or last_purchase_price as price anchor
    const priceAnchor = prospect.market_value
      ? Number(prospect.market_value)
      : prospect.last_purchase_price
        ? Number(prospect.last_purchase_price)
        : 0;

    if (priceAnchor > 0) {
      const low = Math.round(priceAnchor * 0.7);
      const high = Math.round(priceAnchor * 1.3);
      competitionFilter = `${areaFilter} and StandardStatus eq 'Active' and ListPrice ge ${low} and ListPrice le ${high}`;
    } else {
      competitionFilter = `${areaFilter} and StandardStatus eq 'Active'`;
    }
  }

  const activeCompetition = competitionFilter
    ? await queryTrestle("Property", competitionFilter, activeFields, 10)
    : [];

  const propertyIntel = {
    prospect_data: {
      address: prospect.address,
      unit: prospect.unit,
      borough: prospect.borough,
      neighborhood: prospect.neighborhood,
      postal_code: prospect.postal_code,
      property_type: prospect.property_type,
      beds: prospect.beds,
      baths: prospect.baths ? Number(prospect.baths) : null,
      sqft: prospect.sqft,
      year_built: prospect.year_built,
      building_name: prospect.building_name,
      floors: prospect.floors,
      units_total: prospect.units_total,
      owner_name: prospect.owner_name,
      ownership_years: prospect.ownership_years
        ? Number(prospect.ownership_years)
        : null,
      last_purchase_price: prospect.last_purchase_price
        ? Number(prospect.last_purchase_price)
        : null,
      last_purchase_date: prospect.last_purchase_date,
      market_value: prospect.market_value
        ? Number(prospect.market_value)
        : null,
      assessed_value: prospect.assessed_value
        ? Number(prospect.assessed_value)
        : null,
      annual_tax: prospect.annual_tax ? Number(prospect.annual_tax) : null,
      tax_class: prospect.tax_class,
      open_violations: prospect.open_violations,
      recent_permits: prospect.recent_permits,
    },
    recent_sales: recentSalesFormatted,
    active_competition: activeCompetition.map((a) => ({
      address: a.UnparsedAddress || "N/A",
      unit: a.UnitNumber || null,
      list_price: a.ListPrice || null,
      beds: a.BedroomsTotal || null,
      baths: a.BathroomsTotalInteger || null,
      sqft: a.LivingArea || null,
      property_type: a.PropertyType || null,
    })),
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PILLAR 2: Pricing Strategy
  // ═══════════════════════════════════════════════════════════════════════

  const prospectSqft = prospect.sqft || 0;
  const closedCount = recentSalesFormatted.length;
  const activeCount = activeCompetition.length;

  // Compute price/sqft from comps (works for both curated and Trestle-sourced)
  const compPpsf = recentSalesFormatted
    .filter((s) => s.close_price && s.sqft && s.sqft > 0)
    .map((s) => (s.close_price as number) / (s.sqft as number));

  let conservative = 0;
  let recommended = 0;
  let aspirational = 0;

  if (overrides.estimated_value) {
    // Agent-set override takes full priority
    recommended = overrides.estimated_value;
    conservative = Math.round(recommended * 0.93);
    aspirational = Math.round(recommended * 1.07);
  } else if (compPpsf.length > 0 && prospectSqft > 0) {
    const sorted = [...compPpsf].sort((a, b) => a - b);
    conservative = Math.round(sorted[0] * prospectSqft);
    recommended = Math.round(median(sorted) * prospectSqft);
    aspirational = Math.round(sorted[sorted.length - 1] * prospectSqft);
  } else if (prospect.market_value) {
    // Fallback: DOF market value as base
    const mv = Number(prospect.market_value);
    conservative = Math.round(mv * 0.95);
    recommended = Math.round(mv);
    aspirational = Math.round(mv * 1.1);
  }

  const equityGain = recommended
    ? recommended - (prospect.last_purchase_price ? Number(prospect.last_purchase_price) : 0)
    : 0;

  // Competition price range
  const competitionPrices = activeCompetition
    .filter((a) => a.ListPrice && a.ListPrice > 0)
    .map((a) => a.ListPrice as number);
  const competitionLow =
    competitionPrices.length > 0 ? Math.min(...competitionPrices) : null;
  const competitionHigh =
    competitionPrices.length > 0 ? Math.max(...competitionPrices) : null;

  // Absorption rate: months of inventory
  const absorptionRate =
    closedCount > 0
      ? Math.round((activeCount / closedCount) * 12 * 10) / 10
      : null;

  const pricingStrategy = {
    price_points: {
      conservative,
      conservative_label: conservative ? usd(conservative) : null,
      recommended,
      recommended_label: recommended ? usd(recommended) : null,
      aspirational,
      aspirational_label: aspirational ? usd(aspirational) : null,
    },
    comps_used: compPpsf.length,
    prospect_sqft: prospectSqft,
    competition: {
      active_count: activeCount,
      price_range_low: competitionLow,
      price_range_high: competitionHigh,
      price_range_label:
        competitionLow && competitionHigh
          ? `${usd(competitionLow)} - ${usd(competitionHigh)}`
          : null,
    },
    absorption_rate: absorptionRate,
    absorption_label: absorptionRate
      ? `${absorptionRate} months of inventory`
      : "Insufficient data",
    closed_12mo_count: closedCount,
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PILLAR 3: Exposure Plan
  // ═══════════════════════════════════════════════════════════════════════

  // Dynamic buyer count from DB
  const buyerCount = await prisma.lead.count({
    where: { roles: { has: "buyer" } },
  });

  const exposurePlan = {
    buyer_database: buyerCount,
    agent_network: 17_000,
    firms: 570,
    idx_providers: 30,
    linkedin_followers: 30_400,
    syndication_portals: [
      "StreetEasy",
      "Zillow",
      "Realtor.com",
      "Redfin",
      "Homes.com",
      "RentHop",
      "openigloo",
      "Samaki.com",
      "TBI Listings",
    ],
    layers: [
      {
        name: "Private Database",
        description: `${buyerCount.toLocaleString()} active buyers in our CRM`,
        reach: buyerCount,
      },
      {
        name: "Local Agent Network",
        description: "17,000+ REBNY agents across 570 firms",
        reach: 17_000,
      },
      {
        name: "Agent IDX Syndication",
        description: "30 IDX-licensed technology providers",
        reach: 30,
      },
      {
        name: "National Portals",
        description:
          "StreetEasy, Zillow, Realtor.com, Redfin, Homes.com",
        reach: "millions",
      },
      {
        name: "International Reach",
        description: "30,400+ LinkedIn followers and international marketing",
        reach: 30_400,
      },
    ],
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PILLAR 4: Financial Picture
  // ═══════════════════════════════════════════════════════════════════════

  const grossPrice = recommended || 0;
  const commissionRate = overrides.commission_rate ?? 0.06;
  const commission = Math.round(grossPrice * commissionRate);
  const transferTaxRate = nycTransferTaxRate(grossPrice);
  const transferTax = Math.round(grossPrice * transferTaxRate);
  const attorneyFees = overrides.attorney_fees ?? 3000;
  const mortgagePayoff = prospect.mortgage_amount
    ? Number(prospect.mortgage_amount)
    : 0;
  const netProceeds = grossPrice - commission - transferTax - attorneyFees - mortgagePayoff;

  const financialPicture = {
    gross_price: grossPrice,
    gross_label: usd(grossPrice),
    commission_rate: commissionRate,
    commission,
    commission_label: usd(commission),
    transfer_tax_rate: transferTaxRate,
    transfer_tax: transferTax,
    transfer_tax_label: usd(transferTax),
    attorney_fees: attorneyFees,
    attorney_fees_label: usd(attorneyFees),
    mortgage_payoff: mortgagePayoff,
    mortgage_payoff_label: usd(mortgagePayoff),
    net_proceeds: netProceeds,
    net_proceeds_label: usd(netProceeds),
    equity_gain: equityGain,
    equity_gain_label: usd(equityGain),
    disclaimer:
      "Estimates only. Actual costs may vary based on negotiated terms, final sale price, and attorney review.",
  };

  // ═══════════════════════════════════════════════════════════════════════
  // REBNY Attribution
  // ═══════════════════════════════════════════════════════════════════════

  const now = new Date();
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const attribution = `Based on information from the REBNY Listing Service for the period ${fmt(yearAgo)} through ${fmt(now)}. This information is provided for consumers' personal, non-commercial use.`;

  // Update pitch_generated_at
  await prisma.sellerLead.update({
    where: { id: prospectId },
    data: { pitch_generated_at: new Date() },
  });

  await logAuditEvent(
    "seller_prospect_pitch_generated",
    "seller_lead",
    String(prospectId),
    auth,
    {
      comps_found: closedCount,
      comps_source: compsSource,
      active_competition: activeCount,
      recommended_price: recommended,
      equity_gain: equityGain,
    },
  );

  return NextResponse.json(
    serializeBigInts({
      prospect_id: String(prospectId),
      agent_name: agentName,
      generated_at: now.toISOString(),
      comps_source: compsSource,
      property_intel: propertyIntel,
      pricing_strategy: pricingStrategy,
      exposure_plan: exposurePlan,
      financial_picture: financialPicture,
      attribution,
    }),
  );
}
