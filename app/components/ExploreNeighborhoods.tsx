'use client';

import Link from 'next/link';
import neighborhoodsData from '@/data/neighborhoods.json';

const TEXT_SHADOW = '0 1px 4px rgba(0,0,0,0.9), 0 4px 12px rgba(0,0,0,0.5)';

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
    ? `$${(neighborhood.avgPrice.sale / 1000000).toFixed(1)}M avg`
    : null;

  return (
    <Link
      href={getNeighborhoodHref(neighborhood.id)}
      className="liquid-card group block relative overflow-hidden rounded-2xl aspect-[4/3] bg-gray-200"
    >
      {/* Photo — fills entire card */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={neighborhood.thumbnail}
        alt={neighborhood.name}
        className="card-img absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />

      {/* Gold border glow on hover */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-[500ms]"
           style={{ boxShadow: 'inset 0 0 0 2px rgba(196,160,82,0.7)' }} />

      {/* Listing count badge */}
      <div className="absolute top-3 right-3 z-20 transition-all duration-500 group-hover:opacity-0">
        <span className="bg-black/40 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded tracking-widest uppercase">
          {neighborhood.listingCount} listings
        </span>
      </div>

      {/* Text — no gradient, text-shadow only */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 sm:p-5">
        <h3 className={`font-sans font-black text-white leading-tight transition-transform duration-[550ms] ease-out ${large ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'} group-hover:-translate-y-9`}
            style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)', textShadow: TEXT_SHADOW }}>
          {neighborhood.name}
        </h3>

        {/* Revealed on hover */}
        <div className="overflow-hidden">
          <div className="translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-[550ms]"
               style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
            <p className="text-white/80 text-xs mt-1 leading-snug line-clamp-1" style={{ textShadow: TEXT_SHADOW }}>
              {neighborhood.tagline}
            </p>
            <div className="flex items-center justify-between mt-3">
              {formattedSalePrice && (
                <span className="text-[#C4A052] text-xs font-bold" style={{ textShadow: TEXT_SHADOW }}>{formattedSalePrice}</span>
              )}
              <span className="ml-auto flex items-center gap-1 text-white text-xs font-bold tracking-wide group/cta" style={{ textShadow: TEXT_SHADOW }}>
                Explore
                <span className="transition-transform duration-300 group-hover/cta:translate-x-1" aria-hidden>→</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ExploreNeighborhoods() {
  const neighborhoods = (neighborhoodsData.neighborhoods as Neighborhood[]).slice(0, 6);
  const [featured, ...rest] = neighborhoods;

  return (
    <section className="py-24 sm:py-28 md:py-36 px-4 bg-white">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12 sm:mb-16">
          <div>
            <p className="text-[11px] font-black tracking-[0.3em] uppercase text-[#C4A052] mb-4">
              All Five Boroughs
            </p>
            <h2 className="font-sans font-black text-4xl sm:text-5xl md:text-6xl text-gray-950 leading-none tracking-tight">
              Explore<br />Neighborhoods.
            </h2>
          </div>
          <Link
            href="/neighborhoods"
            className="group inline-flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-[#C4A052] transition-colors whitespace-nowrap"
          >
            View all neighborhoods
            <span className="group-hover:translate-x-1 transition-transform" aria-hidden>→</span>
          </Link>
        </div>

        {/* Featured large card (2-col) + 4 standard cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {featured && (
            <div className="col-span-2">
              <NeighborhoodCard neighborhood={featured} large />
            </div>
          )}
          {rest.slice(0, 4).map((n) => (
            <NeighborhoodCard key={n.id} neighborhood={n} />
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 sm:mt-16 text-center">
          <Link
            href="/neighborhoods"
            className="inline-flex items-center gap-3 px-10 py-4 border-2 border-gray-950 text-gray-950 font-black rounded-xl hover:bg-gray-950 hover:text-white transition-all duration-300 text-sm tracking-widest uppercase"
          >
            All Neighborhoods →
          </Link>
        </div>

      </div>
    </section>
  );
}
