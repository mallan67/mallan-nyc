/**
 * Is the Cotality record the listing's own? The RLS ID and the listing office say which record Cotality answered with; this says that record is the same unit as the Mallan listing.
 *
 * Why both: the RLS link is typed by hand or pulled once, and a wrong id that happens to be one of Mallan's own (office 7041) listings would otherwise move another unit's price and rooms
 * into this listing. Before a followed fact is written, the street number, the street, the unit and (when both sides have one) the ZIP of the record must be the listing's.
 *
 * The comparison is the one the site already uses to decide that two rows are the same physical unit (buildAddressKey in dedupe-crm-vs-idx.ts: East = E, Street = St, 90 = 90th, case and
 * spacing ignored), with two differences that matter here: a house has no unit, so "no unit on either side" is a match (the dedupe key refuses such a row), and a unit on one side only is
 * NOT a match.
 */
import { buildAddressKey } from '@/lib/listings/dedupe-crm-vs-idx';

/** The Cotality Property fields the check reads (live-verified 2026-11-04 on RLS20123633: all six are selectable). */
export const IDENTITY_SELECT = ['StreetNumber', 'StreetDirPrefix', 'StreetName', 'StreetSuffix', 'UnitNumber', 'PostalCode'] as const;

export type IdentityVerdict = { ok: true } | { ok: false; reason: string };

type Parts = { streetNumber: string; streetDirPrefix: string; streetName: string; streetSuffix: string; unit: string; zip: string };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (...vals: unknown[]): string => {
  for (const v of vals) {
    const t = v === null || v === undefined ? '' : String(v).trim();
    if (t && !/^(null|undefined)$/i.test(t)) return t;
  }
  return '';
};

/** "#806", "Apt 806", "Unit 806" and " 806 " are the same unit. */
const normUnit = (u: string): string => u.toLowerCase().replace(/^(apartment|apt|unit|suite|ste|#)\.?\s*/, '').replace(/[\s#.-]+/g, '');
const zip5 = (z: string): string => (z.match(/\d{5}/) ?? [''])[0];

/** The listing's own address, from the address bucket (PascalCase as the Sale form saves it, or camelCase) and the postal_code column. */
export function listingParts(listing: { address: unknown; postal_code?: string | null }): Parts {
  const a = obj(listing.address);
  return {
    streetNumber: text(a.StreetNumber, a.streetNumber),
    streetDirPrefix: text(a.StreetDirPrefix, a.streetDirPrefix),
    streetName: text(a.StreetName, a.streetName),
    streetSuffix: text(a.StreetSuffix, a.streetSuffix),
    unit: text(a.UnitNumber, a.unitNumber),
    zip: text(a.PostalCode, a.postalCode, listing.postal_code),
  };
}

export function cotalityParts(record: Record<string, unknown>): Parts {
  return {
    streetNumber: text(record.StreetNumber),
    streetDirPrefix: text(record.StreetDirPrefix),
    streetName: text(record.StreetName),
    streetSuffix: text(record.StreetSuffix),
    unit: text(record.UnitNumber),
    zip: text(record.PostalCode),
  };
}

const NO_UNIT = '-';

function keyOf(p: Parts, withZip: boolean): string | null {
  return buildAddressKey({
    streetNumber: p.streetNumber,
    streetDirPrefix: p.streetDirPrefix,
    streetName: p.streetName,
    streetSuffix: p.streetSuffix,
    unitNumber: normUnit(p.unit) || NO_UNIT,
    postalCode: withZip ? zip5(p.zip) : '',
  });
}

const describe = (p: Parts): string => [p.streetNumber, [p.streetDirPrefix, p.streetName, p.streetSuffix].filter(Boolean).join(' '), p.unit ? `#${p.unit}` : ''].filter(Boolean).join(' ') || 'no address';

export function verifyLinkedAddress(listing: { address: unknown; postal_code?: string | null }, record: Record<string, unknown>): IdentityVerdict {
  const mine = listingParts(listing);
  const theirs = cotalityParts(record);
  if (!mine.streetNumber || !mine.streetName) return { ok: false, reason: 'the listing has no street address saved, so the Cotality record cannot be proven to be its own' };
  if (!theirs.streetNumber || !theirs.streetName) return { ok: false, reason: 'the Cotality record carries no street address, so it cannot be proven to be this listing' };
  const withZip = !!zip5(mine.zip) && !!zip5(theirs.zip);
  const a = keyOf(mine, withZip);
  const b = keyOf(theirs, withZip);
  if (a === null || b === null || a !== b) return { ok: false, reason: `the Cotality record is for ${describe(theirs)}, and this listing is ${describe(mine)}` };
  return { ok: true };
}
