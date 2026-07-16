#!/usr/bin/env tsx
// scripts/backfill/bucket-b-media-dry-run.cli.ts
//
// tsx entry point for the READ-ONLY Bucket-B dry-run planner. Run via:
//   npm run media:backfill:dryrun
//   npm run media:backfill:dryrun -- --json
//
// Wires the real Prisma + Cotality READ-ONLY deps into runDryRun(). NEVER writes.

import prisma from '@/lib/prisma';
import {
  runDryRun, ROLLBACK_NOTE,
  type DryRunDeps, type DryRunListingRow, type AllStatusRow, type CotalityPhoto,
} from './bucket-b-media-dry-run';
import type { ListingMediaTableRow } from '@/lib/media/listing-media-resolver';

async function main() {
  const asJson = process.argv.includes('--json');
  const deps: DryRunDeps = {
    fetchCandidates: () => prisma.listing.findMany({
      select: {
        listing_id: true, rls_eligible: true, status: true,
        idx_display_yn: true, internet_entire_listing_display_yn: true,
        owner_opt_out: true, participant_only: true, media: true,
        _count: { select: { listing_media: true } },
        listing_media: {
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            id: true, status: true, media_key: true, media_url_original: true,
            media_url_cached: true, order: true, media_type: true,
            media_category: true, media_classification: true, preferred_photo_yn: true,
          },
        },
      },
    }).then((ls) => ls.map((l) => ({
      ...l,
      listing_media_active: (l.listing_media as unknown as (AllStatusRow & ListingMediaTableRow)[]).filter((r) => r.status === 'active'),
      listing_media_all: (l.listing_media as unknown as AllStatusRow[]).map((r) => ({ ...r, id: String(r.id) })),
    }))) as unknown as Promise<DryRunListingRow[]>,
    probeCotality: async (listingId: string) => {
      try {
        const { fetchListingMedia } = await import('@/lib/idx/fetch');
        const media = await fetchListingMedia(listingId); // READ-ONLY GET
        const photos: CotalityPhoto[] = (media || [])
          .filter((m: { mediaType?: string }) => !m.mediaType || String(m.mediaType).toLowerCase() === 'photo')
          .map((m: { url?: string; MediaURL?: string }, i: number) => ({ order: i, sourceUrl: String(m.url || m.MediaURL || '') }));
        return { status: 'confirmed', photoCount: photos.length, photos };
      } catch (e) {
        return { status: 'unknown', reason: e instanceof Error ? e.message : 'cotality probe error' };
      }
    },
  };
  try {
    const res = await runDryRun(deps);
    if (asJson) console.log(JSON.stringify({ mode: 'DRY-RUN — nothing written', ...res, rollback: ROLLBACK_NOTE }, null, 2));
    else {
      console.log('=== Bucket B backfill DRY-RUN (nothing written) ===');
      console.log(`  eligible listings: ${res.eligibleListings}`);
      console.log(`  expected inserts/restores/updates/unchanged: ${res.totals.inserts}/${res.totals.restores}/${res.totals.updates}/${res.totals.unchanged}`);
      console.log(`  Cotality UNKNOWN/errors (skipped, not planned): ${res.cotalityFailures}`);
      console.log('\n' + ROLLBACK_NOTE);
    }
  } finally { await prisma.$disconnect(); }
}

main().catch((e) => { console.error('dry-run failed (nothing written):', e?.message || e); process.exitCode = 1; });
