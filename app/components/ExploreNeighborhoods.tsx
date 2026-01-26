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

function NeighborhoodCard({ neighborhood }: { neighborhood: Neighborhood }) {
  return (
    <Link
      href={`/neighborhoods/${neighborhood.id}`}
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
    <section className="py-8 sm:py-12 md:py-16 px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-sans mb-6 sm:mb-8">Explore Neighborhoods</h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {neighborhoods.map((neighborhood) => (
            <NeighborhoodCard key={neighborhood.id} neighborhood={neighborhood} />
          ))}
        </div>
        <div className="mt-8 sm:mt-10 text-center">
          <Link
            href="/neighborhoods"
            className="inline-block px-6 sm:px-8 py-2 sm:py-3 border border-brand-dark text-brand-dark font-sans hover:bg-brand-dark hover:text-white transition-colors text-sm sm:text-base"
          >
            View All Neighborhoods
          </Link>
        </div>
      </div>
    </section>
  );
}
