// GET /api/crm/saved-searches — list the agent's saved searches
// POST /api/crm/saved-searches — save the parameters of a Search that executed
//
// Search Consolidation Packet 2: a saved search stores the canonical executor parameters
// (lib/search/engine/saved-search.ts). Its count comes from the SAME executor as live
// Agent Search and alerts, stamped when the search is saved or run — the list never settles
// universes on load (an honest stored count + explicit refresh, not a hidden second matcher).
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
import {
  CRITERIA_VERSION,
  isSavedSearchCriteria,
  resolveStoredCriteria,
} from "@/lib/search/engine/saved-search";
import { CRITERIA_CONTRACT_ERROR, serializeSavedSearch, stampedCount } from "@/lib/search/saved-search-read";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const searches = await prisma.savedSearch.findMany({
      where: { agent_id: auth.userId },
      orderBy: { updated_at: "desc" },
    });
    const serialized = searches.map((s) => serializeSavedSearch(s, resolveStoredCriteria(s.criteria)));
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

    // null / arrays / non-objects are refused with a clear 400 (Codex Risk P0), and so is any
    // object that is not the versioned executor-parameter contract.
    if (!criteria || Array.isArray(criteria) || typeof criteria !== "object") {
      return NextResponse.json(
        { error: "criteria must be a plain JSON object (not null, not an array)" },
        { status: 400 },
      );
    }
    if (!isSavedSearchCriteria(criteria)) {
      return NextResponse.json({ error: CRITERIA_CONTRACT_ERROR, code: "criteria_contract", criteria_version: CRITERIA_VERSION }, { status: 400 });
    }
    const resolved = resolveStoredCriteria(criteria);
    if (resolved.state === "invalid") {
      return NextResponse.json(
        { error: "These criteria cannot be executed by Search: " + resolved.reasons.join("; "), code: "unsupported_criteria", reasons: resolved.reasons, unsupported: resolved.unsupported, invalid: resolved.invalid },
        { status: 422 },
      );
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

    // The count is the executor's total for exactly these parameters — the same membership
    // live Search showed and the alert cron will match.
    const count = await stampedCount(resolved);

    const search = await prisma.savedSearch.create({
      data: {
        name: name.trim(),
        criteria: { criteria_version: CRITERIA_VERSION, params: resolved.params } as Prisma.InputJsonValue,
        agent_id: auth.userId,
        lead_id: leadAccess?.leadId ?? null,
        alert_frequency: alert_frequency ?? null,
        alert_enabled: alert_frequency ? Boolean(alert_enabled !== false) : false,
        result_count: count.result_count,
        last_run: count.last_run,
      },
    });

    await logAuditEvent("create", "saved_search", search.id.toString(), auth, {
      name: search.name,
      criteria_version: CRITERIA_VERSION,
      params: resolved.params,
      result_count: count.result_count,
      count_status: count.count_status,
    });

    return NextResponse.json({
      id: search.id.toString(),
      name: search.name,
      criteria: search.criteria,
      criteria_state: "current",
      executable_params: resolved.params,
      alert_frequency: search.alert_frequency ?? null,
      alert_enabled: search.alert_enabled ?? false,
      lead_id: search.lead_id?.toString() ?? null,
      result_count: search.result_count ?? null,
      last_run: search.last_run,
      count_status: count.count_status,
      count_detail: count.detail ?? null,
      created_at: search.created_at,
    }, { status: 201 });
  } catch (err) {
    console.error("Create saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
