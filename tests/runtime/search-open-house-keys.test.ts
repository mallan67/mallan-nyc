/// <reference types="jest" />
/**
 * Open House search runs on Cotality's OpenHouse resource, joined to Property by ListingKey (lib/search/open-house-keys.ts).
 * Live Cotality 2026-10-16: OpenHouse has OpenHouseDate, OpenHouseStatus, OpenHouseType, ListingKey; a date-filtered request returns upcoming events.
 */
jest.mock('@/lib/idx/auth', () => ({ getAccessToken: async () => 'token' }));

import { fetchOpenHouseListingKeys, listingKeyClause, openHouseFilter, validDay, OPEN_HOUSE_MAX_LISTINGS } from '@/lib/search/open-house-keys';
import contract from '@/data/cotality-enums.live.json';

const page = (keys: string[]) => ({ ok: true, status: 200, json: async () => ({ value: keys.map((ListingKey) => ({ ListingKey })) }) }) as unknown as Response;

describe('open house filter', () => {
  it('uses only OpenHouse fields the live contract has', () => {
    const oh = (contract.entities as Record<string, Record<string, string>>).OpenHouse;
    const f = openHouseFilter('2026-10-17', '2026-10-18') as string;
    for (const name of f.match(/[A-Z][A-Za-z]+(?= (?:ge|le|eq) )/g) || []) expect(oh).toHaveProperty(name);
    expect(f).toBe("OpenHouseDate ge 2026-10-17 and OpenHouseDate le 2026-10-18 and OpenHouseStatus eq 'Active' and OpenHouseType eq 'Public'");
  });
  it('a lone start is that day; a lone end starts today; garbage is refused', () => {
    expect(openHouseFilter('2026-10-17', null)).toContain('OpenHouseDate ge 2026-10-17 and OpenHouseDate le 2026-10-17');
    expect(openHouseFilter(null, '2026-10-20', '2026-10-16')).toContain('OpenHouseDate ge 2026-10-16 and OpenHouseDate le 2026-10-20');
    expect(openHouseFilter('x', null)).toBeNull();
    expect(validDay('2026-02-30')).toBeNull();
    expect(validDay("2026-10-17' or 1 eq 1")).toBeNull();
  });
  it('builds a ListingKey clause and escapes quotes', () => {
    expect(listingKeyClause(['1', "2'x"])).toBe("(ListingKey eq '1' or ListingKey eq '2''x')");
  });
});

describe('fetchOpenHouseListingKeys', () => {
  it('returns each listing once, in order, and asks Cotality for exactly the filter', async () => {
    const f = jest.fn().mockResolvedValueOnce(page(['A', 'B', 'A']));
    const r = await fetchOpenHouseListingKeys('2026-10-17', '2026-10-18', f as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, keys: ['A', 'B'], capped: false });
    expect(decodeURIComponent(String(f.mock.calls[0][0]).split("+").join(" "))).toContain('/odata/OpenHouse?$filter=OpenHouseDate ge 2026-10-17');
  });
  it('caps the listings it carries and says so', async () => {
    const many = Array.from({ length: 200 }, (_, i) => 'K' + i);
    const f = jest.fn().mockResolvedValueOnce(page(many)).mockResolvedValueOnce(page(['Z']));
    const r = await fetchOpenHouseListingKeys('2026-10-17', '2026-10-30', f as unknown as typeof fetch);
    expect(r.keys).toHaveLength(OPEN_HOUSE_MAX_LISTINGS);
    expect(r.capped).toBe(true);
  });
  it('reports a provider failure instead of an empty result', async () => {
    const f = jest.fn().mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const r = await fetchOpenHouseListingKeys('2026-10-17', '2026-10-18', f as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('500');
  });
  it('refuses bad dates without calling Cotality', async () => {
    const f = jest.fn();
    expect((await fetchOpenHouseListingKeys('nope', null, f as unknown as typeof fetch)).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
