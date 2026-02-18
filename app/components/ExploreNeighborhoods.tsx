'use client';

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
  avgPrice: { sale: number; rent: number };
};

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
      className="group block"
    >
      <div className="relative aspect-[3/2] rounded-xl overflow-hidden bg-gray-100 mb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={neighborhood.thumbnail}
          alt={neighborhood.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <h3 className="font-semibold text-gray-900 leading-tight">
        {neighborhood.name}
      </h3>
      <p className="text-sm text-gray-500 mt-0.5">
        {neighborhood.listingCount} listings
        {neighborhood.avgPrice.sale > 0 && ` · $${(neighborhood.avgPrice.sale / 1000000).toFixed(1)}M avg`}
      </p>
    </Link>
  );
}

export default function ExploreNeighborhoods() {
  const neighborhoods = (neighborhoodsData.neighborhoods as Neighborhood[]).slice(0, 6);

  return (
    <section className="py-16 sm:py-20 md:py-24 px-4 bg-[#f9f8f6]">
      <div className="max-w-7xl mx-auto">

        <div className="flex items-end justify-between gap-3 mb-10">
          <h2 className="font-display text-3xl sm:text-4xl text-gray-900 leading-none tracking-tight">
            Neighborhoods
          </h2>
          <Link
            href="/neighborhoods"
            className="text-sm font-medium text-gray-400 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            View all →
          </Link>
        </div>

        {/* Mobile: horizontal scroll */}
        <div className="sm:hidden -mx-4 overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="inline-flex gap-5 px-4 pb-4">
            {neighborhoods.map((n) => (
              <div key={n.id} className="flex-shrink-0 w-[260px] snap-start">
                <NeighborhoodCard neighborhood={n} />
              </div>
            ))}
          </div>
        </div>
        {/* Desktop: 3-col grid */}
        <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-10">
          {neighborhoods.map((n) => (
            <NeighborhoodCard key={n.id} neighborhood={n} />
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link href="/neighborhoods" className="btn-outline text-sm">
            All Neighborhoods →
          </Link>
        </div>

      </div>
    </section>
  );
}
