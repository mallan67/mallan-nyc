/**
 * REBNY RLS Compliant Listing Types
 * Based on REBNY UCBA (Universal Co-Brokerage Agreement) mandatory fields
 */

export type ListingType = 'sale' | 'rent';
export type MLSStatus = 'Active' | 'Pending' | 'Sold' | 'Rented' | 'Withdrawn' | 'Expired' | 'Closed';
export type PropertyType = 'Condo' | 'Co-op' | 'Condop' | 'Townhouse' | 'Multi-Family' | 'Mixed-Use' | 'Land';
export type Borough = 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island';

// ============================================================================
// LUXURY TIER SYSTEM - MOCK MODE IMPLEMENTATION
// ============================================================================

/**
 * Luxury tier classification based on price thresholds and amenity scoring
 * Tiers align with NYC luxury market segmentation
 */
export type LuxuryTier =
  | 'standard'      // Below $1.5M sale / $5K rent
  | 'premium'       // $1.5M-$5M sale / $5K-$15K rent
  | 'luxury'        // $5M-$15M sale / $15K-$35K rent
  | 'ultra-luxury'  // $15M-$50M sale / $35K-$75K rent
  | 'trophy';       // $50M+ sale / $75K+ rent (museum-quality, landmark)

/**
 * Market positioning for luxury properties
 */
export type LuxuryMarketPosition =
  | 'private'              // Private, never publicly listed
  | 'network-exclusive'    // Shared only within network
  | 'pre-market'           // Coming soon, exclusive preview
  | 'quietly-available'    // Listed but minimal marketing
  | 'full-market';         // Standard market exposure

/**
 * Buyer qualification levels for luxury properties
 */
export type BuyerQualification =
  | 'verified-funds'       // Proof of funds on file
  | 'pre-approved'         // Mortgage pre-approval
  | 'cash-buyer'           // All-cash verified
  | 'institutional'        // Fund/trust/entity purchase
  | 'uhnw-verified';       // Ultra-high-net-worth verified ($30M+ liquid)

/**
 * Comprehensive luxury designation for high-end properties
 */
export interface LuxuryDesignation {
  tier: LuxuryTier;
  marketPosition: LuxuryMarketPosition;

  // Scoring (0-100 scale)
  amenityScore: number;           // Based on building + unit amenities
  locationScore: number;          // Based on address prestige
  finishScore: number;            // Based on interior quality indicators
  overallLuxuryScore: number;     // Weighted composite score

  // Classification flags
  isLandmark: boolean;            // NYC Landmark building
  isArchitecturallySignificant: boolean;
  isCelebrityOwned: boolean;      // Notable ownership history
  isPenthouse: boolean;
  isFullFloor: boolean;
  isTownhouse: boolean;
  isDuplex: boolean;
  isTriplex: boolean;

  // Premium features
  hasPrivateElevator: boolean;
  hasPrivatePool: boolean;
  hasWineCellar: boolean;
  hasHomeTheater: boolean;
  hasSmartHome: boolean;
  hasSafeRoom: boolean;
  hasStaffQuarters: boolean;

  // Views (premium indicators)
  hasCentralParkView: boolean;
  hasRiverView: boolean;
  hasSkylineView: boolean;
  hasWaterView: boolean;
  hasDirectParkView: boolean;

  // Building prestige
  buildingPrestigeLevel: 'iconic' | 'prestigious' | 'established' | 'emerging' | 'standard';
  buildingPedigree: string | null;  // e.g., "Robert A.M. Stern design"

  // Buyer requirements
  minimumBuyerQualification: BuyerQualification | null;
  requiresNDA: boolean;
  requiresPreApproval: boolean;

  // White-glove service
  dedicatedShowingAgent: string | null;
  privateShowingsOnly: boolean;
  byAppointmentOnly: boolean;
}

/**
 * Price thresholds for automatic luxury tier calculation (NYC market)
 */
export const LUXURY_PRICE_THRESHOLDS = {
  sale: {
    standard: 0,
    premium: 1_500_000,
    luxury: 5_000_000,
    'ultra-luxury': 15_000_000,
    trophy: 50_000_000,
  },
  rent: {
    standard: 0,
    premium: 5_000,
    luxury: 15_000,
    'ultra-luxury': 35_000,
    trophy: 75_000,
  },
} as const;

/**
 * Amenity weights for luxury scoring
 */
export const LUXURY_AMENITY_WEIGHTS = {
  // Building amenities
  fullTimeDoorman: 10,
  concierge: 8,
  privateElevator: 15,
  gym: 3,
  pool: 8,
  roofDeck: 5,
  garage: 4,

  // Unit features
  penthouse: 20,
  fullFloor: 18,
  duplex: 12,
  triplex: 15,
  terrace: 8,
  balcony: 4,
  fireplace: 5,

  // Premium additions
  privatePool: 20,
  wineCellar: 8,
  homeTheater: 7,
  smartHome: 5,
  staffQuarters: 12,
  safeRoom: 6,

  // Views
  centralParkView: 25,
  directParkView: 20,
  riverView: 15,
  skylineView: 12,
  waterView: 10,
} as const;

export interface ListingAddress {
  streetNumber: string;
  streetName: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  borough: Borough;
  cityRegion: string;
  neighborhood: string;
  neighborhoodDisplay: string;
  buildingTaxLot: string;
  latitude?: number;
  longitude?: number;
}

export interface ListingPrice {
  listPrice: number;
  pricePerSqft: number | null;
  originalListPrice: number;
  closePrice: number | null;
  closePricePerSqft: number | null;
}

export interface PropertyInfo {
  propertyType: PropertyType;
  propertySubType: string;
  buildingType: string;
  architecturalStyle: string;
  yearBuilt: number;
  totalRooms: number;
  bedroomsTotal: number;
  bathroomsFull: number;
  bathroomsHalf: number;
  aboveGradeFinishedArea: number;
  belowGradeFinishedArea: number;
  lotSizeArea: number | null;
  storiesTotal: number;
  floorsInBuilding: number;
  unitFloor: number;
}

export interface NYCSpecific {
  coopCondo: 'Condo' | 'Co-op' | 'Condop' | null;
  maintenanceFee: number | null;
  commonCharges: number | null;
  realEstateTaxes: number | null;
  taxesAnnual: number | null;
  assessedValue: number | null;
  flipTax: boolean | null;
  flipTaxPercent: number | null;
  percentOwned: number | null;
  sublettingAllowed: boolean | null;
  sublettingRestrictions: string | null;
  piedATerre: boolean | null;
  guarantorsAllowed: boolean | null;
  giftAllowed: boolean | null;
  financingAllowed: boolean | null;
  maxFinancing: number | null;
  boardApprovalRequired: boolean | null;
}

export interface Association {
  associationName: string | null;
  associationFee: number | null;
  associationFeeFrequency: 'Monthly' | 'Quarterly' | 'Annual' | null;
  associationFeeIncludes: string[] | null;
  associationPhone: string | null;
}

export interface InteriorFeatures {
  flooring: string[];
  appliances: string[];
  laundry: 'In Unit' | 'Common' | 'None';
  cooling: string[];
  heating: string[];
  fireplace: boolean;
  basement: string;
  windowFeatures: string[];
  accessibility: string[];
}

export interface BuildingFeatures {
  doorman: boolean;
  doormanType: 'Full Time' | 'Part Time' | null;
  concierge: boolean;
  elevator: boolean;
  gym: boolean;
  pool: boolean;
  roofDeck: boolean;
  garage: boolean;
  parkingType: string | null;
  parkingSpaces: number;
  storage: boolean;
  bikeRoom: boolean;
  laundryRoom: boolean;
  playroom: boolean;
  communityRoom: boolean;
  security: string[];
  attendanceType: string;
}

export interface PetPolicy {
  allowed: boolean;
  policy: 'Allowed' | 'Allowed with Restrictions' | 'Not Allowed' | 'Case by Case';
  comments: string | null;
  breedRestrictions: boolean | null;
  sizeRestrictions: boolean | null;
  maxPets: number | null;
}

export interface OutdoorFeatures {
  balcony: boolean;
  terrace: boolean;
  privateOutdoor: boolean;
  garden: boolean;
  roofRights: boolean;
}

export interface ListingFeatures {
  interior: InteriorFeatures;
  building: BuildingFeatures;
  pets: PetPolicy;
  outdoor: OutdoorFeatures;
  views: string[];
  exposure: string[];
}

export interface Financials {
  capRate: number | null;
  grossIncome: number | null;
  operatingExpenses: number | null;
  netOperatingIncome: number | null;
  cableTvExpense: number | null;
  fuelExpense: number | null;
  insuranceExpense: number | null;
  maintenanceExpense: number | null;
  managerExpense: number | null;
  otherExpense: number | null;
  professionalManagement: boolean;
}

export interface ListingInfo {
  listingDate: string;
  expirationDate: string;
  daysOnMarket: number;
  originalEntryTimestamp: string;
  modificationTimestamp: string;
  listingAgreementType: string;
  showingInstructions: string;
  showingContactPhone: string;
  virtualTourUrl: string | null;
  videoTourUrl: string | null;
}

export interface AgentInfo {
  listAgentId: string;
  listAgentName: string;
  listAgentEmail: string;
  listAgentPhone: string;
  listOfficeName: string;
  listOfficePhone: string;
  coListAgentId: string | null;
  coListAgentName: string | null;
}

export interface BuyerInfo {
  buyerAgentCompensation: string;
  buyerAgentCompensationType: 'Percentage' | 'Fixed';
  buyerAgentId: string | null;
  buyerAgentName: string | null;
  buyerFinancing: string | null;
  closeDate: string | null;
}

export interface MediaImage {
  url: string;
  caption: string;
  order: number;
  isPrimary: boolean;
}

export interface ListingMedia {
  images: MediaImage[];
  floorPlanUrl: string | null;
  virtualTourUrl: string | null;
  videoUrl: string | null;
}

export interface OpenHouse {
  scheduled: boolean;
  date: string;
  startTime: string;
  endTime: string;
  type: 'Public' | 'Broker' | 'Private';
  remarks: string;
}

export interface ListingFlags {
  isExclusive: boolean;
  isFeatured: boolean;
  isNewListing: boolean;
  isPriceReduced: boolean;
  isOpenHouse: boolean;
  participantOnlyNetwork: boolean;

  // Luxury-specific flags
  isLuxury: boolean;              // True if tier >= 'luxury'
  isUltraLuxury: boolean;         // True if tier >= 'ultra-luxury'
  isTrophy: boolean;              // True if tier === 'trophy'
  isPrivateListing: boolean;      // Not publicly advertised
  isNetworkExclusive: boolean;    // Network-only distribution
  isWhiteGlove: boolean;          // Requires premium showing protocol
  isInvestmentGrade: boolean;     // Suitable for institutional buyers
  requiresNDA: boolean;           // NDA required before showing
  isPreMarket: boolean;           // Coming soon / exclusive preview
}

export interface ListingCompliance {
  idxOptOut: boolean;
  vowOptOut: boolean;
  syndicationOptOut: boolean;
  internetAddressDisplayYN: boolean;
  internetEntireListingDisplayYN: boolean;
  participantOnlyNetwork: boolean;
  comingSoonDate: string | null;
  lastVerified: string;
}

export interface Listing {
  id: string;
  mlsId: string;
  mlsStatus: MLSStatus;
  listingType: ListingType;
  status: string;
  address: ListingAddress;
  price: ListingPrice;
  propertyInfo: PropertyInfo;
  nycSpecific: NYCSpecific;
  association: Association;
  features: ListingFeatures;
  financials: Financials | null;
  listing: ListingInfo;
  agent: AgentInfo;
  buyer: BuyerInfo;
  media: ListingMedia;
  description: string;
  privateRemarks: string | null;
  showingRemarks: string | null;
  openHouse: OpenHouse | null;
  flags: ListingFlags;
  compliance: ListingCompliance;

  // Luxury designation (null for standard tier)
  luxury: LuxuryDesignation | null;
}

// Helper functions
export function formatPrice(price: number, isRental: boolean): string {
  if (isRental) {
    return `$${price.toLocaleString()}/mo`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export function getFullAddress(address: ListingAddress): string {
  return `${address.streetNumber} ${address.streetName}, ${address.unit}`;
}

export function getShortAddress(address: ListingAddress): string {
  return `${address.streetNumber} ${address.streetName}`;
}

// ============================================================================
// LUXURY TIER UTILITY FUNCTIONS - MOCK MODE
// ============================================================================

/**
 * Calculate luxury tier based on price
 */
export function calculateLuxuryTier(
  price: number,
  listingType: ListingType
): LuxuryTier {
  const thresholds = LUXURY_PRICE_THRESHOLDS[listingType === 'rent' ? 'rent' : 'sale'];

  if (price >= thresholds.trophy) return 'trophy';
  if (price >= thresholds['ultra-luxury']) return 'ultra-luxury';
  if (price >= thresholds.luxury) return 'luxury';
  if (price >= thresholds.premium) return 'premium';
  return 'standard';
}

/**
 * Calculate amenity-based luxury score (0-100)
 */
export function calculateAmenityScore(
  features: ListingFeatures,
  luxury: Partial<LuxuryDesignation>
): number {
  let score = 0;

  // Building amenities
  if (features.building.doorman && features.building.doormanType === 'Full Time') {
    score += LUXURY_AMENITY_WEIGHTS.fullTimeDoorman;
  }
  if (features.building.concierge) score += LUXURY_AMENITY_WEIGHTS.concierge;
  if (features.building.gym) score += LUXURY_AMENITY_WEIGHTS.gym;
  if (features.building.pool) score += LUXURY_AMENITY_WEIGHTS.pool;
  if (features.building.roofDeck) score += LUXURY_AMENITY_WEIGHTS.roofDeck;
  if (features.building.garage) score += LUXURY_AMENITY_WEIGHTS.garage;

  // Unit features
  if (features.outdoor.terrace) score += LUXURY_AMENITY_WEIGHTS.terrace;
  if (features.outdoor.balcony) score += LUXURY_AMENITY_WEIGHTS.balcony;
  if (features.interior.fireplace) score += LUXURY_AMENITY_WEIGHTS.fireplace;

  // Premium luxury features
  if (luxury.hasPrivateElevator) score += LUXURY_AMENITY_WEIGHTS.privateElevator;
  if (luxury.isPenthouse) score += LUXURY_AMENITY_WEIGHTS.penthouse;
  if (luxury.isFullFloor) score += LUXURY_AMENITY_WEIGHTS.fullFloor;
  if (luxury.isDuplex) score += LUXURY_AMENITY_WEIGHTS.duplex;
  if (luxury.isTriplex) score += LUXURY_AMENITY_WEIGHTS.triplex;
  if (luxury.hasPrivatePool) score += LUXURY_AMENITY_WEIGHTS.privatePool;
  if (luxury.hasWineCellar) score += LUXURY_AMENITY_WEIGHTS.wineCellar;
  if (luxury.hasHomeTheater) score += LUXURY_AMENITY_WEIGHTS.homeTheater;
  if (luxury.hasSmartHome) score += LUXURY_AMENITY_WEIGHTS.smartHome;
  if (luxury.hasStaffQuarters) score += LUXURY_AMENITY_WEIGHTS.staffQuarters;
  if (luxury.hasSafeRoom) score += LUXURY_AMENITY_WEIGHTS.safeRoom;

  // Views
  if (luxury.hasCentralParkView) score += LUXURY_AMENITY_WEIGHTS.centralParkView;
  if (luxury.hasDirectParkView) score += LUXURY_AMENITY_WEIGHTS.directParkView;
  if (luxury.hasRiverView) score += LUXURY_AMENITY_WEIGHTS.riverView;
  if (luxury.hasSkylineView) score += LUXURY_AMENITY_WEIGHTS.skylineView;
  if (luxury.hasWaterView) score += LUXURY_AMENITY_WEIGHTS.waterView;

  // Normalize to 0-100 scale (max possible ~200 points)
  return Math.min(100, Math.round((score / 150) * 100));
}

/**
 * Determine if listing qualifies for luxury marketing
 */
export function isLuxuryQualified(listing: Listing): boolean {
  if (!listing.luxury) return false;
  return ['luxury', 'ultra-luxury', 'trophy'].includes(listing.luxury.tier);
}

/**
 * Determine if listing requires white-glove showing protocol
 */
export function requiresWhiteGloveService(listing: Listing): boolean {
  if (!listing.luxury) return false;

  return (
    listing.luxury.tier === 'trophy' ||
    listing.luxury.tier === 'ultra-luxury' ||
    listing.luxury.requiresNDA ||
    listing.luxury.privateShowingsOnly ||
    listing.luxury.marketPosition === 'private' ||
    listing.luxury.marketPosition === 'network-exclusive'
  );
}

/**
 * Get display label for luxury tier
 */
export function getLuxuryTierLabel(tier: LuxuryTier): string {
  const labels: Record<LuxuryTier, string> = {
    standard: 'Standard',
    premium: 'Premium',
    luxury: 'Luxury',
    'ultra-luxury': 'Ultra Luxury',
    trophy: 'Trophy',
  };
  return labels[tier];
}

/**
 * Create default luxury designation for a listing
 */
export function createDefaultLuxuryDesignation(
  price: number,
  listingType: ListingType
): LuxuryDesignation {
  const tier = calculateLuxuryTier(price, listingType);

  return {
    tier,
    marketPosition: 'full-market',
    amenityScore: 0,
    locationScore: 0,
    finishScore: 0,
    overallLuxuryScore: 0,
    isLandmark: false,
    isArchitecturallySignificant: false,
    isCelebrityOwned: false,
    isPenthouse: false,
    isFullFloor: false,
    isTownhouse: false,
    isDuplex: false,
    isTriplex: false,
    hasPrivateElevator: false,
    hasPrivatePool: false,
    hasWineCellar: false,
    hasHomeTheater: false,
    hasSmartHome: false,
    hasSafeRoom: false,
    hasStaffQuarters: false,
    hasCentralParkView: false,
    hasRiverView: false,
    hasSkylineView: false,
    hasWaterView: false,
    hasDirectParkView: false,
    buildingPrestigeLevel: 'standard',
    buildingPedigree: null,
    minimumBuyerQualification: null,
    requiresNDA: false,
    requiresPreApproval: tier !== 'standard' && tier !== 'premium',
    dedicatedShowingAgent: null,
    privateShowingsOnly: tier === 'trophy' || tier === 'ultra-luxury',
    byAppointmentOnly: tier !== 'standard',
  };
}
