import Link from 'next/link';
import type { Neighborhood, BoroughSlug } from '@/lib/types/neighborhood';
import SubwayBadge from './SubwayBadge';

interface NeighborhoodHubGridProps {
  neighborhoods: Neighborhood[];
  boroughSlug: BoroughSlug;
}

export default function NeighborhoodHubGrid({
  neighborhoods,
  boroughSlug,
}: NeighborhoodHubGridProps) {
  const sorted = [...neighborhoods].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section aria-label="Neighborhoods" className="py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sorted.map((n) => (
            <Link
              key={n.slug}
              href={`/${boroughSlug}/${n.slug}`}
              className="group block rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transition-shadow duration-500"
            >
              {/* Photo — clean, no overlay */}
              <div className="relative aspect-[3/2] overflow-hidden bg-gray-100">
                <div
                  className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-700 ease-out"
                  style={{ backgroundImage: `url(${n.heroImage})` }}
                />
              </div>

              {/* Info below photo */}
              <div className="p-5">
                <h3 className="text-lg font-bold text-gray-950">{n.name}</h3>
                <p className="text-sm text-gray-500 mt-0.5">{n.tagline}</p>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex gap-1">
                    {n.transit.slice(0, 5).map((line) => (
                      <SubwayBadge key={line} line={line} />
                    ))}
                  </div>
                  <span className="text-sm text-gray-400 font-medium group-hover:text-[#C4A052] transition-colors">
                    From $
                    {n.marketStats.medianSalePrice >= 1_000_000
                      ? `${(n.marketStats.medianSalePrice / 1_000_000).toFixed(1)}M`
                      : `${Math.round(n.marketStats.medianSalePrice / 1_000)}K`}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
