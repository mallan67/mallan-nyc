'use client';

import Image from 'next/image';
import Link from 'next/link';
import neighborhoodsData from '@/data/neighborhoods.json';

type Neighborhood = {
  id: string;
  name: string;
  tagline: string;
  image: string;
  thumbnail: string;
  description: string;
  vibe: string;
  listingCount: number;
  avgPrice: {
    sale: number;
    rent: number;
  };
};

/** Map old neighborhood IDs to correct borough routes */
const NEIGHBORHOOD_ROUTES: Record<string, string> = {
  'upper-east-side': '/manhattan/upper-east-side',
  'upper-west-side': '/manhattan/upper-west-side',
  'tribeca': '/manhattan/tribeca',
  'soho': '/manhattan/soho',
  'chelsea': '/manhattan/chelsea',
  'greenwich-village': '/manhattan/greenwich-village',
  'west-village': '/manhattan/greenwich-village',
  'financial-district': '/manhattan/financial-district',
  'midtown-east': '/manhattan/midtown-east',
  'brooklyn-heights': '/brooklyn/brooklyn-heights',
  'williamsburg': '/brooklyn/williamsburg',
  'dumbo': '/brooklyn/dumbo',
  'park-slope': '/brooklyn/park-slope',
  'cobble-hill': '/brooklyn/cobble-hill',
  'fort-greene': '/brooklyn/fort-greene',
  'astoria': '/queens/astoria',
  'long-island-city': '/queens/long-island-city',
  'riverdale': '/bronx/riverdale',
  'st-george': '/staten-island/st-george',
};

function getNeighborhoodHref(id: string): string {
  return NEIGHBORHOOD_ROUTES[id] || `/manhattan/${id}`;
}

function NeighborhoodCard({ neighborhood }: { neighborhood: Neighborhood }) {
  return (
    <Link
      href={getNeighborhoodHref(neighborhood.id)}
      className="group block relative overflow-hidden rounded-lg aspect-[4/3]"
    >
      <div className="absolute inset-0 bg-gray-300">
        <Image
          src={neighborhood.thumbnail}
          alt={neighborhood.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 16vw"
        />
      </div>
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
        <h3 className="text-lg sm:text-xl font-sans font-medium">{neighborhood.name}</h3>
        <p className="text-sm text-white/80 mt-1">
          {neighborhood.listingCount} listings
        </p>
      </div>
    </Link>
  );
}

export default function ExploreNeighborhoods() {
  // Show first 6 neighborhoods on homepage
  const neighborhoods = (neighborhoodsData.neighborhoods as Neighborhood[]).slice(0, 6);

  return (
    <section className="py-12 sm:py-16 md:py-20 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Section header - centered, consistent with other sections */}
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-lg sm:text-xl md:text-2xl font-sans font-light tracking-tight text-gray-900">
            Explore Neighborhoods
          </h2>
          <p className="mt-2 text-sm sm:text-base text-gray-500">
            Discover NYC neighborhoods across all five boroughs
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {neighborhoods.map((neighborhood) => (
            <NeighborhoodCard key={neighborhood.id} neighborhood={neighborhood} />
          ))}
        </div>
        <div className="mt-10 sm:mt-12 text-center">
          <Link
            href="/neighborhoods"
            className="inline-block px-8 py-3 border border-gray-900 text-gray-900 font-medium rounded-lg hover:bg-gray-900 hover:text-white transition-colors text-sm sm:text-base tracking-wide"
          >
            View All Neighborhoods
          </Link>
        </div>
      </div>
    </section>
  );
}
