/// <reference types="jest" />
/**
 * Twin-safe open-house matching for the listing-detail panel (follow-up to #463).
 *
 * /api/open-houses dedupes a local CRM open house (SL-0007) against its Cotality RLS twin
 * (RLS20099289) and keeps only the Trestle entry. The detail panel previously matched by exact
 * listingId only, so the SL-0007 page (listing.id="SL-0007") never matched the deduped feed entry
 * (listingId="RLS20099289"). This pins the twin-safe selector: match by exact listingId OR by a
 * shared normalized addressKey (the same key the canonical resolver / dedup use).
 */
import { selectListingOpenHouses } from '@/lib/open-houses/select-open-houses';

const NOW = new Date('2099-01-01T00:00:00Z');
const mk = (o: Partial<{ id: string; listingId: string; addressKey: string; date: string; startTime: string; endTime: string }> = {}) => ({
  id: o.id ?? 'x', listingId: o.listingId ?? '', addressKey: o.addressKey ?? '',
  address: '', date: o.date ?? '2099-06-02', startTime: o.startTime ?? '5:00 PM', endTime: o.endTime ?? '6:00 PM',
});

describe('selectListingOpenHouses — twin-safe listing-detail matching', () => {
  it('exact listingId match still works', () => {
    const out = selectListingOpenHouses([mk({ listingId: 'SL-0007' })], { listingId: 'SL-0007', now: NOW });
    expect(out).toHaveLength(1);
  });

  it('SL-0007 page matches a deduped RLS20099289 open house by addressKey', () => {
    const out = selectListingOpenHouses(
      [mk({ listingId: 'RLS20099289', addressKey: '40090th4d' })],
      { listingId: 'SL-0007', listingAddressKey: '40090th4d', now: NOW },
    );
    expect(out).toHaveLength(1);
    expect(out[0].listingId).toBe('RLS20099289');
  });

  it('no false match when address keys differ', () => {
    const out = selectListingOpenHouses(
      [mk({ listingId: 'RLS999', addressKey: '99other' })],
      { listingId: 'SL-0007', listingAddressKey: '40090th4d', now: NOW },
    );
    expect(out).toHaveLength(0);
  });

  it('empty address keys never match each other (no accidental "" === "")', () => {
    const out = selectListingOpenHouses(
      [mk({ listingId: 'RLS999', addressKey: '' })],
      { listingId: 'SL-0007', listingAddressKey: '', now: NOW },
    );
    expect(out).toHaveLength(0);
  });

  it('preserves current behavior when no page address key is available (exact-id only)', () => {
    const out = selectListingOpenHouses(
      [mk({ listingId: 'RLS20099289', addressKey: '40090th4d' })],
      { listingId: 'SL-0007', now: NOW }, // no listingAddressKey
    );
    expect(out).toHaveLength(0);
  });

  it('dedups so no duplicate cards render when both id and addressKey match the same slot', () => {
    const out = selectListingOpenHouses(
      [
        mk({ id: 'a', listingId: 'SL-0007', addressKey: '40090th4d', date: '2099-06-02', startTime: '5:00 PM', endTime: '6:00 PM' }),
        mk({ id: 'b', listingId: 'RLS20099289', addressKey: '40090th4d', date: '2099-06-02', startTime: '5:00 PM', endTime: '6:00 PM' }),
      ],
      { listingId: 'SL-0007', listingAddressKey: '40090th4d', now: NOW },
    );
    expect(out).toHaveLength(1); // one slot → one card
  });

  it('drops past dates and caps at 4 upcoming', () => {
    const all = [
      mk({ id: 'past', listingId: 'SL-0007', date: '2098-01-01' }),
      ...Array.from({ length: 6 }, (_, i) => mk({ id: String(i), listingId: 'SL-0007', date: `2099-06-0${i + 1}` })),
    ];
    const out = selectListingOpenHouses(all, { listingId: 'SL-0007', now: NOW });
    expect(out).toHaveLength(4);
    expect(out.some((o) => o.date === '2098-01-01')).toBe(false);
  });
});
