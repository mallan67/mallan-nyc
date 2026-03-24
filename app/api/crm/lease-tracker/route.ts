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
          credit_score_range: true,
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
          credit_score_range: lease.tenant.credit_score_range ?? null,
        }
      : lease.tenant_name
      ? {
          id: null,
          name: lease.tenant_name,
          email: lease.tenant_email ?? null,
          phone: lease.tenant_phone ?? null,
          annual_income: null,
          credit_score_range: null,
        }
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

  // Sort: expiring soonest first (ascending days_until_expiry)
  filtered.sort((a, b) => a.lease.days_until_expiry - b.lease.days_until_expiry);

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
  };

  return NextResponse.json(
    serializeBigInts({
      properties: filtered,
      summary,
    })
  );
}
