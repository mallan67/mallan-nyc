/**
 * GET /api/crm/sales/prospects/[id]/pdf
 *
 * Generate a professional PDF pitch packet for a seller prospect.
 * Uses @react-pdf/renderer (serverless-friendly, no Puppeteer).
 *
 * Returns: application/pdf with Content-Disposition header.
 * Auth: requireAgentOrBroker + ownership check.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { safeBigInt } from "@/lib/utils/safe-bigint";
// PitchPacketData type imported inline — the simple renderer handles its own typing

export const maxDuration = 30;

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

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function usd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function nycTransferTaxRate(price: number): number {
  return price < 500_000 ? 0.01 : 0.01425;
}

// ── Assemble pitch packet data ───────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assemblePitchPacket(prospect: any, agentName: string): Promise<Record<string, any>> {
  // ── Pillar 1: Property Intel ──
  const compFields =
    "ListingId,UnparsedAddress,UnitNumber,ClosePrice,CloseDate,BedroomsTotal,BathroomsTotalInteger,LivingArea,BuildingName,StreetName,StreetNumber";

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

  const recentSales = buildingFilter
    ? await queryTrestle("Property", buildingFilter, compFields, 10)
    : [];

  const activeFields =
    "ListingId,UnparsedAddress,UnitNumber,ListPrice,BedroomsTotal,BathroomsTotalInteger,LivingArea,StandardStatus,PropertyType";

  let competitionFilter = "";
  if (prospect.postal_code || prospect.neighborhood) {
    const areaFilter = prospect.postal_code
      ? `PostalCode eq '${prospect.postal_code.replace(/'/g, "''")}'`
      : `contains(City,'${(prospect.neighborhood || "").replace(/'/g, "''")}')`;

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
      unit: prospect.unit || null,
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
      ownership_years: prospect.ownership_years ? Number(prospect.ownership_years) : null,
      last_purchase_price: prospect.last_purchase_price ? Number(prospect.last_purchase_price) : null,
      last_purchase_date: prospect.last_purchase_date,
      market_value: prospect.market_value ? Number(prospect.market_value) : null,
      assessed_value: prospect.assessed_value ? Number(prospect.assessed_value) : null,
      annual_tax: prospect.annual_tax ? Number(prospect.annual_tax) : null,
      tax_class: prospect.tax_class,
      open_violations: prospect.open_violations,
      recent_permits: prospect.recent_permits,
    },
    recent_sales: recentSales.map((s) => ({
      address: s.UnparsedAddress || "N/A",
      unit: s.UnitNumber || null,
      close_price: s.ClosePrice || null,
      close_date: s.CloseDate || null,
      beds: s.BedroomsTotal || null,
      baths: s.BathroomsTotalInteger || null,
      sqft: s.LivingArea || null,
    })),
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

  // ── Pillar 2: Pricing Strategy ──
  const prospectSqft = prospect.sqft || 0;
  const closedCount = recentSales.length;
  const activeCount = activeCompetition.length;

  const compPpsf = recentSales
    .filter((s) => s.ClosePrice && s.LivingArea && s.LivingArea > 0)
    .map((s) => (s.ClosePrice as number) / (s.LivingArea as number));

  let conservative = 0;
  let recommended = 0;
  let aspirational = 0;

  if (compPpsf.length > 0 && prospectSqft > 0) {
    const sorted = [...compPpsf].sort((a, b) => a - b);
    conservative = Math.round(sorted[0] * prospectSqft);
    recommended = Math.round(median(sorted) * prospectSqft);
    aspirational = Math.round(sorted[sorted.length - 1] * prospectSqft);
  } else if (prospect.market_value) {
    const mv = Number(prospect.market_value);
    conservative = Math.round(mv * 0.95);
    recommended = Math.round(mv);
    aspirational = Math.round(mv * 1.1);
  }

  const competitionPrices = activeCompetition
    .filter((a) => a.ListPrice && a.ListPrice > 0)
    .map((a) => a.ListPrice as number);
  const competitionLow =
    competitionPrices.length > 0 ? Math.min(...competitionPrices) : null;
  const competitionHigh =
    competitionPrices.length > 0 ? Math.max(...competitionPrices) : null;

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

  // ── Pillar 3: Exposure Plan ──
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
        description: "StreetEasy, Zillow, Realtor.com, Redfin, Homes.com",
        reach: "millions" as string | number,
      },
      {
        name: "International Reach",
        description: "30,400+ LinkedIn followers and international marketing",
        reach: 30_400,
      },
    ],
  };

  // ── Pillar 4: Financial Picture ──
  const grossPrice = recommended || 0;
  const commissionRate = 0.06;
  const commission = Math.round(grossPrice * commissionRate);
  const transferTaxRate = nycTransferTaxRate(grossPrice);
  const transferTax = Math.round(grossPrice * transferTaxRate);
  const attorneyFees = 3000;
  const mortgagePayoff = prospect.mortgage_amount
    ? Number(prospect.mortgage_amount)
    : 0;
  const netProceeds =
    grossPrice - commission - transferTax - attorneyFees - mortgagePayoff;

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
    disclaimer:
      "Estimates only. Actual costs may vary based on negotiated terms, final sale price, and attorney review.",
  };

  // ── Attribution ──
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

  return {
    prospect_id: String(prospect.id),
    agent_name: agentName,
    generated_at: now.toISOString(),
    property_intel: propertyIntel,
    pricing_strategy: pricingStrategy,
    exposure_plan: exposurePlan,
    financial_picture: financialPicture,
    attribution,
  };
}

// ── Route handler ────────────────────────────────────────────────────

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

  // Fetch agent name
  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
    select: { first_name: true, last_name: true },
  });
  const agentName = agent
    ? `${agent.first_name} ${agent.last_name}`
    : "Your Agent";

  try {
    // Assemble pitch packet data (reuses existing function — Trestle comps, pricing, financials)
    const packetData = await assemblePitchPacket(prospect, agentName);

    // Render the luxury HTML presentation
    const { renderPitchPacketHTML } = await import("@/lib/pitch-packet/template");

    const pp = packetData.pricing_strategy?.price_points || {};
    const fp = packetData.financial_picture || {};
    const ep = packetData.exposure_plan || {};
    const pi = packetData.property_intel?.prospect_data || {};

    const html = renderPitchPacketHTML({
      address: prospect.address,
      unit: prospect.unit,
      borough: prospect.borough,
      neighborhood: prospect.neighborhood,
      propertyType: prospect.property_type,
      beds: prospect.beds,
      baths: prospect.baths ? Number(prospect.baths) : null,
      sqft: prospect.sqft,
      yearBuilt: prospect.year_built,
      floors: prospect.floors,
      unitsTotal: prospect.units_total,
      ownerName: prospect.owner_name,
      ownershipYears: prospect.ownership_years ? Number(prospect.ownership_years) : null,
      lastPurchasePrice: pi.last_purchase_price,
      lastPurchaseDate: pi.last_purchase_date,
      mortgageAmount: prospect.mortgage_amount ? Number(prospect.mortgage_amount) : null,
      marketValue: pi.market_value,
      annualTax: pi.annual_tax,
      conservative: pp.conservative,
      recommended: pp.recommended,
      aspirational: pp.aspirational,
      compsUsed: packetData.pricing_strategy?.comps_used || 0,
      commission: fp.commission,
      commissionRate: fp.commission_rate || 0.06,
      transferTax: fp.transfer_tax,
      attorneyFees: fp.attorney_fees || 3000,
      mortgagePayoff: fp.mortgage_payoff,
      netProceeds: fp.net_proceeds,
      recentSales: (packetData.property_intel?.recent_sales || []).map((s: Record<string, unknown>) => ({
        address: String(s.address || ""),
        unit: s.unit as string | null,
        closePrice: s.close_price as number | null,
        closeDate: s.close_date as string | null,
        beds: s.beds as number | null,
        baths: s.baths as number | null,
        sqft: s.sqft as number | null,
      })),
      activeCompetition: (packetData.property_intel?.active_competition || []).map((c: Record<string, unknown>) => ({
        address: String(c.address || ""),
        unit: c.unit as string | null,
        listPrice: c.list_price as number | null,
        beds: c.beds as number | null,
        baths: c.baths as number | null,
        sqft: c.sqft as number | null,
      })),
      buyerCount: ep.buyer_database || 0,
      agentNetwork: ep.agent_network || 17000,
      firms: ep.firms || 570,
      agentName,
      generatedAt: new Date().toISOString(),
    });

    // Update pitch_generated_at
    await prisma.sellerLead.update({
      where: { id: prospectId },
      data: { pitch_generated_at: new Date() },
    });

    await logAuditEvent(
      "seller_prospect_pitch_viewed",
      "seller_lead",
      String(prospectId),
      auth,
      { format: "html", address: prospect.address },
    );

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[PitchPacket] Generation failed:", errMsg);
    return NextResponse.json(
      { error: "Pitch packet generation failed", detail: errMsg },
      { status: 500 },
    );
  }
}
