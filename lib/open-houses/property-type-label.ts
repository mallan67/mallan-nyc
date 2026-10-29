/**
 * The type label on an open-house card ("Condo", "Co-op", "Townhouse", "Rental" ...).
 *
 * /api/open-houses has three ways to a card: the live Cotality OpenHouse query with the property expanded, the
 * fallback that fetches the property separately, and the database. The first two used a private mapPropertyType() that
 * read only CommonInterest and PropertyType (it never read PropertySubType), the third used the canonical
 * mapPropertyTypeToDisplay (lib/idx/public-dto.ts), so one listing could carry a different label depending on which
 * path served it, and a database lease with no CommonInterest printed the raw word "ResidentialLease".
 *
 * All three now call this one function. It is the canonical mapping with the fallback the open-house cards always
 * had: "Rental" for a lease, "Residential" otherwise.
 */
import { mapPropertyTypeToDisplay } from '@/lib/idx/public-dto';

export function openHouseTypeLabel(commonInterest: unknown, propertySubType: unknown, propertyType: unknown): string {
  return mapPropertyTypeToDisplay(
    typeof commonInterest === 'string' && commonInterest ? commonInterest : undefined,
    typeof propertySubType === 'string' && propertySubType ? propertySubType : null,
    propertyType === 'ResidentialLease' ? 'Rental' : 'Residential',
  );
}
