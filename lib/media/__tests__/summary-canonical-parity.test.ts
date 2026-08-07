/**
 * SUMMARY PARITY GATE — persisted `Listing` summary columns vs canonical public media.
 *
 * Before any card/list surface may read the persisted summary columns
 * (`primary_photo_url`, `primary_photo_r2_key`, `photo_count`), the values that
 * WRITER produces must agree with what the canonical public reader produces.
 * Otherwise a card would advertise a hero or a photo count the detail page
 * contradicts.
 *
 * THE SEMANTIC-RISK CHAIN UNDER TEST
 * ----------------------------------
 *   media-sync `SummarySourceRow` carries ONLY:
 *       media_type, status, preferred_photo_yn, order,
 *       media_url_original, r2_key, timestamps
 *   ...with NO `media_category` and NO `media_classification`.
 *
 *   `filterActivePhotoRows` therefore keys purely on
 *       String(r.media_type).toLowerCase() === 'photo'
 *
 *   The canonical public resolver additionally considers media_category,
 *   media_classification and the Trestle DOCUMENT-* URL shape.
 *
 * So a row stored as media_type='Photo' can be canonically a FloorPlan. These
 * tests establish, per fixture, whether the two agree.
 *
 * INVARIANT (not just array lengths):
 *   SUMMARY HERO IDENTITY == CANONICAL PUBLIC HERO IDENTITY
 *   SUMMARY PHOTO COUNT   == CANONICAL PUBLIC PHOTO COUNT
 */

import { computeListingMediaSummary, type SummarySourceRow } from '../../idx/media-sync';
import { composeDbPublicMedia } from '../db-media-composition';

const PHOTO = (n: number) =>
  `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1178013${n}/1/A/B/C${n}`;
const DOC_PDF =
  'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/117801399/1/A/B/C';

/** A row in BOTH shapes, so the two derivations see the same underlying fact. */
interface Row {
  media_type: string;
  media_category: string | null;
  media_classification: string | null;
  media_url_original: string;
  order: number;
  preferred_photo_yn: boolean;
  status: string;
}

const toSummaryRow = (r: Row): SummarySourceRow => ({
  media_type: r.media_type,
  status: r.status,
  preferred_photo_yn: r.preferred_photo_yn,
  order: r.order,
  media_url_original: r.media_url_original,
  r2_key: null,
  media_modification_ts: null,
  modification_ts: null,
});

const toTableRow = (r: Row) => ({
  media_url_original: r.media_url_original,
  media_url_cached: null,
  media_type: r.media_type,
  media_category: r.media_category,
  media_classification: r.media_classification,
  order: r.order,
  preferred_photo_yn: r.preferred_photo_yn,
  status: r.status,
});

function bothViews(rows: Row[]) {
  const summary = computeListingMediaSummary(rows.map(toSummaryRow));
  const canonical = composeDbPublicMedia({
    listingId: 'RLS20105333',
    rlsEligible: true,
    tableRows: rows.map(toTableRow) as never,
    legacyMedia: [],
    hadRelationalRows: true,
  });
  return { summary, canonical };
}

const photoRow = (n: number, over: Partial<Row> = {}): Row => ({
  media_type: 'Photo', media_category: 'Photo', media_classification: null,
  media_url_original: PHOTO(n), order: n, preferred_photo_yn: false,
  status: 'active', ...over,
});

describe('A. normal Photo — both agree', () => {
  it('counts and heroes identically', () => {
    const { summary, canonical } = bothViews([photoRow(0, { preferred_photo_yn: true }), photoRow(1)]);
    expect(summary.photo_count).toBe(2);
    expect(canonical.photoCount).toBe(2);
    expect(summary.primary_photo_url).toBe(PHOTO(0));
    expect(canonical.media[0].url).toContain(encodeURIComponent(PHOTO(0)));
  });
});

describe('B. explicit FloorPlan — neither counts it as a Photo', () => {
  it('photo_count and canonical photoCount both exclude it', () => {
    const rows = [
      photoRow(0, { preferred_photo_yn: true }),
      { media_type: 'Document', media_category: 'Floor Plan', media_classification: 'FloorPlan',
        media_url_original: DOC_PDF, order: 1, preferred_photo_yn: false, status: 'active' } as Row,
    ];
    const { summary, canonical } = bothViews(rows);
    expect(summary.photo_count).toBe(1);
    expect(canonical.photoCount).toBe(1);
  });
});

/**
 * C/D are the RISK CASES: stored `media_type` says Photo, but the canonical
 * classifier has extra evidence (classification / DOCUMENT-* URL shape).
 */
describe('C. media_category null + MediaClassification Document + DOCUMENT-Pdf URL', () => {
  const rows: Row[] = [
    photoRow(0, { preferred_photo_yn: true }),
    { media_type: 'Photo', media_category: null, media_classification: 'Document',
      media_url_original: DOC_PDF, order: 1, preferred_photo_yn: false, status: 'active' },
  ];

  it('canonical MUST NOT treat it as a Photo', () => {
    const { canonical } = bothViews(rows);
    expect(canonical.photoCount).toBe(1);
  });

  /**
   * ✅ PARITY RESTORED 2026-08-07 (commit 7A).
   *
   * This previously DIVERGED: canonical 1 vs summary 2, because
   * `filterActivePhotoRows` tested only `media_type === 'photo'` while the
   * canonical reader also weighed MediaClassification and the DOCUMENT-* URL
   * shape. `SummarySourceRow` now carries media_category /
   * media_classification and the filter DELEGATES to `classifyMediaItem`.
   * Kept as an EQUALITY test, not deleted — it is the regression guard.
   */
  it('PARITY: summary photo_count EQUALS canonical photoCount', () => {
    const { summary, canonical } = bothViews(rows);
    expect(canonical.photoCount).toBe(1);
    expect(summary.photo_count).toBe(1);
    expect(summary.photo_count).toBe(canonical.photoCount);
  });
});

describe('D. media_category null + floorplan-shaped URL', () => {
  const rows: Row[] = [
    photoRow(0, { preferred_photo_yn: true }),
    { media_type: 'Photo', media_category: null, media_classification: null,
      media_url_original: DOC_PDF, order: 1, preferred_photo_yn: false, status: 'active' },
  ];

  /** Same case via URL shape alone — parity restored with C. See case C. */
  it('PARITY: summary photo_count EQUALS canonical photoCount', () => {
    const { summary, canonical } = bothViews(rows);
    expect(canonical.photoCount).toBe(1);
    expect(summary.photo_count).toBe(1);
    expect(summary.photo_count).toBe(canonical.photoCount);
  });
});

describe('E. preferred Photo + lower-order FloorPlan — Photo stays hero', () => {
  it('both pick the Photo as hero', () => {
    const rows: Row[] = [
      { media_type: 'Document', media_category: 'Floor Plan', media_classification: 'FloorPlan',
        media_url_original: DOC_PDF, order: 0, preferred_photo_yn: false, status: 'active' },
      photoRow(1, { preferred_photo_yn: true }),
    ];
    const { summary, canonical } = bothViews(rows);
    expect(summary.primary_photo_url).toBe(PHOTO(1));
    expect(canonical.media[0].mediaType).toBe('Photo');
    expect(canonical.media[0].url).toContain(encodeURIComponent(PHOTO(1)));
  });
});

describe('F. 67 Photos + 1 FloorPlan', () => {
  const rows: Row[] = [
    ...Array.from({ length: 67 }, (_, i) => photoRow(i, { preferred_photo_yn: i === 0 })),
    { media_type: 'Document', media_category: 'Floor Plan', media_classification: 'FloorPlan',
      media_url_original: DOC_PDF, order: 99, preferred_photo_yn: false, status: 'active' },
  ];

  it('both report photoCount 67', () => {
    const { summary, canonical } = bothViews(rows);
    expect(summary.photo_count).toBe(67);
    expect(canonical.photoCount).toBe(67);
  });

  it('both hero the same Photo', () => {
    const { summary, canonical } = bothViews(rows);
    expect(summary.primary_photo_url).toBe(PHOTO(0));
    expect(canonical.media[0].url).toContain(encodeURIComponent(PHOTO(0)));
  });
});

describe('G/H. Video and VirtualTour do not increment photo count', () => {
  it('Video', () => {
    const rows: Row[] = [photoRow(0, { preferred_photo_yn: true }),
      { media_type: 'Video', media_category: 'Video', media_classification: null,
        media_url_original: 'https://www.youtube.com/watch?v=abc', order: 1,
        preferred_photo_yn: false, status: 'active' }];
    const { summary, canonical } = bothViews(rows);
    expect(summary.photo_count).toBe(1);
    expect(canonical.photoCount).toBe(1);
  });

  it('VirtualTour / Matterport', () => {
    const rows: Row[] = [photoRow(0, { preferred_photo_yn: true }),
      { media_type: 'VirtualTour', media_category: 'Virtual Tour', media_classification: null,
        media_url_original: 'https://my.matterport.com/show/?m=abc', order: 1,
        preferred_photo_yn: false, status: 'active' }];
    const { summary, canonical } = bothViews(rows);
    expect(summary.photo_count).toBe(1);
    expect(canonical.photoCount).toBe(1);
  });
});

describe('I. all rows deleted', () => {
  it('summary is empty and canonical media is empty', () => {
    const rows: Row[] = [photoRow(0, { status: 'deleted', preferred_photo_yn: true })];
    const { summary, canonical } = bothViews(rows);
    expect(summary.photo_count).toBe(0);
    expect(summary.primary_photo_url).toBeNull();
    expect(canonical.media).toHaveLength(0);
  });
});
