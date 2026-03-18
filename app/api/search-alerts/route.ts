// POST /api/search-alerts
// Public endpoint — visitors can save search criteria with their email
// to receive daily/weekly new listing alerts.
// Creates a Lead (or finds existing) + SavedSearch with alert_enabled=true.
// TCPA: requires explicit consent. CAN-SPAM: includes unsubscribe.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, frequency, criteria, consentOptIn, consentSource } = body;

    // Validate required fields
    if (!email || !criteria) {
      return NextResponse.json(
        { error: "Email and search criteria are required" },
        { status: 400 }
      );
    }

    // TCPA: require explicit opt-in consent for email alerts
    if (!consentOptIn) {
      return NextResponse.json(
        { error: "Explicit consent is required to receive email alerts" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address" },
        { status: 400 }
      );
    }

    // Validate frequency
    const validFrequencies = ["daily", "weekly"];
    const alertFrequency = validFrequencies.includes(frequency) ? frequency : "daily";

    // Validate criteria has at least listing_type
    if (!criteria.listing_type && !criteria.type) {
      return NextResponse.json(
        { error: "Search criteria must include a listing type (sale or rent)" },
        { status: 400 }
      );
    }

    // Normalize criteria
    const normalizedCriteria: Record<string, unknown> = {};
    if (criteria.type || criteria.listing_type) {
      const t = criteria.type || criteria.listing_type;
      normalizedCriteria.listing_type = t === "buy" ? "sale" : t;
    }
    if (criteria.borough) normalizedCriteria.borough = String(criteria.borough);
    if (criteria.neighborhood) normalizedCriteria.neighborhoods = [String(criteria.neighborhood)];
    if (criteria.neighborhoods) normalizedCriteria.neighborhoods = criteria.neighborhoods;
    if (criteria.minPrice) normalizedCriteria.min_price = Number(criteria.minPrice);
    if (criteria.maxPrice && Number(criteria.maxPrice) < 99999999) normalizedCriteria.max_price = Number(criteria.maxPrice);
    if (criteria.beds != null && Number(criteria.beds) >= 0) normalizedCriteria.min_beds = Number(criteria.beds);
    if (criteria.minBaths) normalizedCriteria.min_baths = Number(criteria.minBaths);
    if (criteria.minSqft) normalizedCriteria.min_sqft = Number(criteria.minSqft);
    if (criteria.propertyType) normalizedCriteria.property_type = [criteria.propertyType];

    // Parse name
    const nameParts = (name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Upsert lead
    const sanitizedEmail = email.toLowerCase().trim();
    const lead = await prisma.lead.upsert({
      where: { email: sanitizedEmail },
      create: {
        first_name: firstName,
        last_name: lastName,
        email: sanitizedEmail,
        phone: "",
        roles: ["buyer"],
        status: "new",
        source: "search_alert",
        consent_captured_at: new Date(),
      },
      update: {
        consent_captured_at: new Date(),
        updated_at: new Date(),
      },
    });

    // Build a readable name for the saved search
    const searchName = buildSearchName(normalizedCriteria);

    // Create saved search with alerts enabled
    const savedSearch = await prisma.savedSearch.create({
      data: {
        lead_id: lead.id,
        name: searchName,
        criteria: normalizedCriteria as Prisma.InputJsonValue,
        alert_frequency: alertFrequency,
        alert_enabled: true,
        alert_email: sanitizedEmail,
      },
    });

    // Audit — record consent details for TCPA compliance
    await prisma.auditEvent.create({
      data: {
        action: "search_alert_created",
        entity_type: "saved_search",
        entity_id: savedSearch.id.toString(),
        user_type: "public",
        user_id: null,
        changes: {
          email: sanitizedEmail,
          frequency: alertFrequency,
          criteria: normalizedCriteria as Prisma.InputJsonValue,
          consent_opt_in: true,
          consent_source: consentSource || "search_alert_form",
          consent_method: "checkbox",
          consent_captured_at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      message: `You'll receive ${alertFrequency} email alerts for new listings matching your search.`,
      searchId: savedSearch.id.toString(),
    });
  } catch (err) {
    console.error("[/api/search-alerts] Error:", err);
    return NextResponse.json(
      { error: "Failed to save search alert. Please try again." },
      { status: 500 }
    );
  }
}

function buildSearchName(criteria: Record<string, unknown>): string {
  const parts: string[] = [];

  const type = criteria.listing_type === "sale" ? "For Sale" : "For Rent";
  parts.push(type);

  if (criteria.borough) parts.push(String(criteria.borough));
  if (criteria.neighborhoods && Array.isArray(criteria.neighborhoods) && criteria.neighborhoods.length > 0) {
    parts.push(criteria.neighborhoods.slice(0, 2).join(", "));
  }

  if (criteria.min_beds) parts.push(`${criteria.min_beds}+ bed`);

  if (criteria.min_price || criteria.max_price) {
    const min = criteria.min_price ? `$${Number(criteria.min_price).toLocaleString()}` : "";
    const max = criteria.max_price ? `$${Number(criteria.max_price).toLocaleString()}` : "";
    if (min && max) parts.push(`${min}-${max}`);
    else if (min) parts.push(`${min}+`);
    else if (max) parts.push(`Up to ${max}`);
  }

  return parts.join(" · ") || "All Listings";
}
