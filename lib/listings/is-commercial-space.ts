/**
 * Is this listing a commercial space (an office, a medical office, a shop, a warehouse, a business)?
 *
 * The public listing page asks it before it offers a rent: the investment calculator's rent estimate is a table of NYC rents by BEDROOM count, which says nothing about an office
 * (Maya, 2026-11-04: a medical office condominium that rents for $7,000-$10,000 opened at the studio's $2,500).
 *
 * Ask it with the listing's RAW property type and subtype (the public DTO carries the answer as `isCommercial`): a Cotality commercial sale is PropertyType CommercialSale, and its public
 * propertyType is its SUBTYPE ("Business", "FlexibleSpace", "HotelMotel", "SpecialPurpose"), which names nothing commercial on its own (Codex, review of #689). A Mallan website-only
 * commercial listing is raw type Commercial (or Office, Retail), and its public label is "Commercial Condo" and the like, which the words also catch. A residential type or subtype never
 * contains one of them.
 */
const COMMERCIAL_SPACE = /(commercial|office|retail|industrial|warehouse|business)/i;      // not word-bounded: a type may arrive as CommercialSale, MedicalOffice or RetailCondo

export function isCommercialSpace(propertyType?: string | null, propertySubType?: string | null): boolean {
  return COMMERCIAL_SPACE.test(`${propertyType ?? ''} ${propertySubType ?? ''}`);
}
