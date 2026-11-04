// GET /api/cron/rls-follow
// Every 10 minutes: a Mallan sale listing linked to an RLS ID follows the Cotality record of that RLS ID (Maya, 2026-11-04: "please connect it to the rls number ... realplus is feeding to
// cotality and cotality to me").
//
// The chain is RealPlus -> REBNY RLS -> Cotality -> Mallan. The link is raw_data.saleRlsId, the record's Cotality `ListingId` (RLS20123633); the SL id is Mallan's own and the ListingKey is a
// different identifier. The cards (Featured, Company Exclusives, the agent page) and the listing page read the listing's saved record, so a fact changed upstream reaches them only when this
// record changes. This job changes it, for the facts the public pages show (lib/listings/rls-followed-facts.ts) and nothing else, where a save from the Sale form would write them, and
// expires the public caches so the cards show it within about a minute.
//
// SAFETY:
//   - Only a Mallan-authored listing (SL-/RL-) that carries a valid RLS link and is not closed; only while Cotality says the listing is live.
//   - The record must be the listing's own: one record per RLS ID, listing office Mallan's (fetchRlsRecords refuses anything else, and the refusal is reported).
//   - A fact Cotality has no value for never blanks one; 0 where 0 means "nobody filled it" is no value; the provider's own data and the agent's own words are never read.
//   - Idempotent: a listing that agrees with Cotality is not touched. A write is refused when the listing was saved meanwhile (compare-and-set on modification_timestamp), and tried again
//     on the next run.
//   - If Cotality cannot be reached nothing is written, and the answer says so (HTTP 502).
//   - Every change is an audit event with the old and new value.
//
// Protected by CRON_SECRET (Vercel Cron).
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { buildMallanOwnedListingWhere } from '@/lib/idx/media-sync';
import { fetchRlsRecords } from '@/lib/listings/rls-follow-fetch';
import { planRlsFollow } from '@/lib/listings/rls-followed-facts';
import { rlsLinkOf } from '@/lib/listings/rls-link';
import { buildingAndManifestInvalidationTags, listingCacheTag, safeRevalidateTags, SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';
import { dualWriteProjectionForListingId } from '@/lib/search/listing-search-projection';

export const maxDuration = 60;

// A Draft is the agent's own work in progress and is left alone; a closed, withdrawn or expired listing is no longer followed.
const NOT_CLOSED = ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending'];
const COTALITY_LIVE = new Set(['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending']);
// Every linked listing is read, a page at a time by id (a fixed `take` would read the same first rows on every run and starve the rest: Codex, review of #690). Mallan has tens of linked
// listings; the page cap is a sanity bound, and the time budget keeps one run inside maxDuration (what it did not reach is reported, and is read again by the next run).
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const TIME_BUDGET_MS = 45_000;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader || authHeader.length !== ('Bearer ' + cronSecret).length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from('Bearer ' + cronSecret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const select = {
    id: true, listing_id: true, status: true, modification_timestamp: true,
    list_price: true, bedrooms_total: true, bathrooms_full: true, bathrooms_half: true, living_area: true,
    features: true, address: true, raw_data: true,
  } as const;
  const linked: Array<Prisma.ListingGetPayload<{ select: typeof select }>> = [];
  let cursor: bigint | null = null;
  let capped = false;
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) { capped = true; break; }
    const rows: typeof linked = await prisma.listing.findMany({
      where: {
        AND: [buildMallanOwnedListingWhere()],
        status: { in: NOT_CLOSED },
        raw_data: { path: ['saleRlsId'], string_starts_with: 'RLS' },
        ...(cursor !== null ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      select,
    });
    linked.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }

  const summary = { linked: linked.length, changed: 0, unchanged: 0, capped, timeBudgetReached: false, skipped: [] as Array<{ listing_id: string; reason: string }>, failed: [] as Array<{ listing_id: string; error: string }> };
  if (!linked.length) return NextResponse.json(summary);

  const byRls = new Map<string, typeof linked>();
  for (const l of linked) {
    const link = rlsLinkOf(obj(l.raw_data));
    if (!link.rls) { summary.skipped.push({ listing_id: l.listing_id, reason: 'the RLS link is not an RLS ID' }); continue; }
    byRls.set(link.rls, [...(byRls.get(link.rls) ?? []), l]);
  }

  const fetched = await fetchRlsRecords([...byRls.keys()]);
  if (!fetched.ok) {
    console.error('[cron/rls-follow] Cotality could not be asked; nothing was written:', fetched.error);
    return NextResponse.json({ error: fetched.error, ...summary, written: false }, { status: 502 });
  }
  const refusedBy = new Map(fetched.refused.map((r) => [r.rls, r.reason]));

  const tags = new Set<string>();
  for (const [rls, listings] of byRls) {
    if (Date.now() - started > TIME_BUDGET_MS) { summary.timeBudgetReached = true; break; }
    const record = fetched.records.get(rls);
    if (!record) {
      for (const l of listings) summary.skipped.push({ listing_id: l.listing_id, reason: refusedBy.get(rls) ?? 'Cotality did not answer for this RLS ID' });
      continue;
    }
    if (!COTALITY_LIVE.has(String(record.StandardStatus ?? ''))) {
      for (const l of listings) summary.skipped.push({ listing_id: l.listing_id, reason: `Cotality says the listing is ${String(record.StandardStatus ?? 'unknown')}: its facts are not followed` });
      continue;
    }
    for (const l of listings) {
      if (l.listing_id.startsWith('RLS')) { summary.skipped.push({ listing_id: l.listing_id, reason: 'a Cotality row, not a Mallan listing' }); continue; }
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
        // compare-and-set: a listing saved in the CRM since it was read is left alone and tried again on the next run. The search projection (price, bedrooms, baths, area and the
        // modification time are mirrored there) is written in the SAME transaction: if it fails the update is rolled back, so the next run sees the same difference and tries again
        // (Codex, review of #690: a swallowed projection failure left search stale for good).
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
  }

  if (tags.size) safeRevalidateTags([...tags, SEARCH_CACHE_TAG]);
  return NextResponse.json(summary);
}
