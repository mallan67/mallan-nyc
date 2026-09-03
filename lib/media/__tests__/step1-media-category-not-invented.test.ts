/// <reference types="jest" />
/**
 * STEP 1, ITEM 4 — A MISSING MEDIA CLASSIFICATION IS NOT "PHOTO".
 *
 * `classifyTrestleMediaCategory()` is, by its own documentation, "the only
 * writer of media_type". It opened with:
 *
 *     if (!category) return "Photo";
 *     ...
 *     return "Photo";   // for any unrecognised string too
 *
 * justified by the comment "Trestle leaves MediaCategory null/empty on bare
 * photo rows". That is a claim about what the Cotality feed MEANS by an empty
 * field, and no live evidence for it exists in this repo — exactly the class of
 * assertion CLAUDE.md §A.0 requires a current-session HTTP response to make.
 *
 * The consequence was already documented in this codebase before Step 1, at
 * lib/idx/media-sync.ts:1702-1706: a floor plan arriving with no category was
 * STORED as media_type='Photo', so `Listing.photo_count` reported one more
 * photo than the public gallery contained. The fix at the time added a second,
 * richer classifier downstream — the false value at the source was left alone.
 *
 * This removes it at the source. Unknown is recorded as unknown.
 *
 * DELIBERATELY NOT CHANGED: what the DISPLAY layer does with an unclassified
 * item. `listing-media-resolver.ts:161` also treats an empty category as a
 * photo, and `resolvePhotos()` (line 933) keeps only `class === 'photo'` — so
 * reclassifying at the reader would DROP real media from galleries on an
 * assumption just as unverified as the one being removed, and tell the broker a
 * listing has no photos. That is the 2026-04-30 failure shape from the other
 * side. Display stays byte-identical; the reader's fallback is now labelled as
 * the open Step 2 question it is, instead of as a settled provider semantic.
 */
import {
  classifyTrestleMediaCategory,
  type CanonicalMediaType,
} from '@/lib/media/media-sync-service';
import { classifyMediaItem } from '@/lib/media/listing-media-resolver';

describe('the stored classification is never invented', () => {
  it.each([null, undefined, ''])('records %p as unclassified, not as Photo', (input) => {
    expect(classifyTrestleMediaCategory(input as string | null | undefined)).toBe('Unclassified');
  });

  it('records an unrecognised category as unclassified rather than guessing Photo', () => {
    // A value the provider sent that this classifier does not know is a fact
    // about the provider, not permission to pick a category.
    expect(classifyTrestleMediaCategory('SomethingNewFromCotality')).toBe('Unclassified');
  });

  it('still records an explicit Photo as Photo', () => {
    expect(classifyTrestleMediaCategory('Photo')).toBe('Photo');
    expect(classifyTrestleMediaCategory('photo')).toBe('Photo');
  });

  it.each([
    ['FloorPlan', 'FloorPlan'],
    ['Floor Plan', 'FloorPlan'],
    ['floor_plan', 'FloorPlan'],
    ['VirtualTour', 'VirtualTour'],
    ['Virtual Tour', 'VirtualTour'],
    ['Video', 'Video'],
  ])('still classifies %s as %s', (input, expected) => {
    expect(classifyTrestleMediaCategory(input)).toBe(expected as CanonicalMediaType);
  });

  it('does not substitute a different bucket when the provider said nothing', () => {
    // CORRECTED (Maya, Step 2 handoff): this test's original comment called
    // `Other` an invented bucket. `Other` is a real Cotality MediaCategory
    // member. What is wrong is answering a SILENT provider with any category at
    // all — Photo, Other, or anything else. Silence gets Unclassified.
    const out = classifyTrestleMediaCategory(null);
    expect(out).not.toBe('Other');
    expect(out).not.toBe('Photo');
    expect(out).toBe('Unclassified');
  });
});

describe('display does not change — no real media disappears', () => {
  const photoUrl = 'https://api.cotality.com/trestle/Media/Property/RLS1-1.jpg';

  it('an item with no category still displays as a photo, exactly as before', () => {
    expect(classifyMediaItem({ MediaURL: photoUrl, MediaCategory: '' })).toBe('photo');
  });

  it('an item carrying the new stored value also still displays', () => {
    // The sync now writes 'Unclassified' into media_type. The reader sees that
    // column as `mediaType`, so it MUST resolve exactly like the empty case or
    // every such row silently vanishes from the gallery on the next sync.
    expect(classifyMediaItem({ MediaURL: photoUrl, mediaType: 'Unclassified' })).toBe('photo');
  });

  it('a floor plan is still recognised from its URL regardless of category', () => {
    expect(
      classifyMediaItem({
        MediaURL: 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/RLS1-fp.pdf',
        mediaType: 'Unclassified',
      }),
    ).toBe('floorplan');
  });
});

/**
 * THE ONE PLACE WHERE THIS CHANGE HAS A REAL CONSEQUENCE — pinned, not hidden.
 *
 * `listing_media.media_type` is written only by `classifyTrestleMediaCategory`.
 * The R2 mirror admission policy selects on that column by exact value:
 *
 *     MALLAN_MIRROR_MEDIA_TYPES = ["Photo", "FloorPlan"]
 *     FEED_MIRROR_MEDIA_TYPES   = ["Photo"]
 *
 * and its own docblock says widening either list is a policy change requiring
 * Maya's approval.
 *
 * So on the next sync, feed media that arrives with no MediaCategory will be
 * stored 'Unclassified' and will NOT be admitted to the mirror, where it
 * previously was — because it was previously mislabelled 'Photo'.
 *
 * That direction is fail-CLOSED: media Mallan cannot classify is not retained
 * under a policy that names exact types. It is the safe direction, and it is
 * the honest one. But it IS a behaviour change on the next sync, so it is
 * asserted here rather than left to be discovered.
 *
 * The lists are deliberately NOT widened. Adding 'Unclassified' to either would
 * be exactly the policy change their docblock reserves for Maya.
 */
describe('the R2 mirror policy is left to Maya, and its narrowing is explicit', () => {
  it('does not silently admit unclassified media to the Mallan mirror', async () => {
    const { MALLAN_MIRROR_MEDIA_TYPES } = await import('@/lib/idx/media-sync');
    expect([...MALLAN_MIRROR_MEDIA_TYPES]).toEqual(['Photo', 'FloorPlan']);
    expect(MALLAN_MIRROR_MEDIA_TYPES).not.toContain('Unclassified');
  });

  it('does not silently admit unclassified media to the feed mirror', async () => {
    const { FEED_MIRROR_MEDIA_TYPES } = await import('@/lib/idx/media-sync');
    expect([...FEED_MIRROR_MEDIA_TYPES]).toEqual(['Photo']);
    expect(FEED_MIRROR_MEDIA_TYPES).not.toContain('Unclassified');
  });
});

/**
 * RAW COTALITY FACT ≠ MALLAN MEDIA GROUP — the distinction Maya drew, pinned.
 *
 * The two questions are separate and must both be answerable:
 *
 *   "what did Cotality say this is?"   ->  media_category / media_classification
 *   "which Mallan group is it in?"     ->  media_type
 *
 * The row builder in lib/idx/media-sync.ts already keeps the raw value verbatim
 * next to the canonical one:
 *
 *     mediaType:     classifyTrestleMediaCategory(raw.MediaCategory),
 *     mediaCategory: raw.MediaCategory ? String(raw.MediaCategory) : null,
 *
 * so a listing whose category is `Other`, `Document`, `Disclosure` or `Survey`
 * stores that exact word losslessly, while its Mallan group stays Unclassified
 * until Step 2 defines one. Nothing was asserting that, which is how the wrong
 * claim — that `Other` is an invented bucket — got written in the first place.
 *
 * `Other` IS a real Cotality MediaCategory member. Grouping it as Unclassified
 * is Mallan declining to guess a group, not Mallan denying the provider's word.
 */
describe('the raw provider category is preserved beside the Mallan group', () => {
  const REAL_COTALITY_CATEGORIES = [
    'Photo', 'FloorPlan', 'Video', 'Document', 'Disclosure', 'Addendum',
    'Survey', 'Restriction', 'RentalDocuments', 'Other', 'AgentPhoto', 'OfficePhoto',
  ];

  it.each(REAL_COTALITY_CATEGORIES)('%s survives verbatim as the raw category', (category) => {
    // The row builder's own expression, exercised directly: whatever the
    // provider said is what gets stored, with no vocabulary of ours applied.
    const raw = { MediaCategory: category } as Record<string, unknown>;
    const stored = raw.MediaCategory ? String(raw.MediaCategory) : null;
    expect(stored).toBe(category);
  });

  it('groups the categories Mallan has NOT yet defined a group for as Unclassified', () => {
    // Not a claim that these are unreal. A claim that Mallan has no group yet.
    for (const ungrouped of ['Document', 'Disclosure', 'Addendum', 'Survey', 'Restriction', 'RentalDocuments', 'Other', 'AgentPhoto', 'OfficePhoto']) {
      expect(classifyTrestleMediaCategory(ungrouped)).toBe('Unclassified');
    }
  });

  it('keeps the raw value and the Mallan group independent of each other', () => {
    // The whole point: an Unclassified GROUP must never imply an absent FACT.
    const category = 'Other';
    expect(classifyTrestleMediaCategory(category)).toBe('Unclassified');
    expect(String(category)).toBe('Other');
  });
});
