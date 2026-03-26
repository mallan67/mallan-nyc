// /api/crm/buildings/[id]
// GET: Single building with all units.
// PATCH: Update manual-only fields (management, super, porter, board notes, agent notes, tags).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/crm/buildings/[id]
 * Returns building record with all units ordered by unit number.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const buildingId = safeBigInt(id);
  if (!buildingId) {
    return NextResponse.json({ error: "Invalid building ID" }, { status: 400 });
  }

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    include: {
      units: {
        orderBy: { unit_number: "asc" },
      },
    },
  });

  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  return NextResponse.json(serializeBigInts(building));
}

/**
 * PATCH /api/crm/buildings/[id]
 * Update manual-only fields. Trestle-sourced fields are read-only.
 * Allowed: management_company, management_phone, management_email,
 *           super_name, super_phone, super_live_in,
 *           porter_name, porter_phone,
 *           board_approval_required, board_notes,
 *           agent_notes, custom_tags
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const buildingId = safeBigInt(id);
  if (!buildingId) {
    return NextResponse.json({ error: "Invalid building ID" }, { status: 400 });
  }

  const existing = await prisma.building.findUnique({
    where: { id: buildingId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  // Management company
  if (body.management_company !== undefined)
    update.management_company = body.management_company ? String(body.management_company) : null;
  if (body.management_phone !== undefined)
    update.management_phone = body.management_phone ? String(body.management_phone) : null;
  if (body.management_email !== undefined)
    update.management_email = body.management_email ? String(body.management_email) : null;

  // Super
  if (body.super_name !== undefined)
    update.super_name = body.super_name ? String(body.super_name) : null;
  if (body.super_phone !== undefined)
    update.super_phone = body.super_phone ? String(body.super_phone) : null;
  if (body.super_live_in !== undefined)
    update.super_live_in = body.super_live_in != null ? Boolean(body.super_live_in) : null;

  // Porter
  if (body.porter_name !== undefined)
    update.porter_name = body.porter_name ? String(body.porter_name) : null;
  if (body.porter_phone !== undefined)
    update.porter_phone = body.porter_phone ? String(body.porter_phone) : null;

  // Board
  if (body.board_approval_required !== undefined)
    update.board_approval_required = body.board_approval_required != null
      ? Boolean(body.board_approval_required)
      : null;
  if (body.board_notes !== undefined)
    update.board_notes = body.board_notes ? String(body.board_notes) : null;

  // Agent notes
  if (body.agent_notes !== undefined)
    update.agent_notes = body.agent_notes ? String(body.agent_notes) : null;

  // Custom tags — must be an array of strings
  if (body.custom_tags !== undefined) {
    if (!Array.isArray(body.custom_tags)) {
      return NextResponse.json({ error: "custom_tags must be an array" }, { status: 400 });
    }
    update.custom_tags = (body.custom_tags as unknown[]).map(String);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.building.update({
    where: { id: buildingId },
    data: update,
  });

  await logAuditEvent(
    "update",
    "building",
    buildingId.toString(),
    auth,
    { changed_fields: Object.keys(update) },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(serializeBigInts(updated));
}
