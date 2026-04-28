// PATCH /api/crm/agents/[id]/ethics-training
// Broker-only — set/update an agent's UCBA Art. III §6 ethics-training
// dates. Validation: expires_at >= completed_at across persisted state
// (so a partial PATCH can't bypass the invariant); expires_at no
// further than 5 years out (sanity guard against typos); either field
// may be null to clear it. Writes a logAuditEvent row for every change
// so external auditors have a full trail of who changed what when.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Reject anything that isn't a plain JSON object — null, arrays, primitives.
  // Without this guard, Object.prototype.hasOwnProperty.call(null, ...) throws
  // a TypeError that surfaces to the client as a generic 500.
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return NextResponse.json(
      { error: "Body must be a JSON object." },
      { status: 400 }
    );
  }
  const patch = body as { completed_at?: string | null; expires_at?: string | null };

  const hasCompleted = Object.prototype.hasOwnProperty.call(patch, "completed_at");
  const hasExpires = Object.prototype.hasOwnProperty.call(patch, "expires_at");

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
    if (patch.completed_at === null) {
      data.ethics_training_completed_at = null;
    } else {
      const d = new Date(patch.completed_at as string);
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
    if (patch.expires_at === null) {
      data.ethics_training_expires_at = null;
    } else {
      const d = new Date(patch.expires_at as string);
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

  // Fast path: when BOTH dates are in the same patch body, validate
  // ordering directly without a DB round-trip. This preserves the
  // pre-Codex test contract that "PATCH with bad expires < completed
  // returns 400" doesn't depend on an existing-agent fetch.
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

  // Fetch the persisted record so we can (a) return 404 cleanly instead
  // of letting Prisma's record-not-found bubble up as a 500, and
  // (b) cross-validate a partial PATCH against the persisted other
  // field. Earlier code only validated when both dates were present
  // in the same body, leaving a real bypass when only one was patched.
  const existing = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      ethics_training_completed_at: true,
      ethics_training_expires_at: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Partial-PATCH cross-validation: take the patched value when present,
  // fall back to the persisted value otherwise. Skips when the fast
  // path above already validated a both-fields body.
  const finalCompleted = hasCompleted
    ? data.ethics_training_completed_at ?? null
    : existing.ethics_training_completed_at;
  const finalExpires = hasExpires
    ? data.ethics_training_expires_at ?? null
    : existing.ethics_training_expires_at;

  if (
    finalCompleted instanceof Date &&
    finalExpires instanceof Date &&
    finalExpires.getTime() < finalCompleted.getTime()
  ) {
    return NextResponse.json(
      { error: "expires_at cannot be earlier than completed_at" },
      { status: 400 }
    );
  }

  let updated;
  try {
    updated = await prisma.agent.update({
      where: { id: agentId },
      data,
      select: {
        id: true,
        ethics_training_completed_at: true,
        ethics_training_expires_at: true,
      },
    });
  } catch (e) {
    // P2025 = the row was deleted between our findUnique above and this
    // update (TOCTOU race; admin endpoint, low write contention). Other
    // Prisma errors should still surface as 500 so they get investigated.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    throw e;
  }

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
