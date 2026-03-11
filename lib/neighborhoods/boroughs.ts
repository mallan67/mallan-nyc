import type { Borough, BoroughSlug, Neighborhood } from '@/lib/types/neighborhood';
import manhattanData from '@/data/manhattan-neighborhoods.json';
import brooklynData from '@/data/brooklyn-neighborhoods.json';
import queensData from '@/data/queens-neighborhoods.json';
import bronxData from '@/data/bronx-neighborhoods.json';
import statenIslandData from '@/data/staten-island-neighborhoods.json';

export interface BoroughConfig {
  name: Borough;
  slug: BoroughSlug;
  tagline: string;
  intro: string;
  heroImage: string;
  neighborhoodCount: number;
}

export const BOROUGH_CONFIGS: Record<BoroughSlug, BoroughConfig> = {
  manhattan: {
    name: 'Manhattan',
    slug: 'manhattan',
    tagline: 'The center of the world — from pre-war elegance to modern luxury.',
    intro: 'Manhattan remains the most sought-after real estate market in the world. From the classic pre-war elegance of the Upper East Side to the converted lofts of Tribeca, each neighborhood offers a distinct lifestyle, architecture, and investment profile. Whether you\u2019re buying your first co-op, upgrading to a condo, or searching for a luxury rental, our neighborhood guides provide the market data, building intelligence, and street-level insights you need to make a confident decision.',
    heroImage: 'https://images.unsplash.com/photo-1759670386427-3ca35e3b7403?w=1600&q=80',
    neighborhoodCount: 33,
  },
  brooklyn: {
    name: 'Brooklyn',
    slug: 'brooklyn',
    tagline: 'From brownstone-lined streets to waterfront condos — NYC\u2019s most dynamic borough.',
    intro: 'Brooklyn has evolved into one of the most desirable real estate markets in the country. From the historic brownstones of Brooklyn Heights and Park Slope to the waterfront luxury of DUMBO and Williamsburg, the borough offers extraordinary diversity in architecture, lifestyle, and price points. Our neighborhood guides cover market data, featured buildings, and insider insights to help you find your ideal Brooklyn address.',
    heroImage: 'https://images.unsplash.com/photo-1760024764489-91e40002c82a?w=1600&q=80',
    neighborhoodCount: 10,
  },
  queens: {
    name: 'Queens',
    slug: 'queens',
    tagline: 'The world\u2019s borough — diverse communities, excellent value, and rapid growth.',
    intro: 'Queens is NYC\u2019s largest and most ethnically diverse borough, offering exceptional real estate value with strong growth potential. From the waterfront high-rises of Long Island City to the tree-lined streets of Forest Hills and the cultural richness of Jackson Heights, Queens provides options for every lifestyle and budget. Our guides cover market trends, transit access, and neighborhood character.',
    heroImage: 'https://images.unsplash.com/photo-1619045788738-b92477088475?w=1600&q=80',
    neighborhoodCount: 7,
  },
  bronx: {
    name: 'Bronx',
    slug: 'bronx',
    tagline: 'Green spaces, waterfront living, and emerging neighborhoods with strong upside.',
    intro: 'The Bronx offers some of the most compelling real estate opportunities in New York City. With more parkland per capita than any other borough, waterfront communities like City Island, and established neighborhoods like Riverdale, the Bronx combines affordability with quality of life. Our neighborhood guides highlight market data, transit options, and investment potential.',
    heroImage: 'https://images.unsplash.com/photo-1530522601271-72b3b4ad5ef5?w=1600&q=80',
    neighborhoodCount: 5,
  },
  'staten-island': {
    name: 'Staten Island',
    slug: 'staten-island',
    tagline: 'Suburban charm with city access — the most affordable borough in NYC.',
    intro: 'Staten Island offers a unique blend of suburban living within New York City. With the lowest prices per square foot of any borough, generous lot sizes, and a growing waterfront district in St. George, Staten Island appeals to buyers seeking space and value. Our neighborhood guides cover market trends, commute options, and community character.',
    heroImage: 'https://images.unsplash.com/photo-1760974015791-cf0dd376aa18?w=1600&q=80',
    neighborhoodCount: 4,
  },
};

export const ALL_BOROUGH_SLUGS: BoroughSlug[] = [
  'manhattan',
  'brooklyn',
  'queens',
  'bronx',
  'staten-island',
];

const BOROUGH_DATA: Record<BoroughSlug, Neighborhood[]> = {
  manhattan: (manhattanData as { neighborhoods: Neighborhood[] }).neighborhoods,
  brooklyn: (brooklynData as { neighborhoods: Neighborhood[] }).neighborhoods,
  queens: (queensData as { neighborhoods: Neighborhood[] }).neighborhoods,
  bronx: (bronxData as { neighborhoods: Neighborhood[] }).neighborhoods,
  'staten-island': (statenIslandData as { neighborhoods: Neighborhood[] }).neighborhoods,
};

export function loadNeighborhoods(boroughSlug: BoroughSlug): Neighborhood[] {
  return BOROUGH_DATA[boroughSlug];
}

export function findNeighborhood(
  boroughSlug: BoroughSlug,
  slug: string,
): Neighborhood | undefined {
  return BOROUGH_DATA[boroughSlug].find((n) => n.slug === slug);
}

export function getBoroughConfig(slug: BoroughSlug): BoroughConfig {
  return BOROUGH_CONFIGS[slug];
}

/**
 * Returns all neighborhoods across all boroughs.
 * This is the single source of truth for neighborhood data.
 */
export function getAllNeighborhoods(): Neighborhood[] {
  return ALL_BOROUGH_SLUGS.flatMap((slug) => BOROUGH_DATA[slug]);
}

/**
 * Find a neighborhood by slug across all boroughs.
 */
export function findNeighborhoodBySlug(slug: string): Neighborhood | undefined {
  for (const boroughSlug of ALL_BOROUGH_SLUGS) {
    const found = BOROUGH_DATA[boroughSlug].find((n) => n.slug === slug);
    if (found) return found;
  }
  return undefined;
}
