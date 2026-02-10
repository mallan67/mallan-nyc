import Link from 'next/link';
import type { Neighborhood, BoroughSlug } from '@/lib/types/neighborhood';

interface AdjacentNeighborhoodsProps {
  currentSlug: string;
  adjacentSlugs: string[];
  allNeighborhoods: Neighborhood[];
  boroughSlug?: BoroughSlug;
}

export default function AdjacentNeighborhoods({
  adjacentSlugs,
  allNeighborhoods,
  boroughSlug = 'manhattan',
}: AdjacentNeighborhoodsProps) {
  const neighbors = adjacentSlugs
    .map((slug) => allNeighborhoods.find((n) => n.slug === slug))
    .filter(Boolean) as Neighborhood[];

  if (!neighbors.length) return null;

  return (
    <section aria-label="Explore Nearby Neighborhoods" className="py-10 sm:py-14 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-sans font-semibold text-gray-900 mb-6">
          Explore Nearby
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {neighbors.map((n) => (
            <Link
              key={n.slug}
              href={`/${boroughSlug}/${n.slug}`}
              className="group block bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
            >
              <div
                className="h-36 bg-cover bg-center group-hover:scale-105 transition-transform duration-300"
                style={{ backgroundImage: `url(${n.heroImage})` }}
              />
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 group-hover:text-brand-gold transition-colors">
                  {n.name}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">{n.tagline}</p>
                <p className="text-xs text-gray-400 mt-1">
                  From ${n.marketStats.medianSalePrice >= 1_000_000
                    ? `${(n.marketStats.medianSalePrice / 1_000_000).toFixed(1)}M`
                    : `${Math.round(n.marketStats.medianSalePrice / 1_000)}K`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
