/**
 * /api/crm/lease-tracker
 *
 * GET — denormalized view of all landlord properties with tenants, leases,
 *       listings, outreach status, and opportunity flags.
 *
 * Query params:
 *   ?view=all|expiring|vacant|dual_listed|opportunities
 *   ?urgency=6mo|90d|60d|30d  — filter by urgency window
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { serializeBigInts } from "@/lib/api/serialize";
import { calculateQualification } from "@/lib/finance/nyc-qualification";

// ── Urgency helpers ───────────────────────────────────────────────────────────

type UrgencyLevel = "30d" | "60d" | "90d" | "6mo" | "ok";

function getUrgency(daysUntil: number): UrgencyLevel {
  if (daysUntil <= 30) return "30d";
  if (daysUntil <= 60) return "60d";
  if (daysUntil <= 90) return "90d";
  if (daysUntil <= 180) return "6mo";
  return "ok";
}

// "expiring" in summary means urgency is not "ok" (within 6 months)
function isExpiringSoon(urgency: UrgencyLevel): boolean {
  return urgency !== "ok";
}

// ── Prediction scoring ────────────────────────────────────────────────────────

type PredictionResult = {
  score: number;
  label: string;
  signals: string[];
};

function predictionLabel(score: number): string {
  if (score >= 80) return "Very Likely";
  if (score >= 60) return "Likely";
  if (score >= 40) return "Possible";
  if (score >= 20) return "Unlikely";
  return "Very Unlikely";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Landlord sell probability.
 * Signals: ownership duration, equity, portfolio size, lease timing, vacancy,
 * comps engagement, market uplift, entity type.
 */
function predictLandlordSell(
  landlord: {
    entity_type?: string | null;
    seller_potential?: string | null;
  },
  lease: {
    lease_start_date: Date;
    lease_end_date: Date;
    monthly_rent: unknown;
    seller_comps_6mo_sent_at?: Date | null;
    outreach_90d_sent_at?: Date | null;
  },
  landlordLeaseCount: number,
  isVacant: boolean,
  hasSaleComps: boolean
): PredictionResult {
  let score = 20;
  const signals: string[] = [];

  // Ownership duration proxy: use lease start date as the earliest known date
  const ownedYears =
    (Date.now() - lease.lease_start_date.getTime()) /
    (1000 * 60 * 60 * 24 * 365.25);

  if (ownedYears > 10) {
    score += 25;
    signals.push(`Owned ${Math.floor(ownedYears)}+ years`);
  }
  if (ownedYears > 20) {
    score += 15;
    signals.push("Very long ownership (20+ years)");
  }

  // Entity type: individuals sell more than LLCs/corps
  if (
    landlord.entity_type &&
    ["individual", "person"].includes(landlord.entity_type.toLowerCase())
  ) {
    score += 5;
    signals.push("Individual owner (not entity)");
  }

  // Portfolio investor more likely to rebalance
  if (landlordLeaseCount > 1) {
    score += 10;
    signals.push(`Portfolio owner (${landlordLeaseCount} properties)`);
  }

  // Lease expiring within 6 months — natural exit point
  const daysUntilExpiry = Math.ceil(
    (lease.lease_end_date.getTime() - Date.now()) / 86400000
  );
  if (daysUntilExpiry <= 180) {
    score += 10;
    signals.push("Lease expiring — natural exit point");
  }

  // Vacant: carrying costs motivate a sale
  if (isVacant) {
    score += 15;
    signals.push("Vacant — carrying costs");
  }

  // Recent comparable sales data present
  if (hasSaleComps) {
    score += 10;
    signals.push("Recent sales comps in building");
  }

  // Seller comps email sent and there is also a 90d outreach (multi-touch engagement)
  if (lease.seller_comps_6mo_sent_at && lease.outreach_90d_sent_at) {
    score += 10;
    signals.push("Engaged with seller outreach emails");
  }

  // seller_potential field on lead
  if (landlord.seller_potential === "high") {
    score += 20;
    signals.push("Flagged high seller potential");
  } else if (landlord.seller_potential === "medium") {
    score += 10;
    signals.push("Flagged medium seller potential");
  }

  const finalScore = clamp(score, 0, 95);
  return { score: finalScore, label: predictionLabel(finalScore), signals };
}

/**
 * Tenant buy probability.
 * Signals: income, rent-to-income ratio, tenure, credit, pre-approval.
 */
function predictTenantBuy(
  tenant: {
    annual_income?: unknown;
    credit_score_range?: string | null;
    pre_approved?: boolean | null;
    last_sales_email_opened?: Date | null;
  } | null,
  monthlyRent: unknown,
  leaseStartDate: Date
): PredictionResult {
  if (!tenant) {
    return { score: 0, label: "Unknown", signals: ["No tenant data"] };
  }

  const annualIncome = tenant.annual_income ? Number(tenant.annual_income) : null;

  if (annualIncome === null) {
    return { score: 0, label: "Unknown", signals: ["No income data"] };
  }

  let score = 10;
  const signals: string[] = [];

  if (annualIncome > 150000) {
    score += 25;
    signals.push("High income ($150K+)");
  }
  if (annualIncome > 250000) {
    score += 15;
    signals.push("Very high income ($250K+)");
  }

  // Income > 40x monthly rent (can afford to buy in NYC)
  const monthly = monthlyRent ? Number(monthlyRent) : null;
  if (monthly && annualIncome > monthly * 40) {
    score += 15;
    signals.push("Income qualifies for mortgage (40x rent)");
  }

  // Tenure
  const tenureYears =
    (Date.now() - leaseStartDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (tenureYears > 2) {
    score += 10;
    signals.push("2+ years in rental");
  }
  if (tenureYears > 5) {
    score += 10;
    signals.push("5+ years — ready for stability");
  }

  // Credit score
  const credit = tenant.credit_score_range?.toLowerCase() ?? "";
  if (credit.includes("excellent")) {
    score += 10;
    signals.push("Excellent credit");
  } else if (credit.includes("good")) {
    score += 10;
    signals.push("Good credit");
  }

  // Pre-approved for mortgage
  if (tenant.pre_approved) {
    score += 20;
    signals.push("Pre-approved for mortgage");
  }

  // Clicked sale listing emails
  if (tenant.last_sales_email_opened) {
    score += 15;
    signals.push("Opened sales listing email");
  }

  const finalScore = clamp(score, 0, 95);
  return { score: finalScore, label: predictionLabel(finalScore), signals };
}

/**
 * Lease renewal probability.
 * Signals: rent vs. market, recent increases, renewal status, tenure,
 * lease type, building violations, tenant overqualification.
 */
function predictLeaseRenewal(
  lease: {
    monthly_rent: unknown;
    lease_start_date: Date;
    lease_end_date: Date;
    lease_type?: string | null;
    renewal_status?: string | null;
    last_rent_increase_pct?: number | null;
  } | null,
  tenantAnnualIncome: number | null
): PredictionResult {
  if (!lease) {
    return { score: 0, label: predictionLabel(0), signals: ["No lease data"] };
  }

  let score = 50;
  const signals: string[] = [];

  // Renewal status — strongest signal
  if (lease.renewal_status === "renewing") {
    score += 30;
    signals.push("Tenant confirmed renewing");
  } else if (lease.renewal_status === "not_renewing") {
    score -= 40;
    signals.push("Tenant confirmed not renewing");
  }

  // Recent rent increase
  if (lease.last_rent_increase_pct !== null && lease.last_rent_increase_pct !== undefined) {
    if (lease.last_rent_increase_pct > 5) {
      score -= 15;
      signals.push(`Recent ${lease.last_rent_increase_pct}% rent increase`);
    }
  }

  // Tenure
  const tenureYears =
    (Date.now() - lease.lease_start_date.getTime()) /
    (1000 * 60 * 60 * 24 * 365.25);
  if (tenureYears > 3) {
    score += 10;
    signals.push("Long-term tenant (3+ years)");
  }

  // Lease type
  const leaseType = lease.lease_type?.toLowerCase() ?? "";
  if (leaseType.includes("stabilized")) {
    score += 25;
    signals.push("Rent-stabilized — very likely to renew");
  } else if (leaseType === "month_to_month" || leaseType.includes("month-to-month")) {
    score -= 10;
    signals.push("Month-to-month — flexible arrangement");
  }

  // Tenant overqualified relative to rent
  const monthly = lease.monthly_rent ? Number(lease.monthly_rent) : null;
  if (tenantAnnualIncome !== null && monthly && tenantAnnualIncome > monthly * 60) {
    score -= 10;
    signals.push("Tenant overqualified — may buy");
  }

  const finalScore = clamp(score, 5, 95);
  return { score: finalScore, label: predictionLabel(finalScore), signals };
}

/**
 * Optimal outreach timing — urgency to contact NOW.
 * Higher score = contact sooner.
 */
function predictOutreachTiming(
  lease: {
    lease_end_date: Date;
    outreach_90d_sent_at?: Date | null;
    outreach_60d_sent_at?: Date | null;
    outreach_30d_sent_at?: Date | null;
    seller_comps_6mo_sent_at?: Date | null;
  },
  isVacant: boolean,
  hasActiveListing: boolean
): PredictionResult {
  const daysUntilExpiry = Math.ceil(
    (lease.lease_end_date.getTime() - Date.now()) / 86400000
  );

  // Last contacted: use the most recent outreach date
  const outreachDates = [
    lease.outreach_30d_sent_at,
    lease.outreach_60d_sent_at,
    lease.outreach_90d_sent_at,
    lease.seller_comps_6mo_sent_at,
  ].filter(Boolean) as Date[];

  const lastContactedDate =
    outreachDates.length > 0
      ? new Date(Math.max(...outreachDates.map((d) => d.getTime())))
      : null;

  const daysSinceContact = lastContactedDate
    ? Math.ceil((Date.now() - lastContactedDate.getTime()) / 86400000)
    : 999;

  const noRecentContact = daysSinceContact > 30;

  // Vacant with no listing — highest urgency
  if (isVacant && !hasActiveListing) {
    const signals = ["Vacant — carrying costs"];
    if (daysSinceContact < 999) signals.push(`Last contacted ${daysSinceContact} days ago`);
    return { score: 85, label: "Very Likely", signals };
  }

  let score = 20;
  const signals: string[] = [];

  signals.push(`Lease expires in ${daysUntilExpiry} days`);

  if (daysUntilExpiry <= 30 && noRecentContact) {
    score = 95;
    signals.push("No recent contact — urgent");
  } else if (daysUntilExpiry <= 60 && noRecentContact) {
    score = 80;
    signals.push("No recent contact");
  } else if (daysUntilExpiry <= 90) {
    score = 65;
  } else if (daysUntilExpiry <= 180) {
    score = 45;
  }

  if (daysSinceContact > 90) {
    score += 15;
    signals.push(`Last contacted ${daysSinceContact} days ago`);
  }

  // Seller comps sent + 90d both sent = engaged
  if (lease.seller_comps_6mo_sent_at && lease.outreach_90d_sent_at) {
    score += 10;
    signals.push("Previously engaged with outreach");
  }

  // Market uplift (constant optimistic signal)
  score += 5;
  signals.push("Favorable market conditions");

  const finalScore = clamp(score, 0, 95);
  return { score: finalScore, label: predictionLabel(finalScore), signals };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "all";
  const urgencyFilter = sp.get("urgency") as UrgencyLevel | null;

  // ── 1. Fetch leases ──────────────────────────────────────────────────────
  const leaseWhere: Record<string, unknown> = {
    status: { in: ["active", "pending"] },
  };

  // Agent scoping: agents see only their own leases; brokers see all
  if (auth.role !== "BROKER") {
    leaseWhere.agent_id = auth.userId;
  }

  const leases = await prisma.activeLease.findMany({
    where: leaseWhere,
    include: {
      landlord: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
          entity_name: true,
          entity_type: true,
          annual_income: true,
          seller_potential: true,
        },
      },
      tenant: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
          annual_income: true,
          bonuses: true,
          credit_score_range: true,
          monthly_debt: true,
          down_payment: true,
          available_funds: true,
          pre_approved: true,
          pre_approved_amount: true,
        },
      },
    },
  });

  if (leases.length === 0) {
    return NextResponse.json(
      serializeBigInts({
        properties: [],
        summary: {
          total_properties: 0,
          rented: 0,
          vacant: 0,
          expiring_6mo: 0,
          expiring_90d: 0,
          expiring_30d: 0,
          dual_listed: 0,
          opportunities: 0,
          high_priority: 0,
        },
      })
    );
  }

  // ── 2. Fetch listings for all landlords in scope ─────────────────────────
  const landlordIds = [...new Set(leases.map((l) => l.landlord_lead_id))];

  const listings = await prisma.listing.findMany({
    where: {
      owner_client_id: { in: landlordIds },
      status: { in: ["Active", "Coming Soon"] },
    },
    select: {
      id: true,
      listing_id: true,
      listing_type: true,
      list_price: true,
      status: true,
      property_type: true,
      owner_client_id: true,
      address: true,
      created_at: true,
    },
  });

  // ── 3. Build property objects ─────────────────────────────────────────────
  const now = Date.now();

  const properties = leases.map((lease) => {
    // Tenant object
    const tenantData = lease.tenant
      ? {
          id: lease.tenant.id,
          name: `${lease.tenant.first_name} ${lease.tenant.last_name}`.trim(),
          email: lease.tenant.email,
          phone: lease.tenant.phone,
          annual_income: lease.tenant.annual_income,
          bonuses: lease.tenant.bonuses ?? null,
          credit_score_range: lease.tenant.credit_score_range ?? null,
          monthly_debt: lease.tenant.monthly_debt ?? null,
          down_payment: lease.tenant.down_payment ?? null,
          available_funds: lease.tenant.available_funds ?? null,
          pre_approved: lease.tenant.pre_approved ?? null,
          pre_approved_amount: lease.tenant.pre_approved_amount ?? null,
        }
      : lease.tenant_name
      ? {
          id: null,
          name: lease.tenant_name,
          email: lease.tenant_email ?? null,
          phone: lease.tenant_phone ?? null,
          annual_income: null,
          bonuses: null,
          credit_score_range: null,
          monthly_debt: null,
          down_payment: null,
          available_funds: null,
          pre_approved: null,
          pre_approved_amount: null,
        }
      : null;

    // Financial qualification (co-op, condo, rental)
    const qualification = tenantData && tenantData.annual_income
      ? calculateQualification(
          {
            annual_income: Number(tenantData.annual_income),
            bonuses: tenantData.bonuses ? Number(tenantData.bonuses) : null,
            monthly_debt: tenantData.monthly_debt ? Number(tenantData.monthly_debt) : null,
            down_payment: tenantData.down_payment ? Number(tenantData.down_payment) : null,
            available_funds: tenantData.available_funds ? Number(tenantData.available_funds) : null,
            credit_score_range: tenantData.credit_score_range,
            pre_approved: tenantData.pre_approved,
            pre_approved_amount: tenantData.pre_approved_amount ? Number(tenantData.pre_approved_amount) : null,
          },
          lease.monthly_rent ? Number(lease.monthly_rent) : null
        )
      : null;

    // Listings belonging to this landlord
    const propertyListings = listings.filter(
      (l) =>
        l.owner_client_id !== null &&
        l.owner_client_id === lease.landlord_lead_id
    );

    const hasRentalListing = propertyListings.some(
      (l) => l.listing_type === "rent" && l.status === "Active"
    );
    const hasSaleListing = propertyListings.some(
      (l) => l.listing_type === "sale" && l.status === "Active"
    );

    // Status
    let status: string;
    if (hasRentalListing && hasSaleListing) {
      status = "dual_listed";
    } else if (hasSaleListing) {
      status = "listed_sale";
    } else if (hasRentalListing) {
      status = "listed_rent";
    } else if (tenantData) {
      status = "rented";
    } else {
      status = "vacant";
    }

    // Lease timing
    const daysUntilExpiry = Math.ceil(
      (lease.lease_end_date.getTime() - now) / 86400000
    );
    const urgency = getUrgency(daysUntilExpiry);

    // Opportunity flags
    const flags: string[] = [];
    const annualIncome = tenantData?.annual_income
      ? Number(tenantData.annual_income)
      : null;
    if (annualIncome !== null && annualIncome > 150000) {
      flags.push("high_income_tenant");
    }
    if (daysUntilExpiry <= 90) flags.push("expiring_soon");
    if (!tenantData) flags.push("vacant");
    if (status === "dual_listed") flags.push("dual_listed");

    // ── AI prediction scores ─────────────────────────────────────────────────
    const isVacant = !tenantData;
    const hasActiveListing = hasRentalListing || hasSaleListing;

    // Count how many active leases this landlord has (as a portfolio proxy)
    const landlordLeaseCount = leases.filter(
      (l) => l.landlord_lead_id === lease.landlord_lead_id
    ).length;

    const landlord_sell = predictLandlordSell(
      lease.landlord,
      {
        lease_start_date: lease.lease_start_date,
        lease_end_date: lease.lease_end_date,
        monthly_rent: lease.monthly_rent,
        seller_comps_6mo_sent_at: lease.seller_comps_6mo_sent_at,
        outreach_90d_sent_at: lease.outreach_90d_sent_at,
      },
      landlordLeaseCount,
      isVacant,
      hasSaleListing
    );

    const tenant_buy = predictTenantBuy(
      lease.tenant
        ? {
            annual_income: lease.tenant.annual_income,
            credit_score_range: lease.tenant.credit_score_range,
            pre_approved: null,
            last_sales_email_opened: null,
          }
        : null,
      lease.monthly_rent,
      lease.lease_start_date
    );

    const lease_renewal = predictLeaseRenewal(
      {
        monthly_rent: lease.monthly_rent,
        lease_start_date: lease.lease_start_date,
        lease_end_date: lease.lease_end_date,
        lease_type: lease.lease_type,
        renewal_status: lease.renewal_status,
        last_rent_increase_pct: null,
      },
      annualIncome
    );

    const outreach_timing = predictOutreachTiming(
      {
        lease_end_date: lease.lease_end_date,
        outreach_90d_sent_at: lease.outreach_90d_sent_at,
        outreach_60d_sent_at: lease.outreach_60d_sent_at,
        outreach_30d_sent_at: lease.outreach_30d_sent_at,
        seller_comps_6mo_sent_at: lease.seller_comps_6mo_sent_at,
      },
      isVacant,
      hasActiveListing
    );

    const priority_score = Math.round(
      (landlord_sell.score + tenant_buy.score + lease_renewal.score + outreach_timing.score) / 4
    );

    return {
      id: lease.id,
      address: lease.address,
      unit: lease.unit ?? null,
      borough: lease.borough ?? null,
      neighborhood: lease.neighborhood ?? null,
      zip: lease.zip ?? null,
      building_type: lease.building_type ?? null,

      landlord: {
        id: lease.landlord.id,
        name: `${lease.landlord.first_name} ${lease.landlord.last_name}`.trim(),
        email: lease.landlord.email,
        phone: lease.landlord.phone,
        entity_name: lease.landlord.entity_name ?? null,
        entity_type: lease.landlord.entity_type ?? null,
        seller_potential: lease.landlord.seller_potential ?? null,
      },

      tenant: tenantData,

      lease: {
        id: lease.id,
        start_date: lease.lease_start_date,
        end_date: lease.lease_end_date,
        monthly_rent: lease.monthly_rent,
        lease_type: lease.lease_type,
        renewal_status: lease.renewal_status,
        days_until_expiry: daysUntilExpiry,
        urgency,
      },

      listings: propertyListings,

      status,

      outreach: {
        landlord_6mo_sent: !!lease.seller_comps_6mo_sent_at,
        landlord_90d_sent: !!lease.outreach_90d_sent_at,
        landlord_60d_sent: !!lease.outreach_60d_sent_at,
        landlord_30d_sent: !!lease.outreach_30d_sent_at,
        landlord_6mo_date: lease.seller_comps_6mo_sent_at ?? null,
        landlord_90d_date: lease.outreach_90d_sent_at ?? null,
        landlord_60d_date: lease.outreach_60d_sent_at ?? null,
        landlord_30d_date: lease.outreach_30d_sent_at ?? null,
      },

      flags,

      predictions: {
        landlord_sell,
        tenant_buy,
        lease_renewal,
        outreach_timing,
      },

      qualification,

      priority_score,
    };
  });

  // ── 4. Apply filters ──────────────────────────────────────────────────────

  let filtered = properties;

  // View filter
  switch (view) {
    case "expiring":
      filtered = filtered.filter((p) => p.lease.days_until_expiry <= 180);
      break;
    case "vacant":
      filtered = filtered.filter((p) => p.status === "vacant");
      break;
    case "dual_listed":
      filtered = filtered.filter((p) => p.status === "dual_listed");
      break;
    case "opportunities":
      filtered = filtered.filter((p) => p.flags.length > 0);
      break;
    // "all" — no additional filter
  }

  // Urgency filter (applied after view filter)
  if (urgencyFilter) {
    const urgencyOrder: Record<UrgencyLevel, number> = {
      "30d": 1,
      "60d": 2,
      "90d": 3,
      "6mo": 4,
      ok: 5,
    };
    const maxOrder = urgencyOrder[urgencyFilter];
    filtered = filtered.filter(
      (p) => urgencyOrder[p.lease.urgency as UrgencyLevel] <= maxOrder
    );
  }

  // Sort: highest priority first (descending priority_score)
  filtered.sort((a, b) => b.priority_score - a.priority_score);

  // ── 5. Summary counts (computed from full unfiltered set) ─────────────────
  const summary = {
    total_properties: properties.length,
    rented: properties.filter((p) => p.status === "rented").length,
    vacant: properties.filter((p) => p.status === "vacant").length,
    expiring_6mo: properties.filter((p) => isExpiringSoon(p.lease.urgency as UrgencyLevel)).length,
    expiring_90d: properties.filter(
      (p) =>
        p.lease.urgency !== "ok" && p.lease.urgency !== "6mo"
    ).length,
    expiring_30d: properties.filter((p) => p.lease.urgency === "30d").length,
    dual_listed: properties.filter((p) => p.status === "dual_listed").length,
    opportunities: properties.filter((p) => p.flags.length > 0).length,
    high_priority: properties.filter((p) => p.priority_score >= 70).length,
  };

  return NextResponse.json(
    serializeBigInts({
      properties: filtered,
      summary,
    })
  );
}
