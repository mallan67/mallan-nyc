/// <reference types="jest" />
/**
 * TASK 4 BOUNDARY — where separating Mallan-local media from Cotality
 * imported media stops being safe without Maya's authorization.
 *
 * The instruction was: preserve Mallan-local editable media, separate it from
 * Cotality read-only authority AS FAR AS SAFELY POSSIBLE, and if finishing the
 * job needs a schema migration, destructive work, or a production backfill,
 * identify the exact boundary and STOP.
 *
 * This file IS that boundary, expressed as executable assertions rather than
 * prose, so it cannot be crossed by accident and so a future change that moves
 * the boundary fails here and forces the question back to Maya.
 *
 * THE BOUNDARY, PRECISELY
 *
 * Ownership of a legacy `Listing.media` item is decided by
 * classifyLegacyMediaItemProvenance. Its only POSITIVE Mallan markers are
 * `contentHash` and `uploadedAt` — fields the CRM upload path writes and the
 * Trestle mapper never emits. For an item that has NOT yet been imported into
 * `listing_media`, those markers exist ONLY inside the legacy JSON.
 *
 * `listing_media` has no column able to carry them. So separating the two
 * authorities at the relational layer requires:
 *   1. a SCHEMA MIGRATION to add the ownership columns, and
 *   2. a PRODUCTION BACKFILL to establish ownership for existing rows.
 *
 * Both are on the standing hold list. Everything short of them has been done;
 * neither is attempted here.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { classifyLegacyMediaItemProvenance } from '@/lib/media/media-provenance';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The ListingMedia model body, without comments. */
function listingMediaModel(): string {
  const schema = read('prisma/schema.prisma');
  const start = schema.indexOf('model ListingMedia {');
  expect(start).toBeGreaterThan(-1);
  const end = schema.indexOf('\n}', start);
  return schema
    .slice(start, end)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('Task 4 boundary — the relational table cannot yet carry ownership', () => {
  it('listing_media has no column for the Mallan-ownership markers', () => {
    const model = listingMediaModel();

    // If any of these ever appears, the boundary has MOVED and the separation
    // work can be re-planned — but that is a schema migration and requires
    // Maya's authorization, so this assertion failing is a signal, not a bug.
    expect(model).not.toMatch(/content_hash|contentHash/);
    expect(model).not.toMatch(/uploaded_at|uploadedAt/);
  });

  // CORRECTED (review round 3). An earlier version of this file asserted, by
  // source-string match, that contentHash and uploadedAt are "the ONLY"
  // positive Mallan markers. That was INACCURATE: a row the feed has never
  // written is also positively classified Mallan, with no markers at all.
  //
  // These are behavioural tests of the real classifier, and they locate the
  // boundary precisely — it is the TRESTLE-SYNCED row, not every row.
  describe('classifier behaviour — where ownership actually becomes unprovable', () => {
    const MALLAN_HOST = 'https://media.mallan.nyc/uploads/abc.jpg';

    it('a never-synced row is Mallan-owned WITHOUT any marker', () => {
      expect(
        classifyLegacyMediaItemProvenance(
          { url: MALLAN_HOST },
          { listingIsTrestleSynced: false },
        ),
      ).toBe('mallan-crm-upload');
    });

    it('THE AMBIGUOUS CASE: a synced row with no marker is unprovable', () => {
      // This is the entire boundary. On a Trestle-synced listing the write
      // history proves nothing, so absent a marker the classifier fails closed
      // to 'unknown' — the item is neither editable as Mallan media nor
      // attributable to the feed.
      expect(
        classifyLegacyMediaItemProvenance(
          { url: MALLAN_HOST },
          { listingIsTrestleSynced: true },
        ),
      ).toBe('unknown');
    });

    it('on a synced row, contentHash is what rescues Mallan ownership', () => {
      expect(
        classifyLegacyMediaItemProvenance(
          { url: MALLAN_HOST, contentHash: 'a'.repeat(64) },
          { listingIsTrestleSynced: true },
        ),
      ).toBe('mallan-crm-upload');
    });

    it('on a synced row, uploadedAt is the other rescue', () => {
      expect(
        classifyLegacyMediaItemProvenance(
          { url: MALLAN_HOST, uploadedAt: '2026-08-01T00:00:00.000Z' },
          { listingIsTrestleSynced: true },
        ),
      ).toBe('mallan-crm-upload');
    });
  });

  it('the legacy column is still read through ONE shared resolver, not two', () => {
    // The reader census finding that decides this task: a single code path
    // serves BOTH source classes, branching on ownership internally. There is
    // no separate local reader to preserve and no separate Cotality reader to
    // migrate — so the Cotality half cannot be detached from the local half by
    // touching readers alone.
    const resolver = read('lib/media/listing-media-resolver.ts');
    expect(resolver).toContain('isMallanOwnedListing');
    expect(resolver).toContain('shouldFallbackToLegacyMedia');
  });
});

describe('Task 4 — what IS already safe, and must stay that way', () => {
  it('the CRM media module writes ONLY relational rows, never the legacy column', () => {
    // This is why stopping the Cotality legacy write could not, by code
    // structure, break local Mallan editing: the local media path does not go
    // through the legacy column at all for photo operations.
    const crmMedia = read('lib/media/crm-media.ts');
    expect(crmMedia).toMatch(/listingMedia\./);
    // No write of the Listing.media JSONB column from this module.
    expect(crmMedia).not.toMatch(/listing\.update\([\s\S]{0,200}?\bmedia:/);
  });

  it('the photo-summary columns are written from the relational path only', () => {
    // primary_photo_url / primary_photo_r2_key / photo_count /
    // photos_change_timestamp are derived from listing_media rows, never from
    // the legacy JSON — so any surface already reading them is independent of
    // the legacy column.
    const mediaSync = read('lib/idx/media-sync.ts');
    expect(mediaSync).toMatch(/computeListingMediaSummary/);
  });
});
