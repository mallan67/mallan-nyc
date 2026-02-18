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
  return (
    <Link
      href={getNeighborhoodHref(neighborhood.id)}
      className={`group block relative overflow-hidden rounded-2xl ${large ? 'aspect-[4/3]' : 'aspect-[4/3]'} shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5`}
    >
      <div className="absolute inset-0 bg-gray-800">
        <Image
          src={neighborhood.thumbnail}
          alt={neighborhood.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes={large
            ? "(max-width: 768px) 100vw, 50vw"
            : "(max-width: 640px) 50vw, (max-width: 1200px) 33vw, 25vw"
          }
        />
      </div>
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent transition-opacity duration-300 group-hover:from-black/70" />
      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 text-white">
        <h3 className={`font-bold leading-tight ${large ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'}`}>
          {neighborhood.name}
        </h3>
        {neighborhood.tagline && (
          <p className="text-white/65 text-xs sm:text-sm mt-0.5 line-clamp-1">{neighborhood.tagline}</p>
        )}
        <p className="text-[#C4A052] text-xs font-semibold mt-1.5 tracking-wide">
          {neighborhood.listingCount} listings
        </p>
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10 sm:mb-12">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#C4A052] mb-2">
              All Five Boroughs
            </p>
            <h2 className="font-sans font-black text-4xl sm:text-5xl md:text-6xl text-gray-950 leading-none tracking-tight">
              Explore<br />Neighborhoods.
            </h2>
          </div>
          <Link
            href="/neighborhoods"
            className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors underline underline-offset-4 decoration-gray-300 hover:decoration-gray-600 whitespace-nowrap"
          >
            View all neighborhoods →
          </Link>
        </div>

        {/* Featured large card + 4-grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Large featured card — spans 2 cols on md+ */}
          {featured && (
            <div className="col-span-2 md:col-span-2">
              <NeighborhoodCard neighborhood={featured} large />
            </div>
          )}
          {/* Remaining 4 cards */}
          {rest.slice(0, 4).map((n) => (
            <NeighborhoodCard key={n.id} neighborhood={n} />
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-10 sm:mt-12 text-center">
          <Link
            href="/neighborhoods"
            className="inline-block px-10 py-4 border-2 border-gray-900 text-gray-900 font-bold rounded-xl hover:bg-gray-900 hover:text-white transition-all text-sm sm:text-base tracking-wide"
          >
            All Neighborhoods
          </Link>
        </div>
      </div>
    </section>
  );
}
