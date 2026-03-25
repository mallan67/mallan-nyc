/**
 * /api/crm/sales/prospects/[id]/outreach
 *
 * GET  — List all cadence steps for a prospect (ordered by day_offset)
 * POST — Add custom step OR update an existing step (?action=update&stepId=X)
 *
 * TCPA guard: consent_captured_at OR consent_given must be true before marking "sent".
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";
import { safeJson } from "@/lib/api/safe-json";

type RouteParams = { params: Promise<{ id: string }> };

// ── Helper: load prospect with ownership check ──────────────────────────
async function loadProspect(
  prospectId: bigint,
  auth: { userId: bigint; role: string },
) {
  return prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
  });
}

// ── Helper: TCPA consent check ──────────────────────────────────────────
function hasConsent(prospect: {
  consent_captured_at: Date | null;
  consent_given: boolean;
}): boolean {
  return !!(prospect.consent_captured_at || prospect.consent_given);
}

// ═══════════════════════════════════════════════════════════════════════════
// GET — List all cadence steps
// ═══════════════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const prospect = await loadProspect(prospectId, auth);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const steps = await prisma.outreachCadenceStep.findMany({
    where: { seller_lead_id: prospectId },
    orderBy: { day_offset: "asc" },
  });

  return NextResponse.json({
    prospect_id: String(prospectId),
    steps: serializeBigInts(steps),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// POST — Add custom step OR update existing step
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const prospect = await loadProspect(prospectId, auth);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");

  // ── Update existing step ────────────────────────────────────────────────
  if (action === "update") {
    const stepIdStr = sp.get("stepId");
    const stepId = safeBigInt(stepIdStr);
    if (!stepId) {
      return NextResponse.json(
        { error: "stepId is required for update action" },
        { status: 400 },
      );
    }

    // Verify step belongs to this prospect
    const step = await prisma.outreachCadenceStep.findFirst({
      where: { id: stepId, seller_lead_id: prospectId },
    });
    if (!step) {
      return NextResponse.json(
        { error: "Cadence step not found" },
        { status: 404 },
      );
    }

    const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
    const { status: newStatus, scheduled_date } = body as Record<string, any>;

    // ── Mark as "sent" ────────────────────────────────────────────────────
    if (newStatus === "sent") {
      // TCPA guard
      if (!hasConsent(prospect)) {
        return NextResponse.json(
          {
            error:
              "Cannot send outreach without TCPA consent. Set consent_captured_at or consent_given first.",
          },
          { status: 403 },
        );
      }

      const now = new Date();

      // Update step
      const updated = await prisma.outreachCadenceStep.update({
        where: { id: stepId },
        data: { status: "sent", sent_at: now },
      });

      // Create OutreachEvent audit record
      await prisma.outreachEvent.create({
        data: {
          seller_lead_id: prospectId,
          channel: step.channel,
          direction: "outbound",
          template_id: step.type,
          subject: step.subject,
          body_preview: step.content_preview
            ? step.content_preview.slice(0, 500)
            : null,
          outcome: "sent",
          consent_verified: true,
          agent_id: auth.userId,
        },
      });

      // Update last_contacted_at on prospect
      await prisma.sellerLead.update({
        where: { id: prospectId },
        data: { last_contacted_at: now },
      });

      await logAuditEvent(
        "seller_outreach_sent",
        "outreach_cadence_step",
        String(stepId),
        auth,
        {
          prospect_id: String(prospectId),
          channel: step.channel,
          type: step.type,
        },
      );

      return NextResponse.json({ step: serializeBigInts(updated) });
    }

    // ── Mark as "skipped" ─────────────────────────────────────────────────
    if (newStatus === "skipped") {
      const updated = await prisma.outreachCadenceStep.update({
        where: { id: stepId },
        data: { status: "skipped" },
      });

      await logAuditEvent(
        "seller_outreach_skipped",
        "outreach_cadence_step",
        String(stepId),
        auth,
        { prospect_id: String(prospectId) },
      );

      return NextResponse.json({ step: serializeBigInts(updated) });
    }

    // ── Reschedule ────────────────────────────────────────────────────────
    if (scheduled_date) {
      const newDate = new Date(scheduled_date);
      if (isNaN(newDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid scheduled_date" },
          { status: 400 },
        );
      }

      const updated = await prisma.outreachCadenceStep.update({
        where: { id: stepId },
        data: { scheduled_date: newDate, status: "pending" },
      });

      await logAuditEvent(
        "seller_outreach_rescheduled",
        "outreach_cadence_step",
        String(stepId),
        auth,
        { prospect_id: String(prospectId), new_date: newDate.toISOString() },
      );

      return NextResponse.json({ step: serializeBigInts(updated) });
    }

    return NextResponse.json(
      { error: "Provide status ('sent' | 'skipped') or scheduled_date" },
      { status: 400 },
    );
  }

  // ── Add custom step ─────────────────────────────────────────────────────
  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const {
    day_offset,
    channel,
    subject,
    type: stepType,
    content_preview,
  } = body as Record<string, any>;

  if (day_offset == null || typeof day_offset !== "number" || day_offset < 0) {
    return NextResponse.json(
      { error: "day_offset is required (non-negative integer)" },
      { status: 400 },
    );
  }

  if (!channel || typeof channel !== "string") {
    return NextResponse.json(
      { error: "channel is required (email | phone | letter | door_knock)" },
      { status: 400 },
    );
  }

  // Compute scheduled_date from prospect creation date + day_offset
  const scheduledDate = new Date(prospect.created_at);
  scheduledDate.setDate(scheduledDate.getDate() + day_offset);

  const step = await prisma.outreachCadenceStep.create({
    data: {
      seller_lead_id: prospectId,
      day_offset,
      type: stepType || "custom",
      channel,
      subject: subject || null,
      content_preview: content_preview || null,
      status: "pending",
      scheduled_date: scheduledDate,
    },
  });

  await logAuditEvent(
    "seller_outreach_step_added",
    "outreach_cadence_step",
    String(step.id),
    auth,
    {
      prospect_id: String(prospectId),
      day_offset,
      channel,
      type: stepType || "custom",
    },
  );

  return NextResponse.json({ step: serializeBigInts(step) }, { status: 201 });
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE — Delete a cadence step (?stepId=X) or all steps (?all=true)
// ═══════════════════════════════════════════════════════════════════════════

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const prospect = await loadProspect(prospectId, auth);
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const stepIdStr = sp.get("stepId");
  const clearAll = sp.get("all") === "true";

  if (clearAll) {
    const result = await prisma.outreachCadenceStep.deleteMany({
      where: { seller_lead_id: prospectId },
    });

    await logAuditEvent(
      "seller_outreach_steps_cleared",
      "seller_lead",
      String(prospectId),
      auth,
      { deleted_count: result.count },
    );

    return NextResponse.json({ success: true, deleted: result.count });
  }

  if (stepIdStr) {
    const stepId = safeBigInt(stepIdStr);
    if (!stepId) {
      return NextResponse.json({ error: "Invalid stepId" }, { status: 400 });
    }

    const step = await prisma.outreachCadenceStep.findFirst({
      where: { id: stepId, seller_lead_id: prospectId },
    });
    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    await prisma.outreachCadenceStep.delete({ where: { id: stepId } });

    await logAuditEvent(
      "seller_outreach_step_deleted",
      "outreach_cadence_step",
      String(stepId),
      auth,
      { prospect_id: String(prospectId) },
    );

    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Provide ?stepId=X or ?all=true" },
    { status: 400 },
  );
}
