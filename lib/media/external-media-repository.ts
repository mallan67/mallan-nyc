/**
 * EXTERNAL-MEDIA PERSISTENCE BOUNDARY — the only place that writes
 * `listing_external_media` for the Cotality Property source.
 *
 * Derivation and diffing are pure (`lib/media/external-media.ts`); this module
 * owns nothing but identity resolution, ONE bulk read, and the transaction that
 * applies real changes. That split is what keeps the Cotality hot path off a
 * per-listing query and keeps a steady feed at zero writes.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  buildDesiredCotalityExternalMedia,
  diffExternalMedia,
  type DesiredExternalMediaRow,
  type ExternalMediaKind,
  type StoredExternalMediaRow,
} from './external-media';

export interface ExternalMediaBatchInput {
  /** Canonical Mallan Listing.listing_id — resolved by the CALLER through the
   *  existing ListingKey/ListingId mapping. This module never invents a join. */
  listingId: string;
  /** Raw Cotality Property record carrying the six VirtualTourURL* slots. */
  property: Record<string, unknown>;
}

export interface ExternalMediaBatchResult {
  listingsExamined: number;
  inserts: number;
  updates: number;
  deletes: number;
  unchanged: number;
  /** listing_ids with at least one real mutation — the exact cache-invalidation set. */
  changedListingIds: string[];
}

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Converge a bounded batch of Property records.
 *
 * ONE bulk read for the whole batch, never one per listing. An unchanged batch
 * performs no read-modify-write at all: `inserts+updates+deletes === 0` means no
 * SQL was issued inside the transaction and no `updated_at` moved.
 *
 * CRM-owned rows are never read into the diff scope and never mutated.
 */
export async function convergeExternalMediaBatch(
  prisma: PrismaClient,
  batch: readonly ExternalMediaBatchInput[],
): Promise<ExternalMediaBatchResult> {
  const empty: ExternalMediaBatchResult = {
    listingsExamined: 0, inserts: 0, updates: 0, deletes: 0, unchanged: 0, changedListingIds: [],
  };
  if (batch.length === 0) return empty;

  const listingIds = Array.from(new Set(batch.map((b) => b.listingId).filter(Boolean)));
  if (listingIds.length === 0) return empty;

  // ---- ONE bulk read. Scoped to cotality_property so CRM rows never enter the
  // diff and can never be proposed for deletion.
  const existingRows = await prisma.listingExternalMedia.findMany({
    where: { listing_id: { in: listingIds }, source: 'cotality_property' },
    select: { listing_id: true, source: true, source_key: true, url: true, branded: true, kind: true },
  });

  const existingByListing = new Map<string, StoredExternalMediaRow[]>();
  for (const r of existingRows) {
    const row: StoredExternalMediaRow = {
      listing_id: r.listing_id, source: 'cotality_property',
      source_key: r.source_key, url: r.url, branded: r.branded,
      kind: r.kind as ExternalMediaKind,
    };
    const list = existingByListing.get(r.listing_id);
    if (list) list.push(row); else existingByListing.set(r.listing_id, [row]);
  }

  // ---- Pure derive + diff, entirely in memory.
  const allInserts: DesiredExternalMediaRow[] = [];
  const allUpdates: DesiredExternalMediaRow[] = [];
  const allDeletes: Array<{ listing_id: string; source: string; source_key: string }> = [];
  const changed = new Set<string>();
  let unchanged = 0;

  for (const { listingId, property } of batch) {
    const desired = buildDesiredCotalityExternalMedia(listingId, property);
    const d = diffExternalMedia(existingByListing.get(listingId) ?? [], desired);
    if (d.inserts.length === 0 && d.updates.length === 0 && d.deletes.length === 0) {
      unchanged++;
      continue;
    }
    changed.add(listingId);
    allInserts.push(...d.inserts);
    allUpdates.push(...d.updates);
    allDeletes.push(...d.deletes);
  }

  // ---- Nothing material: issue NO SQL. This is the cost invariant.
  if (allInserts.length === 0 && allUpdates.length === 0 && allDeletes.length === 0) {
    return {
      listingsExamined: batch.length, inserts: 0, updates: 0, deletes: 0,
      unchanged, changedListingIds: [],
    };
  }

  await prisma.$transaction(async (tx: Tx) => {
    if (allDeletes.length > 0) {
      await tx.listingExternalMedia.deleteMany({
        where: {
          OR: allDeletes.map((r) => ({
            listing_id: r.listing_id, source: r.source, source_key: r.source_key,
          })),
        },
      });
    }
    for (const u of allUpdates) {
      // `updated_at` is carried by Prisma's @updatedAt; the column DEFAULT only
      // covers INSERT, so a raw-SQL writer must set it explicitly instead.
      await tx.listingExternalMedia.update({
        where: {
          listing_id_source_source_key: {
            listing_id: u.listing_id, source: u.source, source_key: u.source_key,
          },
        },
        data: { url: u.url, branded: u.branded, kind: u.kind },
      });
    }
    if (allInserts.length > 0) {
      await tx.listingExternalMedia.createMany({
        data: allInserts as unknown as Prisma.ListingExternalMediaCreateManyInput[],
        skipDuplicates: false,
      });
    }
  });

  return {
    listingsExamined: batch.length,
    inserts: allInserts.length,
    updates: allUpdates.length,
    deletes: allDeletes.length,
    unchanged,
    changedListingIds: Array.from(changed),
  };
}
