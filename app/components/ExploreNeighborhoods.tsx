'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';
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

/** Map neighborhood IDs to correct borough routes */
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
      className="hood-card group block relative overflow-hidden rounded-3xl aspect-[3/4] cursor-pointer"
    >
      <div className="absolute inset-0 bg-gray-300">
        <Image
          src={neighborhood.thumbnail}
          alt={neighborhood.name}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 16vw"
          loading="lazy"
        />
      </div>
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="font-display font-semibold text-white text-sm">{neighborhood.name}</p>
        <p className="text-white/40 text-[11px] font-extralight">
          {neighborhood.listingCount} listings
        </p>
      </div>
    </Link>
  );
}

export default function ExploreNeighborhoods() {
  const gridRef = useGsapReveal<HTMLDivElement>({ children: true, y: 40, scale: 0.96, ease: 'back.out(1.4)', stagger: 0.06 });

  const neighborhoods = (neighborhoodsData.neighborhoods as Neighborhood[]).slice(0, 6);

  return (
    <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40">
      <div className="max-w-[1440px] mx-auto">
        {/* Section header — left-aligned */}
        <div className="flex items-end justify-between mb-12 md:mb-16">
          <div>
            <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Explore</p>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">Neighborhoods</h2>
          </div>
          <Link href="/neighborhoods" className="text-[13px] font-light text-brand-dark/30 hover:text-brand-dark transition-all duration-500 hidden sm:block">
            All 59 &rarr;
          </Link>
        </div>

        {/* Portrait card grid */}
        <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          {neighborhoods.map((neighborhood) => (
            <NeighborhoodCard key={neighborhood.id} neighborhood={neighborhood} />
          ))}
        </div>

        <div className="mt-10 sm:mt-12 text-center sm:hidden">
          <Link
            href="/neighborhoods"
            className="text-[13px] font-light text-brand-dark/30 hover:text-brand-dark transition-all duration-500"
          >
            All 59 &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
