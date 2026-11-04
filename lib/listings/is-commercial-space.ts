/**
 * Is this listing a commercial space (an office, a medical office, a shop, a warehouse)?
 *
 * The public listing page asks it before it offers a rent: the investment calculator's rent estimate is a table of NYC rents by BEDROOM count, which says nothing about an office
 * (Maya, 2026-11-04: a medical office condominium that rents for $7,000-$10,000 opened at the studio's $2,500). The words come from the listing's own public type and subtype, as the card
 * and the page show them ("Commercial", "Commercial Condo", "Office", "Retail"); a residential type never names one of them.
 */
const COMMERCIAL_SPACE = /(commercial|office|retail|industrial|warehouse)/i;      // not word-bounded: a subtype may arrive as MedicalOffice or RetailCondo

export function isCommercialSpace(propertyType?: string | null, propertySubType?: string | null): boolean {
  return COMMERCIAL_SPACE.test(`${propertyType ?? ''} ${propertySubType ?? ''}`);
}
