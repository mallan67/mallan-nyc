/**
 * Media has different owners (Maya 2026-09-08). On the live feed `Media.ResourceName` is one of Building, Contacts,
 * Member, Office, Property (the published vocabulary; live rows 2026-09-08: Property 2,002,862 · Building 62 · Member,
 * Office, Contacts 0) and `Media.ResourceRecordKey` links to the owning resource. MEMBER media = agent photos (never a
 * listing photo); PROPERTY media = listing photos / floor plans / videos / tours / documents with ordering and primary
 * photo semantics; BUILDING media = building media (never copied into a unit). No consumer may flatten the contexts.
 *
 * The resolver is the one interpreter of provider Media rows: it names the owners from the live vocabulary, classifies
 * a row's owner exactly, and a LISTING gallery keeps Property rows only.
 */
import {
  MEDIA_OWNERS,
  MEDIA_SELECT_FIELDS,
  PROPERTY_MEDIA_FILTER,
  mediaOwnerFilter,
  mediaOwnerOf,
  partitionMediaByOwner,
  pickPrimaryPhotoUrl,
  resolveListingMedia,
} from '../listing-media-resolver';

const P = (url: string, order: number, extra: Record<string, unknown> = {}) => ({ MediaURL: url, MediaCategory: 'Photo', Order: order, ResourceName: 'Property', ResourceRecordKey: '1185770203', ...extra });
const B = (url: string, order: number) => ({ MediaURL: url, MediaCategory: 'Photo', Order: order, ResourceName: 'Building', ResourceRecordKey: '1737703' });
const M = (url: string) => ({ MediaURL: url, MediaCategory: 'AgentPhoto', Order: 1, ResourceName: 'Member', ResourceRecordKey: '33213126' });

describe('the owner vocabulary is the live one', () => {
  it('names exactly the five published ResourceName members and selects ResourceName on every Media query', () => {
    expect([...MEDIA_OWNERS].sort()).toEqual(['Building', 'Contacts', 'Member', 'Office', 'Property']);
    expect(MEDIA_SELECT_FIELDS).toContain('ResourceName');
  });
  it('classifies a row by its exact ResourceName; absent or foreign values are null, never guessed from a key shape', () => {
    expect(mediaOwnerOf({ ResourceName: 'Property' })).toBe('Property');
    expect(mediaOwnerOf({ ResourceName: 'Building' })).toBe('Building');
    expect(mediaOwnerOf({ ResourceName: 'Member' })).toBe('Member');
    expect(mediaOwnerOf({ ResourceRecordKey: '1737703' })).toBeNull();
    expect(mediaOwnerOf({ ResourceName: 'property' })).toBeNull();
    expect(mediaOwnerOf(null)).toBeNull();
  });
  it('publishes the one Property predicate for top-level Media queries', () => {
    expect(PROPERTY_MEDIA_FILTER).toBe("ResourceName eq 'Property'");
    expect(mediaOwnerFilter('Building')).toBe("ResourceName eq 'Building'");
  });
});

describe('a listing gallery is Property media only', () => {
  it('drops Building and Member rows that arrive under a listing key; keeps Property rows in order; a table row without ResourceName is Property by construction', () => {
    const resolved = resolveListingMedia([B('https://x/b1.jpg', 1), P('https://x/p2.jpg', 2), M('https://x/agent.jpg'), P('https://x/p1.jpg', 1), { MediaURL: 'https://x/legacy.jpg', MediaCategory: 'Photo', Order: 3 }]);
    expect(resolved.map((m) => m.url)).toEqual(['https://x/p1.jpg', 'https://x/p2.jpg', 'https://x/legacy.jpg']);
    expect(resolved.every((m) => m.owner === 'Property')).toBe(true);
    expect(resolved[0].isPrimary).toBe(true);
  });
  it('never picks a Building or Member row as the primary photo', () => {
    expect(pickPrimaryPhotoUrl([B('https://x/building.jpg', 1), M('https://x/agent.jpg')])).toBeNull();
    expect(pickPrimaryPhotoUrl([B('https://x/building.jpg', 1), P('https://x/unit.jpg', 5)])).toBe('https://x/unit.jpg');
  });
  it('partitions rows by owner without discarding any context', () => {
    const parts = partitionMediaByOwner([B('https://x/b1.jpg', 1), P('https://x/p1.jpg', 1), M('https://x/agent.jpg'), { MediaURL: 'https://x/nokey.jpg' }]);
    expect(parts.Property).toHaveLength(1);
    expect(parts.Building).toHaveLength(1);
    expect(parts.Member).toHaveLength(1);
    expect(parts.Office).toHaveLength(0);
    expect(parts.Contacts).toHaveLength(0);
    expect(parts.unknown).toHaveLength(1);
  });
});
