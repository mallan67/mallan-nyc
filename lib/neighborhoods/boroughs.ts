import type { Borough, BoroughSlug, Neighborhood } from '@/lib/types/neighborhood';

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
    heroImage: 'https://images.unsplash.com/photo-1496588152823-86ff7695e68f?w=1600&q=80',
    neighborhoodCount: 18,
  },
  brooklyn: {
    name: 'Brooklyn',
    slug: 'brooklyn',
    tagline: 'From brownstone-lined streets to waterfront condos — NYC\u2019s most dynamic borough.',
    intro: 'Brooklyn has evolved into one of the most desirable real estate markets in the country. From the historic brownstones of Brooklyn Heights and Park Slope to the waterfront luxury of DUMBO and Williamsburg, the borough offers extraordinary diversity in architecture, lifestyle, and price points. Our neighborhood guides cover market data, featured buildings, and insider insights to help you find your ideal Brooklyn address.',
    heroImage: 'https://images.unsplash.com/photo-1568515387631-8b650bbcdb90?w=1600&q=80',
    neighborhoodCount: 10,
  },
  queens: {
    name: 'Queens',
    slug: 'queens',
    tagline: 'The world\u2019s borough — diverse communities, excellent value, and rapid growth.',
    intro: 'Queens is NYC\u2019s largest and most ethnically diverse borough, offering exceptional real estate value with strong growth potential. From the waterfront high-rises of Long Island City to the tree-lined streets of Forest Hills and the cultural richness of Jackson Heights, Queens provides options for every lifestyle and budget. Our guides cover market trends, transit access, and neighborhood character.',
    heroImage: 'https://images.unsplash.com/photo-1590417975794-cfbfa1c5c37d?w=1600&q=80',
    neighborhoodCount: 7,
  },
  bronx: {
    name: 'Bronx',
    slug: 'bronx',
    tagline: 'Green spaces, waterfront living, and emerging neighborhoods with strong upside.',
    intro: 'The Bronx offers some of the most compelling real estate opportunities in New York City. With more parkland per capita than any other borough, waterfront communities like City Island, and established neighborhoods like Riverdale, the Bronx combines affordability with quality of life. Our neighborhood guides highlight market data, transit options, and investment potential.',
    heroImage: 'https://images.unsplash.com/photo-1577640905050-5765bf36e4fa?w=1600&q=80',
    neighborhoodCount: 5,
  },
  'staten-island': {
    name: 'Staten Island',
    slug: 'staten-island',
    tagline: 'Suburban charm with city access — the most affordable borough in NYC.',
    intro: 'Staten Island offers a unique blend of suburban living within New York City. With the lowest prices per square foot of any borough, generous lot sizes, and a growing waterfront district in St. George, Staten Island appeals to buyers seeking space and value. Our neighborhood guides cover market trends, commute options, and community character.',
    heroImage: 'https://images.unsplash.com/photo-1568797629192-950acb64a441?w=1600&q=80',
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

const dataCache = new Map<BoroughSlug, Neighborhood[]>();

export function loadNeighborhoods(boroughSlug: BoroughSlug): Neighborhood[] {
  if (dataCache.has(boroughSlug)) return dataCache.get(boroughSlug)!;

  /* eslint-disable @typescript-eslint/no-require-imports */
  let raw: { neighborhoods: Neighborhood[] };
  switch (boroughSlug) {
    case 'manhattan':
      raw = require('@/data/manhattan-neighborhoods.json');
      break;
    case 'brooklyn':
      raw = require('@/data/brooklyn-neighborhoods.json');
      break;
    case 'queens':
      raw = require('@/data/queens-neighborhoods.json');
      break;
    case 'bronx':
      raw = require('@/data/bronx-neighborhoods.json');
      break;
    case 'staten-island':
      raw = require('@/data/staten-island-neighborhoods.json');
      break;
  }
  /* eslint-enable @typescript-eslint/no-require-imports */

  const neighborhoods = raw.neighborhoods as Neighborhood[];
  dataCache.set(boroughSlug, neighborhoods);
  return neighborhoods;
}

export function findNeighborhood(
  boroughSlug: BoroughSlug,
  slug: string,
): Neighborhood | undefined {
  return loadNeighborhoods(boroughSlug).find((n) => n.slug === slug);
}

export function getBoroughConfig(slug: BoroughSlug): BoroughConfig {
  return BOROUGH_CONFIGS[slug];
}
