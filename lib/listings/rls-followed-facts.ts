/**
 * The facts of a Mallan listing that follow the Cotality record of its RLS ID (Maya, 2026-11-04: "please connect it to the rls number ... realplus is feeding to cotality and cotality to me").
 *
 * The chain is RealPlus -> REBNY RLS -> Cotality -> Mallan. A Mallan sale listing is linked to its Cotality record by the RLS ID (the record's `ListingId`, RLS20123633), kept in
 * raw_data.saleRlsId; the link is the only thing this module reads. What the link keeps current is what the public pages SHOW: the price, the rooms, the areas, the year and the stories, the
 * building's name, the maintenance and the taxes. It never touches what the agent writes or decides (description, status, dates, agent, commission, media, property type), and never the
 * provider's own data. Each fact is written where a save from the Sale form writes it (lib/compliance/rebny-field-tables.ts persistenceMap), so the cards, the listing page and the form all
 * read the same answer:
 *   column   -> a typed column of the listing (list_price, bedrooms_total ...)
 *   features -> the features bucket the public page reads
 *   address  -> the address bucket (the building's name)
 * and every fact is also written to raw_data under its Cotality name AND the Sale form's own box ids (the form restores a box from its own key first).
 *
 * tests/runtime/rls-follow-plan.test.ts holds this table to the Sale form's own follow list and field map, so the form and the server cannot drift.
 */

import { IDENTITY_SELECT } from '@/lib/listings/rls-follow-identity';

export type FollowedFact = {
  /** The live Cotality Property field. */
  cotality: string;
  kind: 'int' | 'number' | 'text';
  /** Where a save from the Sale form stores it. */
  bucket: 'column' | 'features' | 'address';
  /** The typed column, when the bucket is `column`. */
  column?: 'list_price' | 'bedrooms_total' | 'bathrooms_full' | 'bathrooms_half' | 'living_area';
  /** A value of 0 or less is "nobody filled it" (a $0 maintenance, a 0-story building), not a fact. A bedroom or bathroom count of 0 is a fact (a studio, an office). */
  positiveOnly: boolean;
  /** The raw_data keys that carry it: the Cotality name, then the Sale form's own box ids. */
  raw: string[];
};

export const FOLLOWED_FACTS: readonly FollowedFact[] = [
  { cotality: 'ListPrice', kind: 'number', bucket: 'column', column: 'list_price', positiveOnly: true, raw: ['ListPrice', 'salePrice'] },
  { cotality: 'BedroomsTotal', kind: 'int', bucket: 'column', column: 'bedrooms_total', positiveOnly: false, raw: ['BedroomsTotal', 'saleBedrooms'] },
  { cotality: 'BathroomsFull', kind: 'int', bucket: 'column', column: 'bathrooms_full', positiveOnly: false, raw: ['BathroomsFull', 'saleFullBaths'] },
  { cotality: 'BathroomsHalf', kind: 'int', bucket: 'column', column: 'bathrooms_half', positiveOnly: false, raw: ['BathroomsHalf', 'saleHalfBaths'] },
  { cotality: 'LivingArea', kind: 'number', bucket: 'column', column: 'living_area', positiveOnly: true, raw: ['LivingArea', 'saleUnitSqFt', 'saleLivingArea'] },
  { cotality: 'RoomsTotal', kind: 'int', bucket: 'features', positiveOnly: true, raw: ['RoomsTotal', 'saleTotalRooms'] },
  { cotality: 'YearBuilt', kind: 'int', bucket: 'features', positiveOnly: true, raw: ['YearBuilt', 'saleBldgYearBuilt'] },
  { cotality: 'StoriesTotal', kind: 'int', bucket: 'features', positiveOnly: true, raw: ['StoriesTotal', 'saleBldgTotalFloors'] },
  { cotality: 'AssociationFee', kind: 'number', bucket: 'features', positiveOnly: true, raw: ['AssociationFee', 'saleMaintCC'] },
  { cotality: 'AssociationFeeFrequency', kind: 'text', bucket: 'features', positiveOnly: false, raw: ['AssociationFeeFrequency', 'saleMaintCCFreq'] },
  { cotality: 'TaxAnnualAmount', kind: 'number', bucket: 'features', positiveOnly: true, raw: ['TaxAnnualAmount', 'saleRETaxes'] },
  { cotality: 'BuildingName', kind: 'text', bucket: 'address', positiveOnly: false, raw: ['BuildingName', 'saleBldgName'] },
];

/** The Cotality fields to ask for: the followed facts, and what proves the record is the listing's (its id, its office, and its address and unit: rls-follow-identity.ts). */
export const FOLLOW_SELECT = ['ListingId', 'ListingKey', 'ListOfficeMlsId', 'StandardStatus', ...IDENTITY_SELECT, ...FOLLOWED_FACTS.map((f) => f.cotality)];

const NO_VALUE_TEXT = /^(null|undefined|none|n\/a)?$/i;

/** A Cotality answer as the fact it is, or undefined when it is no fact ("", the text "null", a count of 0 where 0 means "nobody filled it"). */
export function cleanFact(fact: FollowedFact, value: unknown): number | string | undefined {
  if (value === null || value === undefined) return undefined;
  if (fact.kind === 'text') {
    const t = String(value).trim();
    return NO_VALUE_TEXT.test(t) ? undefined : t;
  }
  if (typeof value === 'string' && NO_VALUE_TEXT.test(value.trim())) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (fact.positiveOnly ? n <= 0 : n < 0) return undefined;
  return fact.kind === 'int' ? Math.trunc(n) : n;
}

export type ListingFollowState = {
  list_price: unknown;
  bedrooms_total: unknown;
  bathrooms_full: unknown;
  bathrooms_half: unknown;
  living_area: unknown;
  features: unknown;
  address: unknown;
  raw_data: unknown;
};

export type FactChange = { field: string; from: number | string | null; to: number | string };

export type FollowPlan = {
  changes: FactChange[];
  columns: Partial<Record<NonNullable<FollowedFact['column']>, number>>;
  features: Record<string, number | string>;
  address: Record<string, number | string>;
  raw: Record<string, number | string>;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * What the listing's PUBLIC place holds now for a fact: the typed column, or the features / address bucket the public page reads. raw_data is not consulted: an older listing whose fact is
 * only in raw_data has an empty public place, and the plan must fill it (Codex, review of #690: a raw_data fallback marked such a fact "unchanged" and left the column or bucket empty on
 * every run).
 */
function heldNow(fact: FollowedFact, listing: ListingFollowState): number | string | null {
  const held =
    fact.bucket === 'column' ? (listing as unknown as Record<string, unknown>)[fact.column as string]
    : fact.bucket === 'features' ? obj(listing.features)[fact.cotality]
    : obj(listing.address)[fact.cotality];
  if (held === undefined || held === null || held === '') return null;
  return fact.kind === 'text' ? String(held) : Number(held);
}

const same = (fact: FollowedFact, a: number | string | null, b: number | string) =>
  a !== null && (fact.kind === 'text' ? String(a).trim().toLowerCase() === String(b).trim().toLowerCase() : Number(a) === Number(b));

/**
 * What the Cotality record changes in the listing. Only a fact Cotality has a value for is considered (a missing fact never blanks one), and only a fact that differs is written, so a
 * listing that agrees with Cotality has an empty plan and is not touched.
 */
export function planRlsFollow(listing: ListingFollowState, cotality: Record<string, unknown>): FollowPlan {
  const plan: FollowPlan = { changes: [], columns: {}, features: {}, address: {}, raw: {} };
  for (const fact of FOLLOWED_FACTS) {
    const to = cleanFact(fact, cotality[fact.cotality]);
    if (to === undefined) continue;
    const from = heldNow(fact, listing);
    if (same(fact, from, to)) continue;
    plan.changes.push({ field: fact.cotality, from, to });
    if (fact.bucket === 'column') plan.columns[fact.column as NonNullable<FollowedFact['column']>] = to as number;
    else if (fact.bucket === 'features') plan.features[fact.cotality] = to;
    else plan.address[fact.cotality] = to;
    for (const key of fact.raw) plan.raw[key] = to;
  }
  return plan;
}
