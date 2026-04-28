// PATCH /api/crm/agents/[id]/ethics-training
// Broker-only — set/update an agent's UCBA Art. III §6 ethics-training
// dates. Validation: expires_at >= completed_at when both present;
// expires_at no further than 5 years out (sanity guard against typos);
// either field may be null to clear it. Writes a logAuditEvent row for
// every change so external auditors have a full trail of who changed
// what when.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  let agentId: bigint;
  try {
    agentId = BigInt(id);
  } catch {
    return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
  }

  let body: { completed_at?: string | null; expires_at?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasCompleted = Object.prototype.hasOwnProperty.call(body, "completed_at");
  const hasExpires = Object.prototype.hasOwnProperty.call(body, "expires_at");

  if (!hasCompleted && !hasExpires) {
    return NextResponse.json(
      { error: "Provide at least one of completed_at or expires_at." },
      { status: 400 }
    );
  }

  const data: {
    ethics_training_completed_at?: Date | null;
    ethics_training_expires_at?: Date | null;
  } = {};

  if (hasCompleted) {
    if (body.completed_at === null) {
      data.ethics_training_completed_at = null;
    } else {
      const d = new Date(body.completed_at as string);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "completed_at is not a valid ISO date" },
          { status: 400 }
        );
      }
      data.ethics_training_completed_at = d;
    }
  }

  if (hasExpires) {
    if (body.expires_at === null) {
      data.ethics_training_expires_at = null;
    } else {
      const d = new Date(body.expires_at as string);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "expires_at is not a valid ISO date" },
          { status: 400 }
        );
      }
      if (d.getTime() - Date.now() > FIVE_YEARS_MS) {
        return NextResponse.json(
          { error: "expires_at cannot be more than 5 years in the future" },
          { status: 400 }
        );
      }
      data.ethics_training_expires_at = d;
    }
  }

  if (
    data.ethics_training_completed_at instanceof Date &&
    data.ethics_training_expires_at instanceof Date &&
    data.ethics_training_expires_at.getTime() <
      data.ethics_training_completed_at.getTime()
  ) {
    return NextResponse.json(
      { error: "expires_at cannot be earlier than completed_at" },
      { status: 400 }
    );
  }

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data,
    select: {
      id: true,
      ethics_training_completed_at: true,
      ethics_training_expires_at: true,
    },
  });

  await logAuditEvent(
    "ethics_training_updated",
    "agent",
    agentId.toString(),
    auth,
    {
      completed_at: updated.ethics_training_completed_at?.toISOString() ?? null,
      expires_at: updated.ethics_training_expires_at?.toISOString() ?? null,
    },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    agent: {
      id: updated.id.toString(),
      ethics_training_completed_at:
        updated.ethics_training_completed_at?.toISOString() ?? null,
      ethics_training_expires_at:
        updated.ethics_training_expires_at?.toISOString() ?? null,
    },
  });
}
