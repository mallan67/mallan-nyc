// GET /api/crm/saved-searches — list agent's saved searches
// POST /api/crm/saved-searches — create a new saved search
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeJson } from "@/lib/api/safe-json";
import { scanTextForFairHousing } from "@/lib/compliance/rls-enforcement";
import { assertLeadIdStringAccess } from "@/lib/crm/access";

/** Validate saved search criteria shape. Returns error message or null. */
function validateCriteria(criteria: Record<string, unknown>): string | null {
  if (!criteria.listing_type || !["sale", "rent", "rental"].includes(criteria.listing_type as string)) {
    return "criteria.listing_type is required and must be 'sale', 'rent', or 'rental'";
  }
  if (criteria.min_price !== undefined) {
    if (typeof criteria.min_price !== "number" || criteria.min_price < 0) {
      return "criteria.min_price must be a positive number";
    }
  }
  if (criteria.max_price !== undefined) {
    if (typeof criteria.max_price !== "number" || criteria.max_price < 0) {
      return "criteria.max_price must be a positive number";
    }
  }
  if (criteria.min_beds !== undefined) {
    if (!Number.isInteger(criteria.min_beds) || (criteria.min_beds as number) < 0) {
      return "criteria.min_beds must be a non-negative integer";
    }
  }
  if (criteria.min_baths !== undefined) {
    if (!Number.isInteger(criteria.min_baths) || (criteria.min_baths as number) < 0) {
      return "criteria.min_baths must be a non-negative integer";
    }
  }
  if (criteria.neighborhoods !== undefined) {
    if (!Array.isArray(criteria.neighborhoods) || !criteria.neighborhoods.every((n: unknown) => typeof n === "string")) {
      return "criteria.neighborhoods must be a string array";
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const searches = await prisma.savedSearch.findMany({
      where: { agent_id: auth.userId },
      orderBy: { updated_at: "desc" },
    });

    // Serialize BigInt
    const serialized = searches.map((s) => ({
      ...s,
      id: s.id.toString(),
      agent_id: s.agent_id?.toString() ?? null,
      lead_id: s.lead_id?.toString() ?? null,
      alert_frequency: s.alert_frequency ?? null,
      alert_enabled: s.alert_enabled ?? false,
    }));

    return NextResponse.json({ savedSearches: serialized, total: serialized.length });
  } catch (err) {
    console.error("List saved searches error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
    const { name, criteria, lead_id, alert_frequency, alert_enabled } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "name is required (non-empty string)" }, { status: 400 });
    }

    if (!criteria || typeof criteria !== "object") {
      return NextResponse.json({ error: "criteria object is required" }, { status: 400 });
    }

    const validationError = validateCriteria(criteria);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const fhViolations = scanTextForFairHousing(name, "name");
    if (fhViolations.length > 0) {
      return NextResponse.json(
        { error: "Fair Housing violation in saved-search name", violations: fhViolations },
        { status: 422 }
      );
    }

    if (alert_frequency !== undefined && alert_frequency !== null && !["daily", "weekly"].includes(alert_frequency)) {
      return NextResponse.json({ error: "alert_frequency must be 'daily', 'weekly', or null" }, { status: 400 });
    }
    const leadAccess = lead_id ? await assertLeadIdStringAccess(auth, lead_id) : null;
    if (leadAccess?.response) return leadAccess.response;

    const search = await prisma.savedSearch.create({
      data: {
        name: name.trim(),
        criteria: criteria as Prisma.InputJsonValue,
        agent_id: auth.userId,
        lead_id: leadAccess?.leadId ?? null,
        alert_frequency: alert_frequency ?? null,
        alert_enabled: alert_frequency ? Boolean(alert_enabled !== false) : false,
      },
    });

    await logAuditEvent("create", "saved_search", search.id.toString(), auth, {
      name: search.name,
    });

    return NextResponse.json({
      id: search.id.toString(),
      name: search.name,
      criteria: search.criteria,
      alert_frequency: search.alert_frequency ?? null,
      alert_enabled: search.alert_enabled ?? false,
      lead_id: search.lead_id?.toString() ?? null,
      created_at: search.created_at,
    }, { status: 201 });
  } catch (err) {
    console.error("Create saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
