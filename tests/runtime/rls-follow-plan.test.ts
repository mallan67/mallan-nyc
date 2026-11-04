/// <reference types="jest" />
/**
 * What a Mallan listing takes from the Cotality record of its RLS ID (Maya, 2026-11-04: "please connect it to the rls number ... realplus is feeding to cotality and cotality to me").
 *
 * The fixture is the live Cotality record of RLS20123633, read with the same $select the cron uses: Maya had changed bedrooms 0 -> 8 and full baths 2 -> 3 in RealPlus, and the Mallan record
 * (SL-0010) still held the numbers of the first pull, so every card (Featured, Company Exclusives, the agent page) said "0 bd · 2 ba".
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { cleanFact, FOLLOWED_FACTS, planRlsFollow, type ListingFollowState } from '@/lib/listings/rls-followed-facts';
import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';

const LIVE_RLS20123633 = {
  BathroomsFull: 3, LivingArea: 1482, RoomsTotal: 8, BedroomsTotal: 8, BuildingName: null, AssociationFeeFrequency: 'Monthly', ListOfficeMlsId: '7041', BathroomsHalf: 0,
  ListPrice: 1200000, StandardStatus: 'Active', TaxAnnualAmount: null, ListingId: 'RLS20123633', AssociationFee: 1588, StoriesTotal: 18, YearBuilt: 1957, ListingKey: '1194314473',
};

// SL-0010 as the first pull saved it
const SL0010: ListingFollowState = {
  list_price: '1200000', bedrooms_total: 0, bathrooms_full: 2, bathrooms_half: 0, living_area: '1482',
  features: { YearBuilt: 1957, StoriesTotal: 18, RoomsTotal: 8, AssociationFee: 1588, AssociationFeeFrequency: 'Monthly' },
  address: { StreetNumber: '800', StreetName: '2ND' },
  raw_data: { saleRlsId: 'RLS20123633', saleBedrooms: '0', saleFullBaths: '2', BedroomsTotal: 0, BathroomsFull: 2, RoomsTotal: 8, saleTotalRooms: '8', PublicRemarks: 'Our own description.' },
};

describe('SL-0010 against the live record of RLS20123633', () => {
  const plan = planRlsFollow(SL0010, LIVE_RLS20123633);

  it('takes exactly what changed: bedrooms 0 -> 8 and full baths 2 -> 3', () => {
    expect(plan.changes).toEqual([
      { field: 'BedroomsTotal', from: 0, to: 8 },
      { field: 'BathroomsFull', from: 2, to: 3 },
    ]);
    expect(plan.columns).toEqual({ bedrooms_total: 8, bathrooms_full: 3 });
    expect(plan.features).toEqual({});
    expect(plan.address).toEqual({});
  });

  it('writes each changed fact under its Cotality name AND the Sale form\'s own box id (the form restores a box from its own key first), and nothing else', () => {
    expect(plan.raw).toEqual({ BedroomsTotal: 8, saleBedrooms: 8, BathroomsFull: 3, saleFullBaths: 3 });
  });

  it('a listing that agrees with Cotality has an empty plan: it is not touched', () => {
    const agreed = planRlsFollow({ ...SL0010, bedrooms_total: 8, bathrooms_full: 3 }, LIVE_RLS20123633);
    expect(agreed.changes).toEqual([]);
    expect(agreed.columns).toEqual({});
    expect(agreed.raw).toEqual({});
  });

  it('a value held as text or as a number is the same value (a Decimal "1482" and Cotality\'s 1482)', () => {
    expect(planRlsFollow({ ...SL0010, bedrooms_total: 8, bathrooms_full: 3, living_area: '1482.00', list_price: '1200000.00' }, LIVE_RLS20123633).changes).toEqual([]);
  });
});

describe('what is no fact', () => {
  const byName = (n: string) => FOLLOWED_FACTS.find((f) => f.cotality === n)!;

  it('a missing fact, the text "null" and an empty string never blank or replace anything', () => {
    for (const v of [null, undefined, '', 'null', 'undefined', 'None', 'N/A', ' ']) {
      for (const f of FOLLOWED_FACTS) expect(cleanFact(f, v)).toBeUndefined();
    }
    const plan = planRlsFollow(SL0010, { BuildingName: 'null', TaxAnnualAmount: null, AssociationFee: '', YearBuilt: undefined });
    expect(plan.changes).toEqual([]);
  });

  it('0 is a fact for bedrooms, full and half baths (a studio, an office) and no fact for a price, an area, rooms, a year, stories, a fee or a tax', () => {
    for (const n of ['BedroomsTotal', 'BathroomsFull', 'BathroomsHalf']) expect(cleanFact(byName(n), 0)).toBe(0);
    for (const n of ['ListPrice', 'LivingArea', 'RoomsTotal', 'YearBuilt', 'StoriesTotal', 'AssociationFee', 'TaxAnnualAmount']) expect(cleanFact(byName(n), 0)).toBeUndefined();
    expect(planRlsFollow(SL0010, { ...LIVE_RLS20123633, AssociationFee: 0, TaxAnnualAmount: 0, ListPrice: 0 }).changes.map((c) => c.field)).toEqual(['BedroomsTotal', 'BathroomsFull']);
  });

  it('a negative number or text where a number belongs is no fact', () => {
    for (const f of FOLLOWED_FACTS.filter((x) => x.kind !== 'text')) {
      expect(cleanFact(f, -1)).toBeUndefined();
      expect(cleanFact(f, 'abc')).toBeUndefined();
    }
  });

  it('whole numbers are whole, and numbers that are not are kept (a fee of 1,588.50)', () => {
    expect(cleanFact(byName('BedroomsTotal'), 8.9)).toBe(8);
    expect(cleanFact(byName('AssociationFee'), '1588.5')).toBe(1588.5);
    expect(cleanFact(byName('BuildingName'), '  The Tudor  ')).toBe('The Tudor');
  });
});

describe('where each fact goes: the same place a save from the Sale form puts it', () => {
  const planFor = (cotality: Record<string, unknown>) => planRlsFollow({ list_price: 1, bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 1, living_area: 1, features: {}, address: { StreetName: '2ND' }, raw_data: {} }, cotality);

  it('the price, the rooms and the area go to their typed columns; the building\'s year, stories, rooms, fee and tax to the features bucket; its name to the address bucket', () => {
    const p = planFor({ ListPrice: 1150000, BedroomsTotal: 7, BathroomsFull: 2, BathroomsHalf: 1, LivingArea: 1500, RoomsTotal: 9, YearBuilt: 1960, StoriesTotal: 20, AssociationFee: 1700, AssociationFeeFrequency: 'Monthly', TaxAnnualAmount: 19000, BuildingName: 'The Tudor' });
    expect(p.columns).toEqual({ list_price: 1150000, bedrooms_total: 7, bathrooms_full: 2, living_area: 1500 });      // half baths 1 -> 1 is no change
    expect(p.features).toEqual({ RoomsTotal: 9, YearBuilt: 1960, StoriesTotal: 20, AssociationFee: 1700, AssociationFeeFrequency: 'Monthly', TaxAnnualAmount: 19000 });
    expect(p.address).toEqual({ BuildingName: 'The Tudor' });
  });

  // Codex, review of #690: an older listing whose fact is only in raw_data has an empty public place (the features bucket the page reads, or the typed column). A raw_data fallback called such
  // a fact "unchanged" and left the public place empty on every run.
  it('a fact held only in raw_data (an older save) is written to the public bucket the page reads, every run until it is there', () => {
    const older = { list_price: 1, bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 1, living_area: 1, features: {}, address: {}, raw_data: { YearBuilt: '1957', StoriesTotal: 18 } };
    const p = planRlsFollow(older, { YearBuilt: 1957, StoriesTotal: 18 });
    expect(p.changes).toEqual([{ field: 'YearBuilt', from: null, to: 1957 }, { field: 'StoriesTotal', from: null, to: 18 }]);
    expect(p.features).toEqual({ YearBuilt: 1957, StoriesTotal: 18 });
    // once the bucket holds it, the plan is empty
    expect(planRlsFollow({ ...older, features: { YearBuilt: 1957, StoriesTotal: 18 } }, { YearBuilt: 1957, StoriesTotal: 18 }).changes).toEqual([]);
  });

  it('a typed column that is empty (null) while raw_data holds the number is filled too, and the building\'s name goes to the address bucket', () => {
    const older = { list_price: 1200000, bedrooms_total: null, bathrooms_full: 3, bathrooms_half: 0, living_area: 1482, features: {}, address: {}, raw_data: { BedroomsTotal: 8, BuildingName: 'The Tudor' } };
    const p = planRlsFollow(older, { BedroomsTotal: 8, BuildingName: 'The Tudor' });
    expect(p.columns).toEqual({ bedrooms_total: 8 });
    expect(p.address).toEqual({ BuildingName: 'The Tudor' });
    expect(p.changes.map((c) => c.field)).toEqual(['BedroomsTotal', 'BuildingName']);
  });
});

describe('the table matches the Sale form and the persistence map', () => {
  const HTML = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8').replace(/\r\n/g, '\n');
  const formFollows = (HTML.match(/var SALE_COTALITY_FOLLOWS = \[([\s\S]*?)\];/)?.[1] ?? '').match(/'([A-Za-z]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
  const formPositive = (HTML.match(/var SALE_COTALITY_POSITIVE = \[([\s\S]*?)\];/)?.[1] ?? '').match(/'([A-Za-z]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
  const map = [...HTML.matchAll(/\{ rls: '([A-Za-z]+)', form: '([A-Za-z0-9]+)'/g)].reduce<Record<string, string[]>>((acc, m) => { (acc[m[1]] = acc[m[1]] ?? []).push(m[2]); return acc; }, {});

  it('every fact the server follows is also followed by the form when it opens', () => {
    expect(formFollows.length).toBeGreaterThan(15);
    for (const f of FOLLOWED_FACTS) expect(formFollows).toContain(f.cotality);
  });

  it('0 is "nobody filled it" for the same facts in the form as on the server', () => {
    expect([...formPositive].sort()).toEqual(FOLLOWED_FACTS.filter((f) => f.positiveOnly).map((f) => f.cotality).sort());
  });

  it('the Sale form\'s own box ids the server writes are the boxes the form maps to that Cotality name', () => {
    for (const f of FOLLOWED_FACTS) {
      const own = f.raw.filter((k) => k !== f.cotality);
      expect(own.length).toBeGreaterThan(0);
      for (const k of own) expect(map[f.cotality] ?? []).toContain(k);
    }
  });

  it('each fact is routed as the persistence map routes it', () => {
    const pm = REBNY_FIELD_TABLES.persistenceMap as Record<string, { db?: string; features?: boolean; address?: boolean; raw?: boolean }>;
    for (const f of FOLLOWED_FACTS) {
      const target = pm[f.cotality];
      expect(target).toBeDefined();
      if (f.bucket === 'column') expect(target.db).toBe(f.column);
      if (f.bucket === 'features') expect(target.features).toBe(true);
      if (f.bucket === 'address') expect(target.address).toBe(true);
      expect(target.raw).toBe(true);
    }
  });
});
