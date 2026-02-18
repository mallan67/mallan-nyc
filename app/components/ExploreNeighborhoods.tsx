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

function NeighborhoodCard({ neighborhood, large }: { neighborhood: Neighborhood; large?: boolean }) {
  const formattedSalePrice = neighborhood.avgPrice.sale > 0
    ? `$${(neighborhood.avgPrice.sale / 1000000).toFixed(1)}M`
    : null;

  return (
    <Link
      href={getNeighborhoodHref(neighborhood.id)}
      className="liquid-card group block rounded-2xl overflow-hidden"
    >
      <div className={`relative overflow-hidden bg-gray-100 ${large ? 'aspect-[16/9]' : 'aspect-[3/2]'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={neighborhood.thumbnail}
          alt={neighborhood.name}
          className="card-img absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />

        {/* Listing count badge */}
        <span className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm text-gray-600 text-[10px] font-semibold px-2.5 py-1 rounded-full tracking-wide">
          {neighborhood.listingCount} listings
        </span>

        {/* Soft gradient fade + text */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent pt-12 pb-3.5 px-4">
          <h3 className={`font-sans font-black text-white leading-tight drop-shadow-md ${large ? 'text-xl' : 'text-base'}`}>
            {neighborhood.name}
          </h3>
          <div className="flex items-center justify-between mt-1">
            {formattedSalePrice && (
              <span className="text-[#C4A052] text-xs font-bold drop-shadow-sm">{formattedSalePrice} avg</span>
            )}
            <span className="ml-auto text-white/60 text-xs font-bold tracking-wide group-hover:text-[#C4A052] transition-colors drop-shadow-sm">
              Explore →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ExploreNeighborhoods() {
  const neighborhoods = (neighborhoodsData.neighborhoods as Neighborhood[]).slice(0, 6);

  return (
    <section className="py-16 sm:py-20 md:py-24 px-4 bg-white">
      <div className="max-w-7xl mx-auto">

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8 sm:mb-10">
          <div>
            <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#C4A052] mb-2">
              All Five Boroughs
            </p>
            <h2 className="font-display text-3xl sm:text-4xl text-gray-950 leading-none tracking-tight">
              Explore Neighborhoods.
            </h2>
          </div>
          <Link
            href="/neighborhoods"
            className="group inline-flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-[#C4A052] transition-colors whitespace-nowrap"
          >
            View all
            <span className="group-hover:translate-x-1 transition-transform" aria-hidden>→</span>
          </Link>
        </div>

        {/* Mobile: horizontal scroll */}
        <div className="sm:hidden -mx-4 overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="inline-flex gap-4 px-4 pb-4">
            {neighborhoods.map((n) => (
              <div key={n.id} className="flex-shrink-0 w-[260px] snap-start">
                <NeighborhoodCard neighborhood={n} />
              </div>
            ))}
          </div>
        </div>
        {/* Desktop: uniform 3-col grid — no mismatched heights */}
        <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
          {neighborhoods.map((n) => (
            <NeighborhoodCard key={n.id} neighborhood={n} />
          ))}
        </div>

        <div className="mt-12 sm:mt-16 text-center">
          <Link href="/neighborhoods" className="btn-outline">
            All Neighborhoods →
          </Link>
        </div>

      </div>
    </section>
  );
}
