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
              className="group block relative overflow-hidden rounded-3xl aspect-[3/2]"
            >
              {/* Background */}
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundImage: `url(${n.heroImage})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <h3 className="text-xl font-display font-semibold text-white">{n.name}</h3>
                <p className="text-sm text-white/80 mt-0.5">{n.tagline}</p>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex gap-1">
                    {n.transit.slice(0, 5).map((line) => (
                      <SubwayBadge key={line} line={line} />
                    ))}
                  </div>
                  <span className="text-sm text-white/90 font-medium">
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
