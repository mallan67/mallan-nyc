import type { Prisma } from '@prisma/client';

/**
 * Agent permanent delete — dependency spec and eligibility rules.
 *
 * @module lib/agents/agent-purge
 *
 * ── What this is for ──────────────────────────────────────────────────────
 * Mallan has TWO distinct broker actions on an agent, and they must stay
 * distinct:
 *
 *   Deactivate         normal brokerage offboarding. Disables login, removes
 *                      them from the public roster, RETAINS every deal, client,
 *                      commission, document and compliance record.
 *                      (DELETE /api/crm/agents/[id] — already exists.)
 *
 *   Delete Permanently MISTAKE ROLLBACK ONLY. For an erroneous / test /
 *                      never-used Agent record. Refuses the moment the target
 *                      shows any sign of having acted as a broker.
 *
 * Qualifying for Delete Permanently is intentionally hard. A mistakenly created
 * account qualifies; an established agent almost certainly never will. That is
 * the feature working, not a limitation of it.
 *
 * ── Why an application-level count, and not "try the delete" ──────────────
 * 21 foreign keys reference `agents`, but 10 further columns hold an agent id
 * with NO foreign key at all (Session.user_id, ActivityLog.actor_id,
 * PriceHistory.changed_by, Offer.buyer_agent_id, …). The database would report
 * a successful delete while leaving every one of those pointing at an id that
 * no longer resolves. So eligibility is decided by explicit counts here, BEFORE
 * any FK rule could apply — which also means the design does not depend on
 * whether a given constraint is RESTRICT or SET NULL in the live database.
 *
 * ── Attribution is history ────────────────────────────────────────────────
 * Rows that merely *name* the target as the actor (audit events they caused,
 * price changes they made, listing audits they ran) are NOT nulled or rewritten
 * to let a delete through. Damaging attribution to permit deletion defeats the
 * purpose of retaining brokerage history, so those rows BLOCK instead.
 *
 * The one deliberate exception: audit events written BY a broker or the system
 * ABOUT the erroneous agent during the failed onboarding — the create, profile,
 * photo and purge events. Those document what happened to the record; they are
 * not evidence that the target conducted brokerage activity. They are preserved
 * and do not block. AuditEvent carries both `user_id` (who acted) and
 * `entity_type`/`entity_id` (what was acted upon), so the distinction is exact.
 */

/**
 * A Prisma client or an interactive-transaction client. `PrismaClient` is
 * assignable to `Prisma.TransactionClient`, so the same counting code runs
 * both in the read-only preview and inside the purge transaction.
 */
export type PurgeDb = Prisma.TransactionClient;

export type BlockerKind = 'fk' | 'loose';

export interface PurgeBlocker {
  /** Stable key reported in the 409 body. */
  key: string;
  kind: BlockerKind;
  /** What the presence of these rows proves about the target. */
  meaning: string;
  count: (db: PurgeDb, agentId: bigint) => Promise<number>;
}

/**
 * Every relationship whose existence proves the target participated in
 * brokerage business. Any non-zero count refuses the purge.
 *
 * The 21 FK relations first, then the loose identity references the database
 * would not have protected.
 */
export const PURGE_BLOCKERS: PurgeBlocker[] = [
  // ── FK relations (21) ───────────────────────────────────────────────────
  { key: 'deals', kind: 'fk', meaning: 'executed transaction',
    count: (db, id) => db.deal.count({ where: { agent_id: id } }) },
  { key: 'showings', kind: 'fk', meaning: 'client showing',
    count: (db, id) => db.showing.count({ where: { agent_id: id } }) },
  { key: 'protected_periods', kind: 'fk', meaning: 'commission-entitlement evidence',
    count: (db, id) => db.protectedPeriod.count({ where: { agent_id: id } }) },
  { key: 'past_deals', kind: 'fk', meaning: 'published closed-deal history',
    count: (db, id) => db.pastDeal.count({ where: { agent_id: id } }) },
  { key: 'cma_reports', kind: 'fk', meaning: 'client-facing valuation',
    count: (db, id) => db.cmaReport.count({ where: { agent_id: id } }) },
  { key: 'documents', kind: 'fk', meaning: 'stored file or agreement',
    count: (db, id) => db.document.count({ where: { agent_id: id } }) },
  { key: 'campaigns', kind: 'fk', meaning: 'marketing campaign',
    count: (db, id) => db.campaign.count({ where: { agent_id: id } }) },
  { key: 'follow_up_tasks', kind: 'fk', meaning: 'assigned work item',
    count: (db, id) => db.followUpTask.count({ where: { agent_id: id } }) },
  { key: 'lead_assignment_rules', kind: 'fk', meaning: 'lead routing configuration',
    count: (db, id) => db.leadAssignmentRule.count({ where: { agent_id: id } }) },
  { key: 'demand_alerts', kind: 'fk', meaning: 'saved demand signal',
    count: (db, id) => db.demandAlert.count({ where: { agent_id: id } }) },
  { key: 'agent_metrics', kind: 'fk', meaning: 'performance rollup',
    count: (db, id) => db.agentMetrics.count({ where: { agent_id: id } }) },
  { key: 'performance_index', kind: 'fk', meaning: 'performance index',
    count: (db, id) => db.agentPerformanceIndex.count({ where: { agent_id: id } }) },
  { key: 'pricing_experiments', kind: 'fk', meaning: 'authored pricing experiment',
    count: (db, id) => db.pricingExperiment.count({ where: { created_by_id: id } }) },
  { key: 'leads', kind: 'fk', meaning: 'assigned client',
    count: (db, id) => db.lead.count({ where: { agent_id: id } }) },
  { key: 'listings', kind: 'fk', meaning: 'Mallan exclusive listing',
    count: (db, id) => db.listing.count({ where: { agent_id: id } }) },
  { key: 'saved_searches', kind: 'fk', meaning: 'saved client search',
    count: (db, id) => db.savedSearch.count({ where: { agent_id: id } }) },
  { key: 'external_listings', kind: 'fk', meaning: 'external inventory record',
    count: (db, id) => db.externalListing.count({ where: { agent_id: id } }) },
  { key: 'external_listing_comments', kind: 'fk', meaning: 'authored comment',
    count: (db, id) => db.externalListingComment.count({ where: { agent_id: id } }) },
  { key: 'seller_leads', kind: 'fk', meaning: 'seller or landlord intake',
    count: (db, id) => db.sellerLead.count({ where: { assigned_agent_id: id } }) },
  { key: 'marketing_activities', kind: 'fk', meaning: 'advertising activity record',
    count: (db, id) => db.marketingActivity.count({ where: { agent_id: id } }) },
  { key: 'active_leases', kind: 'fk', meaning: 'live lease',
    count: (db, id) => db.activeLease.count({ where: { agent_id: id } }) },

  // ── Loose identity references: no FK, so nothing but this protects them ──
  { key: 'offers_as_buyer_agent', kind: 'loose', meaning: 'offer party attribution',
    count: (db, id) => db.offer.count({ where: { buyer_agent_id: id } }) },
  { key: 'offers_as_list_agent', kind: 'loose', meaning: 'offer party attribution',
    count: (db, id) => db.offer.count({ where: { list_agent_id: id } }) },
  { key: 'outreach_events', kind: 'loose', meaning: 'prospecting contact (TCPA relevant)',
    count: (db, id) => db.outreachEvent.count({ where: { agent_id: id } }) },
  { key: 'identity_review_assignments', kind: 'loose', meaning: 'assigned identity review',
    count: (db, id) => db.identityReviewQueue.count({ where: { assigned_to: id } }) },
  { key: 'listing_audits_run', kind: 'loose', meaning: 'listing audit they performed',
    count: (db, id) => db.listingAudit.count({ where: { agent_id: id } }) },
  { key: 'price_changes_made', kind: 'loose', meaning: 'price change they made',
    count: (db, id) => db.priceHistory.count({ where: { changed_by: id } }) },
  { key: 'activity_log_as_actor', kind: 'loose', meaning: 'logged activity they performed',
    count: (db, id) => db.activityLog.count({ where: { actor_id: id, actor_type: { in: ['agent', 'broker'] } } }) },

  /**
   * Audit events where the TARGET WAS THE ACTOR. These prove she did something
   * in the system and must block.
   *
   * Deliberately excluded: events where someone else acted UPON this agent
   * record (`entity_type: 'agent'`, `entity_id: <target>`, `user_id != target`)
   * — the create / profile / photo / purge events from a failed onboarding.
   * Those document the mistake and are preserved, and they must not by
   * themselves make the mistake un-rollbackable.
   */
  { key: 'audit_events_as_actor', kind: 'loose', meaning: 'action they took in the system',
    count: (db, id) => db.auditEvent.count({ where: { user_id: id, user_type: 'agent' } }) },
];

/** Ephemeral authentication rows — removable, they are not history. */
export const EPHEMERAL_TABLES = ['sessions', 'mfa_sessions'] as const;

export type RefusalCode =
  | 'refuse_self'
  | 'refuse_broker_role'
  | 'refuse_has_logged_in'
  | 'refuse_has_business_history';

export interface PurgeTarget {
  id: bigint;
  role: string | null;
  last_login: Date | null;
}

/** Non-zero counts only, in spec order — the exact blockers to report. */
export function blockingCounts(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of PURGE_BLOCKERS) {
    const n = counts[b.key] ?? 0;
    if (n > 0) out[b.key] = n;
  }
  return out;
}

/**
 * The complete eligibility decision. Returns null when the target may be
 * purged, otherwise the reason it is refused.
 *
 * Order matters: identity refusals are reported before history, so a broker is
 * told "this is a broker" rather than handed a list of their own deals.
 */
export function refusePurge(
  target: PurgeTarget,
  callerId: bigint,
  counts: Record<string, number>,
): RefusalCode | null {
  if (target.id === callerId) return 'refuse_self';
  // The AUTHORISATION role, not an informal "principal broker" notion. An
  // Associate Broker holds licence_type "broker" but role "AGENT", so this
  // does not accidentally shield an erroneous associate-broker record.
  if ((target.role ?? '').trim().toUpperCase() === 'BROKER') return 'refuse_broker_role';
  // Ever logged in — regardless of CURRENT status. Deactivating a real agent
  // must not make them purgeable.
  if (target.last_login != null) return 'refuse_has_logged_in';
  if (Object.keys(blockingCounts(counts)).length > 0) return 'refuse_has_business_history';
  return null;
}

export const REFUSAL_MESSAGE: Record<RefusalCode, string> = {
  refuse_self: 'You cannot permanently delete your own agent record.',
  refuse_broker_role:
    'This account holds the BROKER authorisation role and cannot be permanently deleted. Deactivate instead.',
  refuse_has_logged_in:
    'This account has been signed in to, so it is not an unused record. Deactivate instead.',
  refuse_has_business_history:
    'This agent has brokerage history that must be retained. Deactivate to disable access and remove them '
    + 'from the public roster while preserving their records.',
};

/** Run every blocker count against the given client (works inside a transaction). */
export async function countPurgeBlockers(
  db: PurgeDb,
  agentId: bigint,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const b of PURGE_BLOCKERS) {
    counts[b.key] = await b.count(db, agentId);
  }
  return counts;
}

/** The R2 headshot key an agent's uploads use. Reported, never deleted. */
export function headshotObjectKey(publicSlug: string | null | undefined): string | null {
  return publicSlug ? `agents/${publicSlug}/headshot.webp` : null;
}
