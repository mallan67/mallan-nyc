/**
 * THE display property-type interpretation (Mallan presentation vocabulary derived from the live
 * Cotality classification fields). One function; the public DTO, the storage-to-public
 * projection, the Search engine mapper, open houses and building pages all import it.
 *
 * Inputs are the live fields CommonInterest, PropertySubType and PropertyType (enums verified
 * 2026-09-05). Unknown stays unknown: when nothing classifies the row the function returns the
 * provider's own PropertyType if present, else null — never an invented "Residential".
 */
export function displayPropertyType(
  commonInterest: unknown,
  propertySubType: unknown,
  propertyType: unknown,
): string | null {
  const ci = commonInterest ? String(commonInterest) : '';
  if (ci === 'Condominium') return 'Condo';
  if (ci === 'StockCooperative') return 'Co-op';
  if (ci === 'Condop') return 'Condop';

  const subRaw = propertySubType ? String(propertySubType) : '';
  const sub = subRaw.toLowerCase();
  if (sub) {
    if (sub.includes('condo')) return 'Condo';
    if (sub.includes('co-op') || sub.includes('coop') || sub.includes('stock cooperative')) return 'Co-op';
    if (sub.includes('condop')) return 'Condop';
    if (sub.includes('townhouse')) return 'Townhouse';
    if (sub.includes('loft')) return 'Loft';
    if (sub.includes('single family') || sub.includes('singlefamily') || sub.includes('house')) return 'House';
    if (sub.includes('multi')) return 'Multi-Family';
    // "Apartment" carries no ownership information on its own — fall through to PropertyType.
    if (sub !== 'apartment') return subRaw;
  }
  const pt = propertyType ? String(propertyType) : '';
  return pt === '' ? null : pt;
}
