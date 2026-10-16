/**
 * What kind of building is this, by how Cotality describes it?
 *
 * A building is classified from ALL of its Cotality listings, not from the first one seen. Live Cotality 2026-10-16, 333 E 46th Street: 130 of 200 listings say
 * CommonInterest = StockCooperative and 70 say Condop, so "the first record" or "the most common value" calls a condop a co-op. 400 E 90th Street (Century Tower): 147
 * Condominium, 23 StockCooperative: a condominium. A Condop is a building Cotality tags Condop on a real share of its listings (at least two, and a tenth of the ones that
 * carry an ownership tag); otherwise the most common of Condominium, StockCooperative and RentalBuilding wins.
 *
 * With no ownership tag at all (Cotality leaves CommonInterest None on townhouses, multi-families and most mixed-use buildings) the kind comes from the structure:
 * StructureType Townhouse (PropertySubType SingleFamilyResidence or MultiFamily), PropertySubType MultiFamily, StructureType MixedUse, SingleFamilyResidence.
 */

export interface BuildingListingEvidence {
  StandardStatus?: unknown;
  CommonInterest?: unknown;
  PropertySubType?: unknown;
  StructureType?: unknown;
  NumberOfUnitsTotal?: unknown;
}

export type OwnershipTag = 'Condominium' | 'StockCooperative' | 'Condop' | 'RentalBuilding';
export type BuildingKind = 'Condo' | 'Coop' | 'Condop' | 'RentalBuilding' | 'SingleFamilyTownhouse' | 'MultiFamilyTownhouse' | 'MultiFamily' | 'MixedUse' | 'SingleFamily';

export interface BuildingClassification {
  /** the Cotality CommonInterest that stands for the building, or null when its listings carry none */
  commonInterest: OwnershipTag | null;
  /** the form's property type for the building, or null when Cotality does not say */
  kind: BuildingKind | null;
  /** how many listings carried each ownership tag (the evidence) */
  votes: Partial<Record<OwnershipTag, number>>;
}

const TAGS: OwnershipTag[] = ['Condominium', 'StockCooperative', 'RentalBuilding'];
const KIND_OF_TAG: Record<OwnershipTag, BuildingKind> = { Condominium: 'Condo', StockCooperative: 'Coop', Condop: 'Condop', RentalBuilding: 'RentalBuilding' };

/** A Cotality multi-value field arrives as an array or a comma list. */
function words(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
  return [];
}

/** Listings that are on the market now; a closed or expired listing is history. */
const CURRENT = new Set(['Active', 'ActiveUnderContract', 'Pending', 'ComingSoon', 'Hold', 'Incomplete']);

export function classifyBuilding(allListings: BuildingListingEvidence[]): BuildingClassification {
  // How Cotality describes the building NOW: current listings decide when there are any (152 W 121st Street: one live Townhouse listing, one closed rental of a unit tagged
  // Condominium); a building with no current listing is read from its history.
  const current = allListings.filter((l) => typeof l.StandardStatus === 'string' && CURRENT.has(l.StandardStatus));
  const listings = current.length > 0 ? current : allListings;
  // Ownership is a lasting fact of the building: every listing it ever had votes (333 E 46th Street: only 2 of its current listings say StockCooperative, while its history is 130
  // StockCooperative and 70 Condop). What KIND of building it is (a house or an apartment building) is read from the current listings.
  const votes: Partial<Record<OwnershipTag, number>> = {};
  for (const l of allListings) {
    const ci = typeof l.CommonInterest === 'string' ? l.CommonInterest.trim() : '';
    if (ci === 'Condominium' || ci === 'StockCooperative' || ci === 'Condop' || ci === 'RentalBuilding') votes[ci] = (votes[ci] ?? 0) + 1;
  }
  const total = Object.values(votes).reduce((a, b) => a + (b ?? 0), 0);
  const nl = listings.length;
  const frac = (test: (l: BuildingListingEvidence) => boolean) => (nl === 0 ? 0 : listings.filter(test).length / nl);
  // A house is a house whatever one listing's ownership tag says (152 W 121st Street: StructureType Townhouse, PropertySubType MultiFamily, and a Condominium tag on one listing):
  // when most listings are houses by structure and none-to-few are apartments, the structure decides.
  const apartmentSub = (l: BuildingListingEvidence) => words(l.PropertySubType).some((x) => ['Apartment', 'Condominium', 'StockCooperative', 'CoOwnership', 'Studio', 'Loft'].includes(x));
  const houseByStructure = (l: BuildingListingEvidence) => words(l.StructureType).includes('Townhouse') || words(l.PropertySubType).some((x) => ['SingleFamilyResidence', 'MultiFamily'].includes(x));
  const houseFirst = nl > 0 && frac(houseByStructure) >= 0.5 && frac(apartmentSub) < 0.5;
  const condop = votes.Condop ?? 0;

  let tag: OwnershipTag | null = null;
  if (total > 0 && !houseFirst) {
    if (condop > 0 && (condop === total || (condop >= 2 && condop / total >= 0.1))) tag = 'Condop';
    else {
      let best = 0;
      for (const t of TAGS) if ((votes[t] ?? 0) > best) { best = votes[t] ?? 0; tag = t; }
      if (tag === null && condop > 0) tag = 'Condop';
    }
  }
  if (tag) return { commonInterest: tag, kind: KIND_OF_TAG[tag], votes };

  // No ownership tag (or a house whose tag does not matter): the structure says what it is.
  const n = listings.length;
  if (n === 0) return { commonInterest: null, kind: null, votes };
  const share = frac;
  const structure = (l: BuildingListingEvidence) => words(l.StructureType);
  const sub = (l: BuildingListingEvidence) => words(l.PropertySubType);
  const units = (l: BuildingListingEvidence) => Number(l.NumberOfUnitsTotal) || 0;

  if (share((l) => structure(l).includes('Townhouse')) >= 0.5) {
    const multi = share((l) => sub(l).includes('MultiFamily') || units(l) > 1) >= 0.5;
    return { commonInterest: null, kind: multi ? 'MultiFamilyTownhouse' : 'SingleFamilyTownhouse', votes };
  }
  if (share((l) => sub(l).includes('MultiFamily') || structure(l).includes('MultiFamily')) >= 0.5) return { commonInterest: null, kind: 'MultiFamily', votes };
  if (share((l) => structure(l).includes('MixedUse')) >= 0.5) return { commonInterest: null, kind: 'MixedUse', votes };
  if (share((l) => sub(l).includes('SingleFamilyResidence')) >= 0.5) return { commonInterest: null, kind: 'SingleFamily', votes };
  return { commonInterest: null, kind: null, votes };
}
