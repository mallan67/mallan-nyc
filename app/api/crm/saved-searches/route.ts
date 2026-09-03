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
import { normalizeSavedSearchCriteria, savedSearchDisposition } from "@/lib/search/canonical/saved-search-normalizer";
import {
  canEnableAlertForCriteria,
  criteriaToProjectionWhere,
  getUnsupportedSearchCriteria,
  isPlainSearchCriteria,
} from "@/lib/search/criteria-to-prisma";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

type SavedSearchCountStatus = "projection_live" | "unsupported_criteria" | "invalid_criteria";

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

    const countCache = new Map<string, Promise<number>>();

    const serialized = await Promise.all(searches.map(async (s) => {
      // Legacy rows are normalized IN MEMORY on read. Nothing is rewritten or
      // backfilled — this is a read-boundary compatibility correction, not a
      // migration.
      const rawCriteria = isPlainSearchCriteria(s.criteria) ? s.criteria : null;
      const criteria = rawCriteria
        ? (normalizeSavedSearchCriteria(rawCriteria).criteria as typeof rawCriteria)
        : null;
      const unsupportedCriteria = criteria ? getUnsupportedSearchCriteria(criteria) : [];
      const countStatus: SavedSearchCountStatus = !criteria
        ? "invalid_criteria"
        : unsupportedCriteria.length > 0
          ? "unsupported_criteria"
          : "projection_live";

      let projectionCount: number | null = null;
      if (countStatus === "projection_live" && criteria) {
        const cacheKey = stableStringify(criteria);
        let countPromise = countCache.get(cacheKey);
        if (!countPromise) {
          const where = criteriaToProjectionWhere(criteria);
          countPromise = prisma.listingSearchProjection.count({ where });
          countCache.set(cacheKey, countPromise);
        }
        projectionCount = await countPromise;
      }

      // Serialize BigInt
      return {
        ...s,
        id: s.id.toString(),
        agent_id: s.agent_id?.toString() ?? null,
        lead_id: s.lead_id?.toString() ?? null,
        alert_frequency: s.alert_frequency ?? null,
        alert_enabled: s.alert_enabled ?? false,
        result_count: s.result_count ?? null,
        projection_count: projectionCount,
        live_result_count: projectionCount,
        count_status: countStatus,
        // Execution disposition travels with each row so the client can refuse
        // to auto-run a record whose meaning cannot be fully represented.
        ...savedSearchDisposition(s.criteria),
        unsupported_criteria: unsupportedCriteria.length > 0 ? unsupportedCriteria : null,
        invalid_criteria: criteria ? null : true,
      };
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

    // Codex Risk P0 fix: reject null, arrays, and non-objects with a clear
    // 400 (typeof null === "object" + Array.isArray are JS pitfalls; the
    // prior `!criteria || typeof !== "object"` guard let arrays through).
    if (
      !criteria ||
      Array.isArray(criteria) ||
      typeof criteria !== "object"
    ) {
      return NextResponse.json(
        { error: "criteria must be a plain JSON object (not null, not an array)" },
        { status: 400 },
      );
    }

    // CANONICALISE AT THE PERSISTENCE BOUNDARY.
    //
    // Execution became canonical in Tranche 1; storage did not, so a saved
    // search was a SECOND TRUTH written in provider vocabulary. Everything
    // below — validation, the alert gate, and the persisted row — now sees the
    // same canonical criteria the executor will see, so a reload cannot mean
    // something different from the save.
    const normalized = normalizeSavedSearchCriteria(criteria);
    const canonicalCriteria = normalized.criteria;

    // FAIL CLOSED ON A CRITERION WE CANNOT REPRESENT.
    //
    // The normalizer reports malformed/unknown/unavailable criteria; earlier
    // this route ignored that and persisted anyway, so a saved search whose
    // meaning could not be represented was stored as a BROADER search. A new
    // Saved Search must not be accepted if its meaning cannot be carried.
    if (normalized.hasUnresolved) {
      const cb = normalized.checkboxes;
      return NextResponse.json(
        {
          error: "Saved Search contains criteria that cannot be represented.",
          code: "UNSUPPORTED_CRITERION",
          criterion: "checkbox_filters",
          unsupportedValues: [...cb.malformed, ...cb.unknown, ...cb.unavailable],
          malformed: cb.malformed,
          unknown: cb.unknown,
          unavailable: cb.unavailable,
        },
        { status: 400 },
      );
    }

    const validationError = validateCriteria(canonicalCriteria);
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

    // P0-3 alert-gate: refuse to enable an alert when the saved-search
    // criteria contain keys the projection-backed alert engine does not
    // support. Without this gate the cron at app/api/cron/search-alerts
    // would silently send mail derived from a strict subset of the
    // criteria the agent saw in /crm/search (Engine A vs Engine B
    // divergence). See lib/search/criteria-to-prisma.ts canEnableAlertForCriteria.
    const wantAlert = Boolean(alert_frequency) && alert_enabled !== false;
    if (wantAlert) {
      const gate = canEnableAlertForCriteria(canonicalCriteria);
      if (!gate.ok) {
        return NextResponse.json(
          {
            error: gate.message,
            code: gate.code,
            unsupported_criteria: gate.unsupported,
          },
          { status: 422 },
        );
      }
    }

    const search = await prisma.savedSearch.create({
      data: {
        name: name.trim(),
        criteria: canonicalCriteria as Prisma.InputJsonValue,
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
