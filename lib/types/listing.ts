/**
 * REBNY RLS Compliant Listing Types
 * Based on REBNY UCBA (Universal Co-Brokerage Agreement) mandatory fields
 */

export type ListingType = 'sale' | 'rent';
export type MLSStatus = 'Active' | 'Pending' | 'Sold' | 'Rented' | 'Withdrawn' | 'Expired';
export type PropertyType = 'Condo' | 'Co-op' | 'Condop' | 'Townhouse' | 'Multi-Family' | 'Mixed-Use' | 'Land';
export type Borough = 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island';

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
}

export interface ListingCompliance {
  idxOptOut: boolean;
  vowOptOut: boolean;
  syndicationOptOut: boolean;
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
