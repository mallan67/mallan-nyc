// GET /api/crm/saved-searches/[id] — get a single saved search
// PATCH /api/crm/saved-searches/[id] — update saved search
// DELETE /api/crm/saved-searches/[id] — delete saved search
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
import { canEnableAlertForCriteria } from "@/lib/search/criteria-to-prisma";
import { normalizeSavedSearchCriteria, savedSearchDisposition } from "@/lib/search/canonical/saved-search-normalizer";

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

    return NextResponse.json({
      id: search.id.toString(),
      name: search.name,
      // Legacy rows normalized IN MEMORY. No rewrite, no backfill.
      criteria: normalizeSavedSearchCriteria(search.criteria).criteria,
      // The disposition travels WITH the record. Returning only normalized
      // criteria threw away the unresolved state, and the client then
      // auto-executed a record whose meaning could not be fully represented.
      ...savedSearchDisposition(search.criteria),
      last_run: search.last_run,
      result_count: search.result_count,
      agent_id: search.agent_id?.toString() ?? null,
      lead_id: search.lead_id?.toString() ?? null,
      alert_frequency: search.alert_frequency ?? null,
      alert_enabled: search.alert_enabled ?? false,
      created_at: search.created_at,
      updated_at: search.updated_at,
    });
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

    if (body.criteria !== undefined) {
      // Codex Risk P0 fix: tighten criteria validation. The prior
      // `typeof body.criteria !== "object"` check incorrectly accepted
      // null (typeof null === "object" in JS) and arrays (typeof [] ===
      // "object") and treated them as valid criteria. Both shapes break
      // every downstream consumer (criteriaToProjectionWhere, alert gate,
      // _criteriaToFormFields). Reject all three with a clear 400.
      if (
        body.criteria === null ||
        Array.isArray(body.criteria) ||
        typeof body.criteria !== "object"
      ) {
        return NextResponse.json(
          { error: "criteria must be a plain JSON object (not null, not an array)" },
          { status: 400 },
        );
      }
      // Persist the CANONICAL form, so storage and execution stay one truth.
      updates.criteria = normalizeSavedSearchCriteria(body.criteria).criteria as Prisma.InputJsonValue;
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

    // P0-3 alert-gate: re-evaluate the gate against the EFFECTIVE state —
    // existing row + the patch. Both `criteria` and the alert-enable
    // toggles can change in a single PATCH, so we have to combine them
    // before deciding. If the post-patch row would have alerts enabled
    // AND criteria is unsupported, refuse the change. Untouched fields
    // fall back to their existing values.
    // BOTH SIDES THROUGH THE SAME NORMALIZER.
    //
    // This previously chose raw `body.criteria` OR raw `existing.criteria`, so
    // the alert gate could be handed two different vocabularies depending on
    // whether the caller happened to send criteria — an incoming canonical
    // patch judged against a legacy stored row, or the reverse. Normalising
    // both makes the gate's decision independent of which branch was taken.
    const effectiveNormalized = normalizeSavedSearchCriteria(
      body.criteria !== undefined ? body.criteria : existing.criteria,
    );
    const effectiveCriteria = effectiveNormalized.criteria;

    // FAIL CLOSED ON A CRITERION WE CANNOT REPRESENT.
    //
    // The normalizer reports malformed/unknown/unavailable criteria; earlier
    // this route ignored that and persisted anyway, so a saved search whose
    // meaning could not be represented was stored as a BROADER search. A new
    // Saved Search must not be accepted if its meaning cannot be carried.
    if (effectiveNormalized.hasUnresolved) {
      const cb = effectiveNormalized.checkboxes;
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

    const effectiveAlertFrequency =
      body.alert_frequency !== undefined ? (body.alert_frequency as string | null) : existing.alert_frequency ?? null;
    const effectiveAlertEnabled =
      body.alert_enabled !== undefined ? Boolean(body.alert_enabled) : Boolean(existing.alert_enabled);
    const wouldHaveAlertOn = Boolean(effectiveAlertFrequency) && effectiveAlertEnabled !== false;
    if (wouldHaveAlertOn) {
      const gate = canEnableAlertForCriteria(effectiveCriteria || {});
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

    const updated = await prisma.savedSearch.update({
      where: { id: BigInt(id) },
      data: updates,
    });

    await logAuditEvent("update", "saved_search", id, auth, body);

    return NextResponse.json({
      id: updated.id.toString(),
      name: updated.name,
      criteria: normalizeSavedSearchCriteria(updated.criteria).criteria,
      updated_at: updated.updated_at,
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
