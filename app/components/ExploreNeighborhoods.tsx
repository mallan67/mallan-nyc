'use client';

import Link from 'next/link';
import neighborhoodsData from '@/data/neighborhoods.json';

const glossPanel = 'relative bg-gray-950 overflow-hidden';
const glossSheen = 'pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-white/[0.03]';

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
      className="liquid-card group block rounded-2xl overflow-hidden"
    >
      {/* Photo — clean, bright */}
      <div className={`relative overflow-hidden bg-gray-100 ${large ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={neighborhood.thumbnail}
          alt={neighborhood.name}
          className="card-img absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <span className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-gray-600 text-[10px] font-semibold px-2.5 py-1 rounded-full tracking-wide">
          {neighborhood.listingCount} listings
        </span>
      </div>

      {/* Glossy black info panel */}
      <div className={glossPanel}>
        <div className={glossSheen} />
        <div className="relative z-10 p-4 sm:p-5">
          <h3 className={`font-sans font-black text-white leading-tight ${large ? 'text-xl sm:text-2xl' : 'text-lg'}`}>
            {neighborhood.name}
          </h3>
          <p className="text-white/50 text-sm mt-1 line-clamp-1">
            {neighborhood.tagline}
          </p>
          <div className="flex items-center justify-between mt-3">
            {formattedSalePrice && (
              <span className="text-[#C4A052] text-xs font-bold">{formattedSalePrice}</span>
            )}
            <span className="ml-auto text-white/40 text-xs font-bold tracking-wide group-hover:text-[#C4A052] transition-colors">
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
  const [featured, ...rest] = neighborhoods;

  return (
    <section className="py-24 sm:py-28 md:py-36 px-4 bg-white">
      <div className="max-w-7xl mx-auto">

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

        {/* Mobile: horizontal scroll */}
        <div className="sm:hidden flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {neighborhoods.map((n) => (
            <div key={n.id} className="flex-shrink-0 w-[260px] snap-start">
              <NeighborhoodCard neighborhood={n} />
            </div>
          ))}
        </div>
        {/* Desktop: grid */}
        <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
          {featured && (
            <div className="col-span-2">
              <NeighborhoodCard neighborhood={featured} large />
            </div>
          )}
          {rest.slice(0, 4).map((n) => (
            <NeighborhoodCard key={n.id} neighborhood={n} />
          ))}
        </div>

        <div className="mt-14 sm:mt-20 text-center">
          <Link
            href="/neighborhoods"
            className="btn-outline"
          >
            All Neighborhoods →
          </Link>
        </div>

      </div>
    </section>
  );
}
