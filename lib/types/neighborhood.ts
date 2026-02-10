/**
 * Neighborhood Types
 * Data-driven neighborhood pages for SEO + AEO — all 5 NYC boroughs
 */

export type Borough = 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island';
export type BoroughSlug = 'manhattan' | 'brooklyn' | 'queens' | 'bronx' | 'staten-island';

export interface NeighborhoodFAQ {
  question: string;
  answer: string;
}

export interface MarketStats {
  medianSalePrice: number;
  medianRent: number;
  avgDaysOnMarket: number;
  yoyChange: number;
  pricePerSqft: number;
  inventory: number;
  closedSales: number;
  priceTrend: 'up' | 'down' | 'flat';
}

export interface FeaturedBuilding {
  name: string;
  nickname: string | null;
  architect: string | null;
  yearBuilt: number;
  type: string;
  units: number;
  priceRange: string;
  slug: string;
}

export interface StreetGuidance {
  description: string;
  bestBlocksForFamilies: string[];
  bestBlocksForNightlife: string[];
  quietStreets: string[];
}

export interface BuyerPersona {
  type: string;
  description: string;
  budgetRange: string;
  propertyType: string;
}

export interface NeighborhoodCTAs {
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  rental: { label: string; href: string };
}

export interface NeighborhoodBoundaries {
  north: string;
  south: string;
  east: string;
  west: string;
}

export interface NeighborhoodAttraction {
  name: string;
  type: string;
  description: string;
}

export interface NeighborhoodDining {
  name: string;
  cuisine: string;
  priceRange: string;
}

export interface Neighborhood {
  slug: string;
  name: string;
  fullName: string;
  borough: Borough;
  tagline: string;
  heroImage: string;
  ogImage: string;

  summary: string;
  avgPricePerSqft: number;
  dominantPropertyType: string;
  walkScore: number;
  transitScore: number;
  topSchool: string;
  nearestSubway: string[];

  faqs: NeighborhoodFAQ[];
  marketStats: MarketStats;
  featuredBuildings: FeaturedBuilding[];
  streetGuidance: StreetGuidance;
  buyerPersonas: BuyerPersona[];
  ctas: NeighborhoodCTAs;

  boundaries: NeighborhoodBoundaries;
  transit: string[];
  zipCodes: string[];
  adjacentNeighborhoods: string[];

  attractions: NeighborhoodAttraction[];
  dining: NeighborhoodDining[];
  seoKeywords: string[];
}

/** @deprecated Use `Neighborhood` instead */
export type ManhattanNeighborhood = Neighborhood;
