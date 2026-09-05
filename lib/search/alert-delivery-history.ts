/**
 * ALERT DELIVERY HISTORY — "already sent" for the Saved Search alert cron (Packet 2 closure).
 *
 * A listing is "New" for an alert only if it has NOT been delivered before. A later provider
 * modification (price, photo, status) advances ModificationTimestamp but must never re-send the
 * listing as "New Listing". The durable history is EXISTING canonical storage, nothing new:
 *
 *   1. Mallan's canonical client history — `ClientListingAction` with unique identity
 *      (lead_id, listing_id [local Listing PK], action = "sent"), the same row the CRM
 *      listing-send workflow writes. A lead-linked alert honours it: a listing already sent to
 *      that Lead by ANY workflow is not "New" for that Lead.
 *   2. The saved search's own audit trail — `AuditEvent(entity_type = 'saved_search',
 *      entity_id = <saved search id>, action = 'search_alert_delivered', changes.listing_ids)`.
 *      Identity: SavedSearch + provider ListingId / Mallan SL-/RL- id. This covers what
 *      ClientListingAction cannot represent: agent-only searches (no Lead) and provider results
 *      with no local Listing row. Audit rows are purged after 2 years (data-retention cron); a
 *      listing older than that would not be "new" in any meaningful sense, and the rule is
 *      recorded here so it is a known bound, not a surprise.
 *
 * Both are consulted BEFORE delivery is chosen and written only AFTER a successful send.
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export const ALERT_DELIVERED_ACTION = "search_alert_delivered";

export interface DeliveryHistory {
  /** ListingId strings this saved search has already delivered (audit trail). */
  deliveredByThisAlert: Set<string>;
  /** ListingId strings already sent to the linked Lead by any workflow (ClientListingAction). */
  sentToLead: Set<string>;
  /** Local Listing PK by ListingId string, for the candidates that have a local row. */
  localIdByListingId: Map<string, bigint>;
}

export async function loadDeliveryHistory(o: { savedSearchId: bigint; leadId: bigint | null; candidateListingIds: readonly string[] }): Promise<DeliveryHistory> {
  const deliveredByThisAlert = new Set<string>();
  const sentToLead = new Set<string>();
  const localIdByListingId = new Map<string, bigint>();
  if (o.candidateListingIds.length === 0) return { deliveredByThisAlert, sentToLead, localIdByListingId };

  const audits = await prisma.auditEvent.findMany({
    where: { entity_type: "saved_search", entity_id: o.savedSearchId.toString(), action: ALERT_DELIVERED_ACTION },
    select: { changes: true },
  });
  for (const a of audits) {
    const ids = (a.changes as { listing_ids?: unknown } | null)?.listing_ids;
    if (Array.isArray(ids)) for (const id of ids) if (typeof id === "string") deliveredByThisAlert.add(id);
  }

  const local = await prisma.listing.findMany({ where: { listing_id: { in: [...o.candidateListingIds] } }, select: { id: true, listing_id: true } });
  for (const r of local) localIdByListingId.set(r.listing_id, r.id);

  if (o.leadId != null && local.length > 0) {
    const sent = await prisma.clientListingAction.findMany({
      where: { lead_id: o.leadId, action: "sent", listing_id: { in: local.map((r) => r.id) } },
      select: { listing_id: true },
    });
    const byLocal = new Map<bigint, string>();
    for (const r of local) byLocal.set(r.id, r.listing_id);
    for (const s of sent) { const lid = byLocal.get(s.listing_id); if (lid) sentToLead.add(lid); }
  }
  return { deliveredByThisAlert, sentToLead, localIdByListingId };
}

export interface Exclusion { byAlertHistory: number; bySentToLead: number }

/** Remove candidates already delivered. Order is preserved (universe order). */
export function excludeDelivered<T extends { listingId: string }>(rows: readonly T[], h: DeliveryHistory): { fresh: T[]; excluded: Exclusion } {
  const fresh: T[] = [];
  const excluded: Exclusion = { byAlertHistory: 0, bySentToLead: 0 };
  for (const r of rows) {
    if (h.deliveredByThisAlert.has(r.listingId)) { excluded.byAlertHistory++; continue; }
    if (h.sentToLead.has(r.listingId)) { excluded.bySentToLead++; continue; }
    fresh.push(r);
  }
  return { fresh, excluded };
}

/**
 * Write durable delivery history for the listings that were ACTUALLY in a successfully sent
 * email. The audit row is the identity for every path; ClientListingAction is written for a
 * linked Lead where a local Listing row exists (the CRM's own client-history semantics).
 * Called only after `sendEmail` reported success; never on failure.
 */
export async function recordDelivery(o: {
  savedSearchId: bigint; leadId: bigint | null; listingIds: readonly string[]; listingKeys: readonly (string | null)[];
  localIdByListingId: ReadonlyMap<string, bigint>; now: Date;
}): Promise<{ audited: boolean; clientActionsWritten: number; withoutLocalRow: number }> {
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
        delivered_at: o.now.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
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
  return { audited: true, clientActionsWritten, withoutLocalRow };
}
