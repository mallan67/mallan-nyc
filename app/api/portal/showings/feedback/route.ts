import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireAuth(req);
  if (isAuthError(session)) return session;
  return NextResponse.json({ items: [], total: 0 });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  // Parse body defensively — returns 400 on malformed JSON rather than a 500.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const showingId = body.showing_id as string | number | undefined;
  const rating = body.rating as number | undefined;
  const interestLevel = (body.interest_level as string) || "neutral";
  const comments = (body.comments as string | null) || null;

  if (!showingId) {
    return NextResponse.json(
      { error: "showing_id is required" },
      { status: 400 },
    );
  }

  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: "rating must be a number between 1 and 5" },
      { status: 400 },
    );
  }

  const validInterest = [
    "not_interested",
    "neutral",
    "interested",
    "very_interested",
    "ready_to_offer",
  ];
  if (!validInterest.includes(interestLevel)) {
    return NextResponse.json(
      { error: "Invalid interest_level" },
      { status: 400 },
    );
  }

  // Verify the showing exists and belongs to this user
  const showing = await prisma.showing.findUnique({
    where: { id: BigInt(showingId) },
    select: { id: true, lead_id: true, agent_id: true },
  });

  if (!showing) {
    return NextResponse.json(
      { error: "Showing not found" },
      { status: 404 },
    );
  }

  // Ensure the caller is the lead or the agent on this showing
  const isOwner =
    (auth.userType === "lead" && showing.lead_id === auth.userId) ||
    (auth.userType === "agent" && showing.agent_id === auth.userId);

  if (!isOwner) {
    return NextResponse.json(
      { error: "Not authorized for this showing" },
      { status: 403 },
    );
  }

  // Upsert ShowingFeedback (1:1 with Showing)
  const feedback = await prisma.showingFeedback.upsert({
    where: { showing_id: BigInt(showingId) },
    create: {
      showing_id: BigInt(showingId),
      lead_id: showing.lead_id,
      rating,
      interest_level: interestLevel,
      notes: comments,
      submitted_by: auth.userType === "lead" ? "client" : "agent",
    },
    update: {
      rating,
      interest_level: interestLevel,
      notes: comments,
      submitted_by: auth.userType === "lead" ? "client" : "agent",
    },
  });

  // Audit event
  await prisma.auditEvent.create({
    data: {
      action: "create",
      entity_type: "showing_feedback",
      entity_id: feedback.id.toString(),
      user_type: auth.userType === "lead" ? "lead" : "agent",
      user_id: auth.userId,
      actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
      changes: {
        showing_id: showingId.toString(),
        rating,
        interest_level: interestLevel,
      },
    },
  });

  return NextResponse.json({
    success: true,
    feedback: {
      id: feedback.id.toString(),
      showing_id: feedback.showing_id.toString(),
      rating: feedback.rating,
      interest_level: feedback.interest_level,
      notes: feedback.notes,
      submitted_by: feedback.submitted_by,
    },
  });
}

