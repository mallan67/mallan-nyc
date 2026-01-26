/**
 * Geographic Data Types for Phase 3
 *
 * These types define the structure for neighborhood and borough data.
 * Used by templates in src/templates/ - NOT routable pages.
 *
 * Phase 3 Status: Data preparation only. No public routes.
 */

export interface Attraction {
  name: string;
  type: 'museum' | 'park' | 'school' | 'university' | 'cultural' | 'entertainment' | 'music' | 'landmark' | 'food' | 'restaurant' | 'gallery' | 'retail' | 'recreation';
  description: string;
  address: string;
  link?: string | null;
}

export interface Boundaries {
  north: string;
  south: string;
  east: string;
  west: string;
}

export interface PriceRange {
  sale: number;
  rent: number;
}

export interface Neighborhood {
  id: string;
  name: string;
  borough: string;
  tagline: string;
  image: string;
  thumbnail: string;
  description: string;
  vibe: string;
  listingCount: number;
  avgPrice: PriceRange;
  boundaries: Boundaries;
  transit: string[];
  attractions: Attraction[];
  dining: string[];
}

export interface Borough {
  id: string;
  name: string;
  county: string;
  fips: string;
  tagline: string;
  description: string;
  avgPrice: PriceRange;
  neighborhoodCount: number;
  featuredNeighborhoods: string[];
}

export interface NeighborhoodsData {
  neighborhoods: Neighborhood[];
}

export interface BoroughsData {
  boroughs: Borough[];
}

// Helper to get neighborhood by ID
export function getNeighborhoodById(data: NeighborhoodsData, id: string): Neighborhood | undefined {
  return data.neighborhoods.find(n => n.id === id);
}

// Helper to get neighborhoods by borough
export function getNeighborhoodsByBorough(data: NeighborhoodsData, boroughId: string): Neighborhood[] {
  return data.neighborhoods.filter(n => n.borough === boroughId);
}

// Helper to get borough by ID
export function getBoroughById(data: BoroughsData, id: string): Borough | undefined {
  return data.boroughs.find(b => b.id === id);
}
