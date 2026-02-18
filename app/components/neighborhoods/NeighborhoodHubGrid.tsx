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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sorted.map((n) => (
            <Link
              key={n.slug}
              href={`/${boroughSlug}/${n.slug}`}
              className="liquid-card group block rounded-2xl overflow-hidden relative"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                <div
                  className="card-img absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${n.heroImage})` }}
                />

                {/* Translucent glass info */}
                <div className="absolute inset-x-0 bottom-0 z-10 bg-black/55 backdrop-blur-md border-t border-white/10">
                  <div className="px-4 py-3">
                    <h3 className="text-base font-bold text-white">{n.name}</h3>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex gap-1">
                        {n.transit.slice(0, 5).map((line) => (
                          <SubwayBadge key={line} line={line} />
                        ))}
                      </div>
                      <span className="text-xs text-white/50 font-medium group-hover:text-[#C4A052] transition-colors">
                        From $
                        {n.marketStats.medianSalePrice >= 1_000_000
                          ? `${(n.marketStats.medianSalePrice / 1_000_000).toFixed(1)}M`
                          : `${Math.round(n.marketStats.medianSalePrice / 1_000)}K`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
