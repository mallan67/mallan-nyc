// /api/crm/past-deals/[id]
// PATCH: Update past deal. DELETE: Remove past deal.
// Agent can edit/delete own deals. Broker can edit/delete any.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

type RouteParams = { params: Promise<{ id: string }> };

async function findDealWithOwnership(
  id: string,
  auth: { userId: bigint; role: string }
) {
  const numericId = parseInt(id);
  if (isNaN(numericId)) return { error: "Invalid ID", status: 400, deal: null };

  const deal = await prisma.pastDeal.findUnique({
    where: { id: BigInt(numericId) },
  });
  if (!deal) return { error: "Past deal not found", status: 404, deal: null };

  // Ownership: agent can only access own deals
  if (auth.role !== "BROKER" && deal.agent_id !== auth.userId) {
    return { error: "Access denied", status: 403, deal: null };
  }

  return { error: null, status: 0, deal };
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const result = await findDealWithOwnership(id, auth);
  if (!result.deal) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  const existing = result.deal;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.street !== undefined) update.street = String(body.street);
  if (body.unit !== undefined) update.unit = body.unit as string | null;
  if (body.city !== undefined) update.city = String(body.city);
  if (body.postal_code !== undefined)
    update.postal_code = body.postal_code as string | null;
  if (body.neighborhood !== undefined)
    update.neighborhood = body.neighborhood as string | null;
  if (body.deal_type !== undefined) {
    if (!["sale", "rent"].includes(body.deal_type as string)) {
      return NextResponse.json(
        { error: "deal_type must be 'sale' or 'rent'" },
        { status: 400 }
      );
    }
    update.deal_type = body.deal_type as string;
  }
  if (body.property_type !== undefined)
    update.property_type = body.property_type as string | null;
  if (body.close_price !== undefined)
    update.close_price =
      body.close_price != null ? Number(body.close_price) : null;
  if (body.close_date !== undefined)
    update.close_date = body.close_date
      ? new Date(body.close_date as string)
      : null;
  if (body.beds !== undefined)
    update.beds = body.beds != null ? Number(body.beds) : null;
  if (body.baths_full !== undefined)
    update.baths_full =
      body.baths_full != null ? Number(body.baths_full) : null;
  if (body.baths_half !== undefined)
    update.baths_half =
      body.baths_half != null ? Number(body.baths_half) : null;
  if (body.sqft !== undefined)
    update.sqft = body.sqft != null ? Number(body.sqft) : null;
  if (body.photo_url !== undefined)
    update.photo_url = body.photo_url as string | null;
  if (body.listing_courtesy !== undefined)
    update.listing_courtesy = body.listing_courtesy as string | null;
  if (body.source !== undefined) update.source = body.source as string;
  if (body.sort_order !== undefined)
    update.sort_order =
      body.sort_order != null ? Number(body.sort_order) : null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const updated = await prisma.pastDeal.update({
    where: { id: existing.id },
    data: update,
  });

  await logAuditEvent(
    "update",
    "past_deal",
    existing.id.toString(),
    auth,
    { fields: Object.keys(update) },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: updated.id.toString(),
    updated: Object.keys(update),
  });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const result = await findDealWithOwnership(id, auth);
  if (!result.deal) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  const existing = result.deal;

  await prisma.pastDeal.delete({ where: { id: existing.id } });

  await logAuditEvent(
    "delete",
    "past_deal",
    existing.id.toString(),
    auth,
    { street: existing.street },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({ deleted: true, id: existing.id.toString() });
}
