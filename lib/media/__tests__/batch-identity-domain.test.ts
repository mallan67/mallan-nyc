/**
 * QUERY IN ONE DOMAIN, INDEX IN ANOTHER, LOOK UP IN THE FIRST — AND GET NOTHING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * `/api/media/batch` in detail mode grouped provider rows like this:
 *
 *     const mkey = String(m.ResourceRecordKey || m.ResourceRecordID || "");
 *
 * ResourceRecordKey is present on every row, so it always won and the map was
 * keyed by the NUMERIC ListingKey. The route then looked the group up with the
 * identifier the CALLER had sent:
 *
 *     const key = idToKey.get(id) || id;      // 'RLS20112217' for a
 *     const rawItems = rawByKey.get(key)||[]; // provider-only listing
 *
 * For a listing absent from the Mallan database — which is every live-Cotality
 * search result — that is a lookup of 'RLS…' in a map keyed by '1189393822'.
 * It returns []. Deterministically, for every such listing.
 *
 * The visible consequence is the nastiest shape: the card's primary photo works
 * (it asks by key) and the gallery is empty the moment the broker opens the
 * listing. Same listing, same provider, two answers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE
 *
 * The response is grouped in the SAME identity domain the caller asked in. Not
 * "whichever field is present" — that is what let the two drift apart. Proven
 * live 2026-09-01: ResourceRecordKey answers the ListingKey domain and
 * ResourceRecordID answers the ListingId domain, each exactly, and every
 * cross-domain query returns an empty HTTP 200 that looks like "no photos".
 */
import {
  MediaIdentityDomain,
  groupMediaByRequestedDomain,
  mediaFilterForDomain,
  identityFieldFor,
} from '../batch-identity';

/** A provider Media row as Cotality returns it: BOTH fields populated. */
const mediaRow = (order: number, over: Record<string, unknown> = {}) => ({
  ResourceRecordKey: '1189393822', // numeric ListingKey
  ResourceRecordID: 'RLS20112217', // RLS-prefixed ListingId
  MediaURL: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1189393822/${order}/A/B/C`,
  Order: order,
  MediaCategory: 'Photo',
  MediaStatus: 'Active',
  InternetEntireListingDisplayYN: true,
  ...over,
});

const ROWS = [mediaRow(1), mediaRow(2), mediaRow(3)];

describe('grouping happens in the domain the caller requested', () => {
  it('a PROVIDER-KEY request groups under the ListingKey', () => {
    const grouped = groupMediaByRequestedDomain(ROWS, MediaIdentityDomain.PROVIDER_KEY);
    expect([...grouped.keys()]).toEqual(['1189393822']);
    expect(grouped.get('1189393822')).toHaveLength(3);
  });

  it('a PROVIDER-ID request groups under the ListingId — THE REGRESSION TEST', () => {
    // This is the exact case that was broken. Both fields are populated on the
    // row; the old code let ResourceRecordKey win regardless of what was asked.
    const grouped = groupMediaByRequestedDomain(ROWS, MediaIdentityDomain.PROVIDER_ID);
    expect([...grouped.keys()]).toEqual(['RLS20112217']);
    expect(grouped.get('RLS20112217')).toHaveLength(3);
  });

  it('the full provider-only detail path resolves — key numeric, id RLS, no DB row', () => {
    // Maya's stated negative case, end to end through the grouping contract.
    const requested = 'RLS20112217';
    const grouped = groupMediaByRequestedDomain(ROWS, MediaIdentityDomain.PROVIDER_ID);
    // No Mallan DB row, so the identifier stands for itself — exactly what the
    // route does. Under the old grouping this lookup returned [].
    expect(grouped.get(requested) ?? []).toHaveLength(3);
  });
});

describe('a row that cannot answer the requested domain is dropped, not reassigned', () => {
  it('a row missing ResourceRecordID is skipped in a PROVIDER_ID request', () => {
    // Silently falling back to ResourceRecordKey would file this row under an
    // identifier the caller never asked about, where nothing will find it —
    // and it would look like the listing simply had fewer photos.
    const rows = [mediaRow(1), mediaRow(2, { ResourceRecordID: null })];
    const grouped = groupMediaByRequestedDomain(rows, MediaIdentityDomain.PROVIDER_ID);
    expect(grouped.get('RLS20112217')).toHaveLength(1);
    expect([...grouped.keys()]).toEqual(['RLS20112217']);
  });

  it('an EMPTY STRING identity is dropped, not used as a key', () => {
    const rows = [mediaRow(1, { ResourceRecordKey: '' })];
    expect(groupMediaByRequestedDomain(rows, MediaIdentityDomain.PROVIDER_KEY).size).toBe(0);
  });

  it('a row with no MediaURL is dropped — an entry with nothing to show is not media', () => {
    const rows = [mediaRow(1, { MediaURL: null })];
    expect(groupMediaByRequestedDomain(rows, MediaIdentityDomain.PROVIDER_KEY).size).toBe(0);
  });
});

describe('provider display authorization is honoured, and only when explicit', () => {
  it('InternetEntireListingDisplayYN === false is refused', () => {
    const rows = [mediaRow(1), mediaRow(2, { InternetEntireListingDisplayYN: false })];
    expect(groupMediaByRequestedDomain(rows, MediaIdentityDomain.PROVIDER_KEY)
      .get('1189393822')).toHaveLength(1);
  });

  it('null/undefined authorization is NOT treated as a refusal', () => {
    // Explicit false only. Treating absence as denial would blank galleries the
    // provider never restricted — the same over-reading that caused the
    // 2026-04-30 display-gate incident.
    const rows = [
      mediaRow(1, { InternetEntireListingDisplayYN: null }),
      mediaRow(2, { InternetEntireListingDisplayYN: undefined }),
    ];
    expect(groupMediaByRequestedDomain(rows, MediaIdentityDomain.PROVIDER_KEY)
      .get('1189393822')).toHaveLength(2);
  });
});

describe('the filter is built in the same domain the grouping will use', () => {
  it('PROVIDER_KEY filters on ResourceRecordKey', () => {
    expect(mediaFilterForDomain(['123', '456'], MediaIdentityDomain.PROVIDER_KEY))
      .toBe("ResourceRecordKey eq '123' or ResourceRecordKey eq '456'");
  });

  it('PROVIDER_ID filters on ResourceRecordID', () => {
    expect(mediaFilterForDomain(['RLS1'], MediaIdentityDomain.PROVIDER_ID))
      .toBe("ResourceRecordID eq 'RLS1'");
  });

  it('an apostrophe is escaped, never able to close the literal', () => {
    expect(mediaFilterForDomain(["O'X"], MediaIdentityDomain.PROVIDER_ID))
      .toBe("ResourceRecordID eq 'O''X'");
  });

  it('the filter field and the grouping field are the SAME field, by construction', () => {
    // The defect in one sentence: these two were allowed to differ.
    for (const d of [MediaIdentityDomain.PROVIDER_KEY, MediaIdentityDomain.PROVIDER_ID]) {
      expect(mediaFilterForDomain(['X'], d)).toContain(identityFieldFor(d));
    }
  });
});
