// GET /api/crm/saved-searches/[id] — get a single saved search
// PATCH /api/crm/saved-searches/[id] — update saved search
// DELETE /api/crm/saved-searches/[id] — delete saved search
//
// Search Consolidation Packet 2: criteria are the canonical executor parameters. A legacy row
// is resolved at read time; the first authorized update persists its canonical form.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { assertLeadIdStringAccess } from "@/lib/crm/access";
import {
  CRITERIA_VERSION,
  isSavedSearchCriteria,
  resolveStoredCriteria,
  type ResolvedSavedSearch,
} from "@/lib/search/engine/saved-search";
import { CRITERIA_CONTRACT_ERROR, serializeSavedSearch, stampedCount } from "@/lib/search/saved-search-read";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const search = await prisma.savedSearch.findUnique({
      where: { id: BigInt(id) },
    });

    if (!search) {
      return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    }

    // Ownership check: agent can only see their own, broker can see all
    if (auth.role !== "BROKER" && search.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(serializeSavedSearch(search, resolveStoredCriteria(search.criteria)));
  } catch (err) {
    console.error("Get saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const existing = await prisma.savedSearch.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    }

    if (auth.role !== "BROKER" && existing.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const updates: Prisma.SavedSearchUncheckedUpdateInput = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    let resolved: ResolvedSavedSearch = resolveStoredCriteria(existing.criteria);
    let criteriaChanged = false;
    if (body.criteria !== undefined) {
      // null / arrays / non-objects are refused with a clear 400 (Codex Risk P0); so is any
      // object that is not the versioned executor-parameter contract.
      if (body.criteria === null || Array.isArray(body.criteria) || typeof body.criteria !== "object") {
        return NextResponse.json(
          { error: "criteria must be a plain JSON object (not null, not an array)" },
          { status: 400 },
        );
      }
      if (!isSavedSearchCriteria(body.criteria)) {
        return NextResponse.json({ error: CRITERIA_CONTRACT_ERROR, code: "criteria_contract", criteria_version: CRITERIA_VERSION }, { status: 400 });
      }
      resolved = resolveStoredCriteria(body.criteria);
      if (resolved.state === "invalid") {
        return NextResponse.json(
          { error: "These criteria cannot be executed by Search: " + resolved.reasons.join("; "), code: "unsupported_criteria", reasons: resolved.reasons },
          { status: 422 },
        );
      }
      criteriaChanged = true;
    }

    if (body.alert_frequency !== undefined) {
      if (body.alert_frequency !== null && !["daily", "weekly"].includes(body.alert_frequency as string)) {
        return NextResponse.json({ error: "alert_frequency must be 'daily', 'weekly', or null" }, { status: 400 });
      }
      updates.alert_frequency = (body.alert_frequency as string) ?? null;
    }

    if (body.alert_enabled !== undefined) {
      updates.alert_enabled = Boolean(body.alert_enabled);
    }

    if (body.lead_id !== undefined) {
      if (body.lead_id) {
        const access = await assertLeadIdStringAccess(auth, body.lead_id as string);
        if (access.response) return access.response;
        updates.lead_id = access.leadId;
      } else {
        updates.lead_id = null;
      }
    }

    // An alert may only be on for criteria the executor can reproduce exactly. Evaluate the
    // EFFECTIVE state (existing row + this patch).
    const effectiveAlertFrequency =
      body.alert_frequency !== undefined ? (body.alert_frequency as string | null) : existing.alert_frequency ?? null;
    const effectiveAlertEnabled =
      body.alert_enabled !== undefined ? Boolean(body.alert_enabled) : Boolean(existing.alert_enabled);
    if (Boolean(effectiveAlertFrequency) && effectiveAlertEnabled && resolved.state === "invalid") {
      return NextResponse.json(
        { error: "Alerts cannot be enabled: the stored criteria cannot be executed by Search. Recreate the search. " + resolved.reasons.join("; "), code: "invalid_criteria", reasons: resolved.reasons },
        { status: 422 },
      );
    }

    // Persist the canonical form: on a criteria change, or when a legacy row is updated for
    // any reason (read-time conversion becomes stored form on a normal authorized update).
    if (resolved.state !== "invalid" && (criteriaChanged || resolved.state === "migrated")) {
      updates.criteria = { criteria_version: CRITERIA_VERSION, params: resolved.params } as Prisma.InputJsonValue;
    }
    let countStatus: string | null = null;
    if (criteriaChanged && resolved.state !== "invalid") {
      const count = await stampedCount(resolved);
      updates.result_count = count.result_count;
      updates.last_run = count.last_run;
      countStatus = count.count_status;
    }

    const updated = await prisma.savedSearch.update({
      where: { id: BigInt(id) },
      data: updates,
    });

    await logAuditEvent("update", "saved_search", id, auth, {
      ...body,
      ...(updates.criteria !== undefined ? { criteria_persisted: updates.criteria } : {}),
      ...(countStatus ? { count_status: countStatus } : {}),
    });

    return NextResponse.json({
      ...serializeSavedSearch(updated, resolveStoredCriteria(updated.criteria)),
      count_status_now: countStatus,
    });
  } catch (err) {
    console.error("Update saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;

  try {
    const existing = await prisma.savedSearch.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    }

    if (auth.role !== "BROKER" && existing.agent_id !== auth.userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await prisma.savedSearch.delete({ where: { id: BigInt(id) } });

    await logAuditEvent("delete", "saved_search", id, auth);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete saved search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
