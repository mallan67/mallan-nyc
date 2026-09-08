/**
 * The one Media select (Domain 2, 2026-09-08): every field the media interpreters read from a provider
 * Media row must be requested by the one select the program sends. The census of 2026-09-08 found four
 * sites selecting fewer fields than `classifyMediaItem` reads (MediaClassification, ShortDescription),
 * so classification silently degraded to URL-shape heuristics on those paths.
 */
import { MEDIA_SELECT_FIELDS } from '../listing-media-resolver';

/** Provider Media fields read by classifyMediaItem / resolveListingMedia / media-sync upsert (evidence in the census). */
const READ_BY_INTERPRETERS = [
  'ResourceRecordKey',
  'ResourceRecordID',
  'MediaKey',
  'MediaURL',
  'MediaCategory',
  'MediaClassification',
  'ShortDescription',
  'Order',
  'PreferredPhotoYN',
  'MediaStatus',
  'Permission',
  'ModificationTimestamp',
  'MediaModificationTimestamp',
] as const;

describe('MEDIA_SELECT_FIELDS — the one Media select', () => {
  it('requests every field the interpreters read', () => {
    const selected = new Set<string>(MEDIA_SELECT_FIELDS);
    expect(READ_BY_INTERPRETERS.filter((f) => !selected.has(f))).toEqual([]);
  });

  it('carries no duplicate and no field nothing reads (MediaType is the file format, never consulted)', () => {
    expect(new Set(MEDIA_SELECT_FIELDS).size).toBe(MEDIA_SELECT_FIELDS.length);
    expect(MEDIA_SELECT_FIELDS).not.toContain('MediaType');
  });
});
