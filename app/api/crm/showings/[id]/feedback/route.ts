// /api/crm/showings/[id]/feedback — GET + POST showing feedback
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { submitFeedback } from "@/lib/showing-scheduler/feedback";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const showingId = BigInt(id);

  const showing = await prisma.showing.findUnique({
    where: { id: showingId },
    select: { agent_id: true },
  });
  if (!showing) return NextResponse.json({ ok: false, error: "Showing not found" }, { status: 404 });
  if (auth.role !== "BROKER" && showing.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const feedback = await prisma.showingFeedback.findUnique({
    where: { showing_id: showingId },
  });

  if (!feedback) return NextResponse.json({ ok: false, error: "No feedback yet" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    item: { ...feedback, id: feedback.id.toString(), showing_id: feedback.showing_id.toString(), lead_id: feedback.lead_id?.toString() ?? null },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const showingId = BigInt(id);

  const showing = await prisma.showing.findUnique({
    where: { id: showingId },
    select: { agent_id: true, lead_id: true },
  });
  if (!showing) return NextResponse.json({ ok: false, error: "Showing not found" }, { status: 404 });
  if (auth.role !== "BROKER" && showing.agent_id !== auth.userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const { rating, interest_level, liked, disliked, objections, notes } = body as { rating?: number; interest_level?: string; liked?: string[]; disliked?: string[]; objections?: string[]; notes?: string };

  if (!rating || !interest_level) {
    return NextResponse.json({ ok: false, error: "rating and interest_level are required" }, { status: 400 });
  }

  try {
    const feedback = await submitFeedback({
      showing_id: showingId,
      lead_id: showing.lead_id ?? undefined,
      rating,
      interest_level,
      liked, disliked, objections, notes,
      submitted_by: 'agent',
    });

    await logAuditEvent("create", "showing_feedback", feedback.id.toString(), auth);

    return NextResponse.json({
      ok: true,
      item: { ...feedback, id: feedback.id.toString(), showing_id: feedback.showing_id.toString(), lead_id: feedback.lead_id?.toString() ?? null },
    }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit feedback";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
