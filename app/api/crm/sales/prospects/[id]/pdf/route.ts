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

// ── Trestle helper (duplicated from pitch-packet route to avoid HTTP self-call) ──

const TRESTLE_API = "https://api.cotality.com/trestle";
const token = process.env.TRESTLE_TOKEN;

interface TrestleProperty {
  ListingId?: string;
  UnparsedAddress?: string;
  UnitNumber?: string;
  ClosePrice?: number;
  ListPrice?: number;
  CloseDate?: string;
  BedroomsTotal?: number;
  BathroomsTotalDecimal?: number;
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
  if (!token) return [];
  try {
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
    "ListingId,UnparsedAddress,UnitNumber,ClosePrice,CloseDate,BedroomsTotal,BathroomsTotalDecimal,LivingArea,BuildingName,StreetName,StreetNumber";

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
    "ListingId,UnparsedAddress,UnitNumber,ListPrice,BedroomsTotal,BathroomsTotalDecimal,LivingArea,StandardStatus,PropertyType";

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
      baths: s.BathroomsTotalDecimal || null,
      sqft: s.LivingArea || null,
    })),
    active_competition: activeCompetition.map((a) => ({
      address: a.UnparsedAddress || "N/A",
      unit: a.UnitNumber || null,
      list_price: a.ListPrice || null,
      beds: a.BedroomsTotal || null,
      baths: a.BathroomsTotalDecimal || null,
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
    // Assemble pitch packet data
    const packetData = await assemblePitchPacket(prospect, agentName);

    // Use pdf-lib renderer (pure JS, no React/JSX runtime conflicts)
    const { renderSimplePitchPdf } = await import(
      "@/lib/pdf/pitch-packet-simple"
    );

    const pdfBuffer = await renderSimplePitchPdf({
      address: prospect.address,
      unit: prospect.unit || undefined,
      owner_name: prospect.owner_name || undefined,
      agent_name: agentName,
      beds: prospect.beds,
      baths: prospect.baths ? Number(prospect.baths) : null,
      sqft: prospect.sqft,
      year_built: prospect.year_built,
      floors: prospect.floors,
      units_total: prospect.units_total,
      readiness_score: prospect.readiness_score,
      score_grade: prospect.score_grade,
      conservative: packetData.pricing_strategy?.price_points?.conservative,
      recommended: packetData.pricing_strategy?.price_points?.recommended,
      aspirational: packetData.pricing_strategy?.price_points?.aspirational,
      competition_count: packetData.pricing_strategy?.competition?.active_count,
      absorption_rate: packetData.pricing_strategy?.absorption_label,
      buyer_count: packetData.exposure_plan?.buyer_database,
      gross_price: packetData.financial_picture?.gross_price,
      commission: packetData.financial_picture?.commission,
      transfer_tax: packetData.financial_picture?.transfer_tax,
      attorney_fees: packetData.financial_picture?.attorney_fees,
      mortgage_payoff: packetData.financial_picture?.mortgage_payoff,
      net_proceeds: packetData.financial_picture?.net_proceeds,
      attribution: packetData.attribution,
    });

    // Build a filename-safe address slug
    const addressSlug = (prospect.address || "property")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .substring(0, 60);

    // Update pitch_generated_at
    await prisma.sellerLead.update({
      where: { id: prospectId },
      data: { pitch_generated_at: new Date() },
    });

    await logAuditEvent(
      "seller_prospect_pdf_generated",
      "seller_lead",
      String(prospectId),
      auth,
      { format: "pdf", address: prospect.address },
    );

    // pdf-lib returns Uint8Array — convert to Buffer for NextResponse
    const body = Buffer.from(pdfBuffer);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="pitch-packet-${addressSlug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack?.split("\n").slice(0, 5).join("\n") : "";
    console.error("[PDF] Pitch packet generation failed:", errMsg, "\n", errStack);
    return NextResponse.json(
      { error: "PDF generation failed", detail: errMsg },
      { status: 500 },
    );
  }
}
