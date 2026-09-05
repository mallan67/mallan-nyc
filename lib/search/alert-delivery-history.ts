/**
 * ALERT DELIVERY HISTORY — "already sent" for the Saved Search alert cron (Packet 2 closure).
 *
 * A listing is "New" for an alert only if it has NOT been delivered before. A later provider
 * modification (price, photo, status) advances ModificationTimestamp but must never re-send the
 * listing as "New Listing". ONE history per audience, in EXISTING canonical storage:
 *
 *   LEAD-LINKED ALERT → Mallan's canonical client history, `ClientListingAction`
 *     (lead_id, listing_id [local Listing PK], action = "sent") — the same row the CRM
 *     listing-send workflow writes. It is the ONLY truth for "this Lead already received this
 *     listing", across ALL saved searches and ALL workflows. A provider result with no local
 *     row is CANONICALIZED first (lib/listings/ensure-local-listing.ts — the mechanism the CRM
 *     has always used before listing-sends) so the event is always representable; a listing
 *     whose identity cannot be ensured is NOT sent (fail loud, audited), never delivered
 *     "unremembered".
 *
 *   AGENT-ONLY ALERT (no Lead) → the saved search's own audit trail,
 *     AuditEvent(entity_type 'saved_search', entity_id <id>, action 'search_alert_delivered',
 *     changes.listing_ids). This is OPERATIONAL agent-notification history, NOT client CRM
 *     history. Audit rows are purged after 2 years (data-retention cron), so exact lifetime
 *     idempotency for agent-only alerts is bounded by that retention. Recorded, not hidden.
 *
 * The audit row is also written for lead-linked deliveries as EVIDENCE; it is never consulted
 * as client truth.
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ensureInputFromSearchDto, ensureLocalListing } from "@/lib/listings/ensure-local-listing";

export const ALERT_DELIVERED_ACTION = "search_alert_delivered";

export interface DeliveryHistory {
  /** Agent-only: ListingId strings this saved search already delivered (audit trail). */
  deliveredByThisAlert: Set<string>;
  /** Lead-linked: ListingId strings already sent to the Lead by ANY workflow (ClientListingAction). */
  sentToLead: Set<string>;
  /** Local Listing PK by ListingId string for candidates that already have a local row. */
  localIdByListingId: Map<string, bigint>;
  audience: "lead" | "agent";
}

export async function loadDeliveryHistory(o: { savedSearchId: bigint; leadId: bigint | null; candidateListingIds: readonly string[] }): Promise<DeliveryHistory> {
  const deliveredByThisAlert = new Set<string>();
  const sentToLead = new Set<string>();
  const localIdByListingId = new Map<string, bigint>();
  const audience = o.leadId != null ? "lead" : "agent";
  if (o.candidateListingIds.length === 0) return { deliveredByThisAlert, sentToLead, localIdByListingId, audience };

  if (audience === "agent") {
    const audits = await prisma.auditEvent.findMany({
      where: { entity_type: "saved_search", entity_id: o.savedSearchId.toString(), action: ALERT_DELIVERED_ACTION },
      select: { changes: true },
    });
    for (const a of audits) {
      const ids = (a.changes as { listing_ids?: unknown } | null)?.listing_ids;
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") deliveredByThisAlert.add(id);
    }
    return { deliveredByThisAlert, sentToLead, localIdByListingId, audience };
  }

  const local = await prisma.listing.findMany({ where: { listing_id: { in: [...o.candidateListingIds] } }, select: { id: true, listing_id: true } });
  for (const r of local) localIdByListingId.set(r.listing_id, r.id);
  if (local.length > 0) {
    const sent = await prisma.clientListingAction.findMany({
      where: { lead_id: o.leadId as bigint, action: "sent", listing_id: { in: local.map((r) => r.id) } },
      select: { listing_id: true },
    });
    const byLocal = new Map<bigint, string>();
    for (const r of local) byLocal.set(r.id, r.listing_id);
    for (const s of sent) { const lid = byLocal.get(s.listing_id); if (lid) sentToLead.add(lid); }
  }
  return { deliveredByThisAlert, sentToLead, localIdByListingId, audience };
}

export interface Exclusion { byAlertHistory: number; bySentToLead: number }

/** Remove candidates already delivered for this audience. Order is preserved (universe order). */
export function excludeDelivered<T extends { listingId: string }>(rows: readonly T[], h: DeliveryHistory): { fresh: T[]; excluded: Exclusion } {
  const fresh: T[] = [];
  const excluded: Exclusion = { byAlertHistory: 0, bySentToLead: 0 };
  for (const r of rows) {
    if (h.audience === "agent" && h.deliveredByThisAlert.has(r.listingId)) { excluded.byAlertHistory++; continue; }
    if (h.audience === "lead" && h.sentToLead.has(r.listingId)) { excluded.bySentToLead++; continue; }
    fresh.push(r);
  }
  return { fresh, excluded };
}

/**
 * LEAD-LINKED ONLY. Give every hydrated DTO a local Listing identity BEFORE anything is sent,
 * so the delivery can be remembered in the Lead's canonical history. A DTO whose identity
 * cannot be ensured is returned in `unrepresentable` and must not be delivered.
 */
export async function canonicalizeForLead(
  dtos: readonly Record<string, unknown>[],
  known: ReadonlyMap<string, bigint>,
): Promise<{ localIdByListingId: Map<string, bigint>; deliverable: Record<string, unknown>[]; unrepresentable: Array<{ listingId: string; reason: string }> }> {
  const localIdByListingId = new Map<string, bigint>(known);
  const deliverable: Record<string, unknown>[] = [];
  const unrepresentable: Array<{ listingId: string; reason: string }> = [];
  for (const dto of dtos) {
    const listingId = String(dto.id ?? "");
    if (localIdByListingId.has(listingId)) { deliverable.push(dto); continue; }
    try {
      const ensured = await ensureLocalListing(ensureInputFromSearchDto(dto), async (listing) => {
        await prisma.auditEvent.create({
          data: { action: "create", entity_type: "listing", entity_id: listing.id.toString(), user_type: "system", user_id: null, changes: { source: "idx_ensure", via: "search_alert_cron", trestle_id: listingId } as Prisma.InputJsonValue },
        });
      });
      localIdByListingId.set(listingId, ensured.id);
      deliverable.push(dto);
    } catch (err) {
      unrepresentable.push({ listingId, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { localIdByListingId, deliverable, unrepresentable };
}

/**
 * Write durable delivery history for the listings that were ACTUALLY in a successfully sent
 * email. Lead-linked: ClientListingAction for every delivered listing (all have a local
 * identity by construction) — the client truth — plus the audit row as evidence. Agent-only:
 * the audit row IS the operational history. Called only after `sendEmail` reported success.
 */
export async function recordDelivery(o: {
  savedSearchId: bigint; leadId: bigint | null; listingIds: readonly string[]; listingKeys: readonly (string | null)[];
  localIdByListingId: ReadonlyMap<string, bigint>; now: Date;
}): Promise<{ audited: boolean; clientActionsWritten: number; withoutLocalRow: number }> {
  let clientActionsWritten = 0;
  let withoutLocalRow = 0;
  if (o.leadId != null) {
    for (const listingId of o.listingIds) {
      const localId = o.localIdByListingId.get(listingId);
      if (localId == null) { withoutLocalRow++; continue; }
      await prisma.clientListingAction.upsert({
        where: { lead_id_listing_id_action: { lead_id: o.leadId, listing_id: localId, action: "sent" } },
        update: { created_at: o.now },
        create: { lead_id: o.leadId, listing_id: localId, action: "sent" },
      });
      clientActionsWritten++;
    }
  }
  await prisma.auditEvent.create({
    data: {
      action: ALERT_DELIVERED_ACTION,
      entity_type: "saved_search",
      entity_id: o.savedSearchId.toString(),
      user_type: "system",
      user_id: null,
      changes: {
        listing_ids: [...o.listingIds],
        listing_keys: [...o.listingKeys],
        lead_id: o.leadId != null ? o.leadId.toString() : null,
        client_history_rows: clientActionsWritten,
        delivered_at: o.now.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
  return { audited: true, clientActionsWritten, withoutLocalRow };
}
