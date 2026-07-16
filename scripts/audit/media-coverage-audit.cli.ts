#!/usr/bin/env tsx
// scripts/audit/media-coverage-audit.cli.ts
//
// tsx entry point for the READ-ONLY media-coverage audit. Run via:
//   npm run media:audit                 # Neon-only (DB-empty → UNKNOWN)
//   npm run media:audit:cotality        # + live read-only Cotality probe (split B vs D)
//   npm run media:audit -- --json       # machine-readable
//
// Wires the real Prisma + Cotality read-only deps into runAudit(). ZERO writes.

import prisma from '@/lib/prisma';
import { runAudit, type AuditDeps, type AuditListingRow } from './media-coverage-audit';
import { BUCKET_LABEL, type CotalityProbe, type MediaCoverageBucket } from '@/lib/media/media-coverage-bucket';

async function main() {
  const withCotality = process.argv.includes('--with-cotality');
  const asJson = process.argv.includes('--json');

  const deps: AuditDeps = {
    fetchListings: () => prisma.listing.findMany({
      select: {
        listing_id: true, rls_eligible: true, status: true,
        idx_display_yn: true, internet_entire_listing_display_yn: true,
        owner_opt_out: true, participant_only: true, media: true,
        _count: { select: { listing_media: true } },
        listing_media: {
          where: { status: 'active' },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            media_url_original: true, media_url_cached: true, media_type: true,
            media_category: true, media_classification: true, order: true,
            preferred_photo_yn: true, status: true,
          },
        },
      },
    }) as unknown as Promise<AuditListingRow[]>,
    ...(withCotality ? {
      probeCotality: async (listingId: string): Promise<CotalityProbe> => {
        try {
          const { fetchListingMedia } = await import('@/lib/idx/fetch');
          const media = await fetchListingMedia(listingId); // READ-ONLY GET
          const photos = (media || []).filter((m: { mediaType?: string }) =>
            !m.mediaType || String(m.mediaType).toLowerCase() === 'photo').length;
          return { status: 'confirmed', photoCount: photos };
        } catch (e) {
          return { status: 'unknown', reason: e instanceof Error ? e.message : 'cotality probe error' };
        }
      },
    } : {}),
  };

  try {
    const res = await runAudit(deps);
    if (asJson) {
      console.log(JSON.stringify({ mode: 'READ-ONLY audit — no writes', withCotality, ...res }, null, 2));
    } else {
      console.log('=== Media coverage buckets (READ-ONLY) ===');
      for (const k of Object.keys(res.tally) as MediaCoverageBucket[]) {
        console.log(`  ${k.padEnd(11)} ${String(res.tally[k]).padStart(6)}  ${BUCKET_LABEL[k]}`);
      }
      if (withCotality) console.log(`\nCotality UNKNOWN/errors: ${res.cotalityFailures}`);
    }
    if (res.incomplete) {
      console.error(`\nINCOMPLETE: ${res.cotalityFailures} Cotality probe(s) returned UNKNOWN — cannot finalize B vs D. Exiting nonzero.`);
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('audit failed (READ-ONLY, no writes):', e?.message || e); process.exitCode = 1; });
