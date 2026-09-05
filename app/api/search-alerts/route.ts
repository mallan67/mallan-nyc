// POST /api/search-alerts
// Public endpoint — visitors can save search criteria with their email
// to receive daily/weekly new listing alerts.
// Creates a Lead (or finds existing) + SavedSearch with alert_enabled=true.
// TCPA: requires explicit consent. CAN-SPAM: includes unsubscribe.
//
// Search Consolidation Packet 2: the row this endpoint writes is consumed by the SAME alert
// cron as agent-saved searches, so it must satisfy the same canonical contract. The public
// payload (type / borough / neighborhood / minPrice / maxPrice / beds / minBaths /
// propertyType …) is converted by the shared deterministic conversion in
// lib/search/canonical/saved-search.ts — the independent normalizer this route carried is
// gone. A criterion the Search executor cannot reproduce exactly is refused by name; no
// alert is ever created for a broader search than the visitor asked for.
// Public Search itself is NOT merged into Agent Search: only the stored alert row is shared.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { checkRouteRateLimit, extractClientIp } from "@/lib/middleware/rate-limiter";
import { createInquiry } from "@/lib/inquiries/create";
import {
  CRITERIA_VERSION,
  describeSavedParams,
  legacyToParams,
  refusalReasons,
  savedCriteriaFromExecuted,
} from "@/lib/search/engine/saved-search";

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10/hr/IP. Search-alert subscribes write both a Lead and a
    // SavedSearch row; strict cap because each signup enters a recurring email
    // cadence (cron/search-alerts fires daily).
    const ip = extractClientIp(request.headers);
    if (!(await checkRouteRateLimit(ip, 'alert', 10, 3600))) {
      return NextResponse.json(
        { error: 'Too many alert subscriptions. Please try again in an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
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
    if (typeof criteria !== "object" || Array.isArray(criteria) || (!criteria.listing_type && !criteria.type)) {
      return NextResponse.json(
        { error: "Search criteria must include a listing type (sale or rent)" },
        { status: 400 }
      );
    }

    // Shared conversion → the executor's own validation. Fail loud by name.
    const converted = legacyToParams(criteria as Record<string, unknown>);
    if (!converted.ok) {
      return NextResponse.json(
        { error: "This alert cannot be created because the search cannot be reproduced exactly: " + converted.reasons.join("; "), code: "unsupported_criteria", reasons: converted.reasons },
        { status: 400 }
      );
    }
    const saved = savedCriteriaFromExecuted(converted.params);
    if (!saved.ok) {
      const reasons = refusalReasons(saved.refusal);
      return NextResponse.json(
        { error: "This alert cannot be created because the search cannot be reproduced exactly: " + reasons.join("; "), code: "unsupported_criteria", reasons },
        { status: 400 }
      );
    }
    const canonical = saved.criteria;

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
    const searchName = describeSavedParams(canonical.params);

    // Create saved search with alerts enabled — the same stored contract agent searches use
    const savedSearch = await prisma.savedSearch.create({
      data: {
        lead_id: lead.id,
        name: searchName,
        criteria: canonical as unknown as Prisma.InputJsonValue,
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
          criteria: canonical as unknown as Prisma.InputJsonValue,
          criteria_version: CRITERIA_VERSION,
          submitted_criteria: criteria as Prisma.InputJsonValue,
          conversion: converted.mapped,
          consent_opt_in: true,
          consent_source: consentSource || "search_alert_form",
          consent_method: "checkbox",
          consent_captured_at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    // Real Inquiry row (Workstream C1 of master refactor). Never throws.
    await createInquiry({
      source: "search_alert",
      leadId: lead.id,
      email: lead.email,
      firstName,
      lastName,
      userAgent: request.headers.get("user-agent"),
      rawClientIp: ip,
      metadata: {
        saved_search_id: savedSearch.id.toString(),
        alert_frequency: alertFrequency,
        criteria: canonical,
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
