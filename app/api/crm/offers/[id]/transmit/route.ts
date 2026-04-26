// /api/crm/offers/[id]/transmit
//
// Stamps `transmitted_to_seller_at` on an Offer and writes an AuditEvent
// for the UCBA Art. II "offer transmitted to seller" lifecycle event.
//
// UCBA Art. II requires brokers to transmit every received offer to the
// seller. This endpoint records that the transmission happened, with a
// permanent audit trail. The endpoint is intentionally narrow — it does
// nothing else (no email send, no notification fan-out — those belong in
// dedicated routes that consume the `offer_transmitted` AuditEvent).
//
// Workstream C2 of master refactor (memory/REFACTOR-2026-04-25.md +
// memory/FOLLOWUP-2026-05-01.md).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const wc = assertWriteAllowed();
  if (wc) return wc;

  const { id } = await params;
  const offerId = safeBigInt(id);
  if (offerId === null) {
    return NextResponse.json({ error: "Invalid offer id" }, { status: 400 });
  }

  // Optional body fields:
  //   competing_offers_disclosed: bool — agent indicates they shared info
  //     about other received offers with this buyer. Requires the seller's
  //     prior authorization (separate field on the offer set when the
  //     seller signs the disclosure consent).
  let body: { competing_offers_disclosed?: boolean } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Load the offer first so we can validate the disclosure precondition
  // and reject early on a non-existent or already-transmitted offer.
  const existing = await prisma.offer.findUnique({
    where: { id: offerId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  // Idempotent: if already transmitted, return 200 with the existing
  // timestamp rather than re-stamping. Prevents accidental double-write
  // from a UI double-click that would otherwise lose the original audit
  // timestamp under the new one.
  if (existing.transmitted_to_seller_at) {
    return NextResponse.json({
      offer: serializeOffer(existing),
      already_transmitted: true,
    });
  }

  // UCBA Art. II precondition: if the agent is asserting that competing
  // offers were disclosed to this buyer, the seller must have authorized
  // that disclosure (`disclosure_authorized_by_seller=true`). Block the
  // transmit when the precondition fails.
  if (body.competing_offers_disclosed && !existing.disclosure_authorized_by_seller) {
    return NextResponse.json(
      {
        error:
          "Cannot record competing-offers disclosure without the seller's prior authorization. " +
          "Set `disclosure_authorized_by_seller=true` on the offer (requires seller's written consent) before transmitting.",
        code: "UCBA_II_DISCLOSURE_NOT_AUTHORIZED",
      },
      { status: 400 },
    );
  }

  const transmittedAt = new Date();
  const updated = await prisma.offer.update({
    where: { id: offerId },
    data: {
      transmitted_to_seller_at: transmittedAt,
      // Stamp competing_offers_disclosed only if the body explicitly says so.
      // Otherwise leave whatever was already set on the offer.
      ...(body.competing_offers_disclosed !== undefined
        ? { competing_offers_disclosed: body.competing_offers_disclosed }
        : {}),
      // Move status forward unless it has already advanced beyond
      // "transmitted" via a different code path (counter/withdrawn/etc).
      ...(existing.status === "received" ? { status: "transmitted" } : {}),
    },
  });

  await logAuditEvent("offer_transmitted_to_seller", "offer", offerId.toString(), auth, {
    listing_id: existing.listing_id ?? null,
    buyer_lead_id: existing.buyer_lead_id ? existing.buyer_lead_id.toString() : null,
    buyer_agent_id: existing.buyer_agent_id ? existing.buyer_agent_id.toString() : null,
    list_agent_id: existing.list_agent_id ? existing.list_agent_id.toString() : null,
    offer_amount: existing.offer_amount ? existing.offer_amount.toString() : null,
    transmitted_at: transmittedAt.toISOString(),
    competing_offers_disclosed: updated.competing_offers_disclosed,
    disclosure_authorized_by_seller: existing.disclosure_authorized_by_seller,
  });

  return NextResponse.json({ offer: serializeOffer(updated) });
}

/**
 * Convert Offer (with BigInt + Decimal fields) to a JSON-safe shape.
 * BigInt → string, Decimal → string, Date → ISO string.
 */
function serializeOffer(o: {
  id: bigint;
  listing_id: string | null;
  buyer_lead_id: bigint | null;
  buyer_agent_id: bigint | null;
  list_agent_id: bigint | null;
  offer_amount: { toString(): string } | null;
  offer_terms: string | null;
  contingencies: unknown;
  expiration_at: Date | null;
  received_at: Date | null;
  transmitted_to_seller_at: Date | null;
  seller_acknowledged_at: Date | null;
  competing_offers_disclosed: boolean;
  disclosure_authorized_by_seller: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: o.id.toString(),
    listing_id: o.listing_id,
    buyer_lead_id: o.buyer_lead_id ? o.buyer_lead_id.toString() : null,
    buyer_agent_id: o.buyer_agent_id ? o.buyer_agent_id.toString() : null,
    list_agent_id: o.list_agent_id ? o.list_agent_id.toString() : null,
    offer_amount: o.offer_amount ? o.offer_amount.toString() : null,
    offer_terms: o.offer_terms,
    contingencies: o.contingencies,
    expiration_at: o.expiration_at?.toISOString() ?? null,
    received_at: o.received_at?.toISOString() ?? null,
    transmitted_to_seller_at: o.transmitted_to_seller_at?.toISOString() ?? null,
    seller_acknowledged_at: o.seller_acknowledged_at?.toISOString() ?? null,
    competing_offers_disclosed: o.competing_offers_disclosed,
    disclosure_authorized_by_seller: o.disclosure_authorized_by_seller,
    status: o.status,
    created_at: o.created_at.toISOString(),
    updated_at: o.updated_at.toISOString(),
  };
}
