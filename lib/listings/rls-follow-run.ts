// A Mallan listing linked to an RLS ID follows the Cotality record of that RLS ID (Maya, 2026-11-04: "please connect it to the rls number ... realplus is feeding to cotality and cotality to
// me").
//
// The chain is RealPlus -> REBNY RLS -> Cotality -> Mallan. The link is raw_data.saleRlsId, the record's Cotality `ListingId` (RLS20123633); the SL id is Mallan's own and the ListingKey is a
// different identifier. The cards (Featured, Company Exclusives, the agent page) and the listing page read the listing's saved record, so a fact changed upstream reaches them only when this
// record changes. This changes it, for the facts the public pages show (lib/listings/rls-followed-facts.ts) and nothing else, where a save from the Sale form would write them, and expires the
// public caches so the cards show it within about a minute.
//
// WHEN IT RUNS: after the One Cycle, inside the one scheduled entrypoint (app/api/cron/one-cycle-preflight), and only when the preflight let the cycle reach Neon. It has no schedule of its own:
// a second every-10-minutes cron would wake Neon on every poll, which is exactly what the preflight exists to avoid (tests/runtime/one-cycle-unified-cadence-contract.test.ts holds "exactly one
// preflight every ten minutes"). /api/cron/rls-follow remains as a manual trigger for the same function.
//
// SAFETY:
//   - Only a Mallan-authored listing (SL-/RL-) that carries a valid RLS link and is not closed; only while Cotality says the listing is live.
//   - The record must be the listing's own, three ways: one record per RLS ID and the listing office Mallan's (fetchRlsRecords refuses anything else); one Mallan listing per RLS ID (a link
//     two listings share is followed by neither); and the record's street, number, unit and ZIP are the listing's (rls-follow-identity.ts). Every refusal is reported, and recorded once a day.
//   - A fact Cotality has no value for never blanks one; 0 where 0 means "nobody filled it" is no value; the provider's own data and the agent's own words are never read.
//   - It never changes a listing's status. When Cotality says a linked listing is no longer live (withdrawn, closed, expired ...), the Mallan listing is left as it is and the difference is
//     reported and recorded once a day (statusMismatch): changing what the public sees is a status change with its own rules (DOM, compliance, terminal dates), made in the CRM.
//   - Idempotent: a listing that agrees with Cotality is not touched. A write is refused when the listing was saved meanwhile (compare-and-set on modification_timestamp), and tried again
//     on the next run. The search projection is written in the same transaction, so a failure rolls the update back and the next run tries again.
//   - If Cotality cannot be reached nothing is written, and the answer says so.
//   - Every change is an audit event with the old and new value.
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { buildMallanOwnedListingWhere } from '@/lib/idx/media-sync';
import { fetchRlsRecords } from '@/lib/listings/rls-follow-fetch';
import { planRlsFollow } from '@/lib/listings/rls-followed-facts';
import { verifyLinkedAddress } from '@/lib/listings/rls-follow-identity';
import { rlsLinkOf } from '@/lib/listings/rls-link';
import { buildingAndManifestInvalidationTags, listingCacheTag, safeRevalidateTags, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';
import { dualWriteProjectionForListingId } from '@/lib/search/listing-search-projection';

// A Draft is the agent's own work in progress and is left alone; a closed, withdrawn or expired listing is no longer followed.
const NOT_CLOSED = ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending'];
const COTALITY_LIVE = new Set(['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending']);
// Every linked listing is read, a page at a time by id (a fixed `take` would read the same first rows on every run and starve the rest: Codex, review of #690). Mallan has tens of linked
// listings; the page cap is a sanity bound, and the time budget keeps one run inside the caller's duration (what it did not reach is reported, and is read again by the next run).
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
export const DEFAULT_BUDGET_MS = 45_000;
const REPORT_ONCE_PER_MS = 24 * 60 * 60 * 1000;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export type RlsFollowSummary = {
  linked: number;
  changed: number;
  unchanged: number;
  capped: boolean;
  timeBudgetReached: boolean;
  skipped: Array<{ listing_id: string; reason: string }>;
  failed: Array<{ listing_id: string; error: string }>;
  /** RLS IDs that more than one Mallan listing carries: none of those listings is followed. */
  duplicateLinks: Array<{ rls: string; listings: string[] }>;
  /** Listings whose Cotality record is for another address or unit: not followed. */
  notTheSameUnit: Array<{ listing_id: string; rls: string; reason: string }>;
  /** Listings Mallan still carries live while Cotality says otherwise: left as they are. */
  statusMismatch: Array<{ listing_id: string; rls: string; cotalityStatus: string }>;
};

export type RlsFollowResult = { httpStatus: number; summary: RlsFollowSummary & { error?: string; written?: boolean } };

const SELECT = {
  id: true, listing_id: true, status: true, modification_timestamp: true, postal_code: true,
  list_price: true, bedrooms_total: true, bathrooms_full: true, bathrooms_half: true, living_area: true,
  features: true, address: true, raw_data: true,
} as const;
type ListingRow = Prisma.ListingGetPayload<{ select: typeof SELECT }>;

/**
 * Recorded once a day per listing and reason, not on every run: a listing that stays withdrawn at Cotality would otherwise add a row every ten minutes. Best effort: a logging failure never
 * changes what the run does.
 */
async function recordOnce(listing: ListingRow, action: 'rls_follow_refused' | 'rls_follow_status_mismatch', key: string, detail: Record<string, unknown>): Promise<void> {
  try {
    const recent = await prisma.auditEvent.findMany({
      where: { action, entity_type: 'listing', entity_id: listing.id.toString(), created_at: { gte: new Date(Date.now() - REPORT_ONCE_PER_MS) } },
      select: { changes: true },
      take: 20,
    });
    if (recent.some((e) => obj(e.changes).key === key)) return;
    await prisma.auditEvent.create({
      data: { action, entity_type: 'listing', entity_id: listing.id.toString(), user_type: 'system', user_id: null, changes: { listing_id: listing.listing_id, key, ...detail } as unknown as Prisma.InputJsonValue },
    });
  } catch { /* reporting must not change what the run does */ }
}

export async function runRlsFollow(opts: { budgetMs?: number } = {}): Promise<RlsFollowResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const linked: ListingRow[] = [];
  let cursor: bigint | null = null;
  let capped = false;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) { capped = true; break; }
    const rows: ListingRow[] = await prisma.listing.findMany({
      where: {
        AND: [buildMallanOwnedListingWhere()],
        status: { in: NOT_CLOSED },
        raw_data: { path: ['saleRlsId'], string_starts_with: 'RLS' },
        ...(cursor !== null ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      select: SELECT,
    });
    linked.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }

  const summary: RlsFollowSummary = { linked: linked.length, changed: 0, unchanged: 0, capped, timeBudgetReached: false, skipped: [], failed: [], duplicateLinks: [], notTheSameUnit: [], statusMismatch: [] };
  if (!linked.length) return { httpStatus: 200, summary };

  const byRls = new Map<string, ListingRow[]>();
  for (const l of linked) {
    const link = rlsLinkOf(obj(l.raw_data));
    if (!link.rls) { summary.skipped.push({ listing_id: l.listing_id, reason: 'the RLS link is not an RLS ID' }); continue; }
    byRls.set(link.rls, [...(byRls.get(link.rls) ?? []), l]);
  }

  // One RLS ID, one Mallan listing (lib/listings/rls-link.ts enforces it when the link is written). A link two listings share anyway (older data) is followed by neither: which of them the
  // record belongs to is not something a job can decide.
  for (const [rls, listings] of byRls) {
    if (listings.length < 2) continue;
    const ids = listings.map((l) => l.listing_id).sort();
    summary.duplicateLinks.push({ rls, listings: ids });
    for (const l of listings) summary.skipped.push({ listing_id: l.listing_id, reason: `RLS ID ${rls} is linked to ${ids.length} Mallan listings (${ids.join(', ')}): none is followed until one link is removed` });
    for (const l of listings) await recordOnce(l, 'rls_follow_refused', `duplicate:${rls}:${ids.join(',')}`, { rls_id: rls, reason: 'duplicate_link', listings: ids });
    byRls.delete(rls);
  }
  if (!byRls.size) return { httpStatus: 200, summary };

  const fetched = await fetchRlsRecords([...byRls.keys()]);
  if (!fetched.ok) {
    console.error('[rls-follow] Cotality could not be asked; nothing was written:', fetched.error);
    return { httpStatus: 502, summary: { ...summary, error: fetched.error, written: false } };
  }
  const refusedBy = new Map(fetched.refused.map((r) => [r.rls, r.reason]));

  const tags = new Set<string>();
  for (const [rls, listings] of byRls) {
    if (Date.now() - started > budget) { summary.timeBudgetReached = true; break; }
    const l = listings[0];
    const record = fetched.records.get(rls);
    if (!record) {
      summary.skipped.push({ listing_id: l.listing_id, reason: refusedBy.get(rls) ?? 'Cotality did not answer for this RLS ID' });
      continue;
    }
    if (l.listing_id.startsWith('RLS')) { summary.skipped.push({ listing_id: l.listing_id, reason: 'a Cotality row, not a Mallan listing' }); continue; }

    const identity = verifyLinkedAddress(l, record);
    if (!identity.ok) {
      summary.skipped.push({ listing_id: l.listing_id, reason: identity.reason });
      summary.notTheSameUnit.push({ listing_id: l.listing_id, rls, reason: identity.reason });
      await recordOnce(l, 'rls_follow_refused', `identity:${identity.reason}`, { rls_id: rls, reason: 'not_the_same_unit', detail: identity.reason });
      continue;
    }

    const cotalityStatus = String(record.StandardStatus ?? '');
    if (!COTALITY_LIVE.has(cotalityStatus)) {
      summary.skipped.push({ listing_id: l.listing_id, reason: `Cotality says the listing is ${cotalityStatus || 'unknown'}: its facts are not followed, and its status is left as it is` });
      summary.statusMismatch.push({ listing_id: l.listing_id, rls, cotalityStatus: cotalityStatus || 'unknown' });
      await recordOnce(l, 'rls_follow_status_mismatch', `status:${cotalityStatus || 'unknown'}`, { rls_id: rls, cotality_status: cotalityStatus || 'unknown', mallan_status: l.status });
      continue;
    }

    const plan = planRlsFollow(l, record);
    if (!plan.changes.length) { summary.unchanged++; continue; }
    try {
      const data: Prisma.ListingUpdateManyMutationInput = {
        modification_timestamp: new Date(),
        ...plan.columns,
        raw_data: { ...obj(l.raw_data), ...plan.raw } as Prisma.InputJsonValue,
      };
      if (Object.keys(plan.features).length) data.features = { ...obj(l.features), ...plan.features } as Prisma.InputJsonValue;
      if (Object.keys(plan.address).length) data.address = { ...obj(l.address), ...plan.address } as Prisma.InputJsonValue;
      // compare-and-set: a listing saved in the CRM since it was read is left alone and tried again on the next run. The search projection (price, bedrooms, baths, area and the modification
      // time are mirrored there) is written in the SAME transaction: if it fails the update is rolled back, so the next run sees the same difference and tries again (Codex, review of #690).
      const written = await prisma.$transaction(async (tx) => {
        const done = await tx.listing.updateMany({ where: { id: l.id, modification_timestamp: l.modification_timestamp }, data });
        if (done.count !== 1) return false;
        await dualWriteProjectionForListingId(tx as unknown as Parameters<typeof dualWriteProjectionForListingId>[0], l.listing_id);
        return true;
      });
      if (!written) { summary.skipped.push({ listing_id: l.listing_id, reason: 'saved meanwhile: tried again on the next run' }); continue; }
      summary.changed++;
      tags.add(listingCacheTag(l.listing_id));
      for (const t of buildingAndManifestInvalidationTags(l.address)) tags.add(t);
      await prisma.auditEvent.create({
        data: {
          action: 'rls_follow',
          entity_type: 'listing',
          entity_id: l.id.toString(),
          user_type: 'system',
          user_id: null,
          changes: { listing_id: l.listing_id, rls_id: rls, source: 'cotality', changes: plan.changes } as unknown as Prisma.InputJsonValue,
        },
      }).catch(() => { /* a logging failure must not undo the update */ });
    } catch (err) {
      summary.failed.push({ listing_id: l.listing_id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (tags.size) safeRevalidateTags([...tags, SEARCH_CACHE_TAG]);
  return { httpStatus: 200, summary };
}
