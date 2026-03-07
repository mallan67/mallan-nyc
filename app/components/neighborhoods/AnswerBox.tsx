import type { Neighborhood } from '@/lib/types/neighborhood';

interface AnswerBoxProps {
  neighborhood: Neighborhood;
}

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default function AnswerBox({ neighborhood }: AnswerBoxProps) {
  const {
    name,
    summary,
    avgPricePerSqft,
    dominantPropertyType,
    walkScore,
    transitScore,
    topSchool,
  } = neighborhood;

  return (
    <section aria-label={`${name} at a Glance`} className="py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-display font-semibold text-brand-dark mb-4">
          {name} at a Glance
        </h2>
        <p className="text-brand-dark/90 text-base sm:text-lg mb-8 max-w-3xl">
          {summary}
        </p>

        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
          <div className="bg-gray-50/50 rounded-2xl p-4">
            <dt className="text-xs text-brand-dark/75 uppercase tracking-wide">
              Avg. Price/Sq Ft
            </dt>
            <dd className="mt-1 text-xl font-display font-semibold text-brand-dark">
              ${avgPricePerSqft.toLocaleString()}
            </dd>
          </div>
          <div className="bg-gray-50/50 rounded-2xl p-4">
            <dt className="text-xs text-brand-dark/75 uppercase tracking-wide">
              Dominant Type
            </dt>
            <dd className="mt-1 text-xl font-display font-semibold text-brand-dark">
              {dominantPropertyType}
            </dd>
          </div>
          <div className="bg-gray-50/50 rounded-2xl p-4">
            <dt className="text-xs text-brand-dark/75 uppercase tracking-wide">
              Walk Score
            </dt>
            <dd className="mt-1 text-xl font-display font-semibold text-brand-dark">
              {walkScore}
            </dd>
          </div>
          <div className="bg-gray-50/50 rounded-2xl p-4">
            <dt className="text-xs text-brand-dark/75 uppercase tracking-wide">
              Transit Score
            </dt>
            <dd className="mt-1 text-xl font-display font-semibold text-brand-dark">
              {transitScore}
            </dd>
          </div>
          <div className="bg-gray-50/50 rounded-2xl p-4">
            <dt className="text-xs text-brand-dark/75 uppercase tracking-wide">
              Top School
            </dt>
            <dd className="mt-1 text-sm font-display font-semibold text-brand-dark leading-tight">
              {topSchool}
            </dd>
          </div>
          <div className="bg-gray-50/50 rounded-2xl p-4">
            <dt className="text-xs text-brand-dark/75 uppercase tracking-wide">
              Median Sale
            </dt>
            <dd className="mt-1 text-xl font-display font-semibold text-brand-dark">
              {formatPrice(neighborhood.marketStats.medianSalePrice)}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
