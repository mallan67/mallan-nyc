import type { MarketStats } from '@/lib/types/neighborhood';

interface MarketStatsModuleProps {
  name: string;
  stats: MarketStats;
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up')
    return <span className="text-green-600" aria-label="trending up">&#9650;</span>;
  if (trend === 'down')
    return <span className="text-red-500" aria-label="trending down">&#9660;</span>;
  return <span className="text-gray-400" aria-label="flat">&#8212;</span>;
}

export default function MarketStatsModule({
  name,
  stats,
}: MarketStatsModuleProps) {
  const yoyPercent = `${stats.yoyChange >= 0 ? '+' : ''}${(stats.yoyChange * 100).toFixed(1)}%`;

  return (
    <section aria-label={`${name} Market Statistics`} id="market-report" className="py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl sm:text-3xl font-sans font-semibold text-gray-900 mb-6">
          {name} Market Stats
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            label="Median Sale Price"
            value={formatCurrency(stats.medianSalePrice)}
            sub={<><TrendArrow trend={stats.priceTrend} /> {yoyPercent} YoY</>}
          />
          <StatCard
            label="Median Rent"
            value={`$${stats.medianRent.toLocaleString()}/mo`}
          />
          <StatCard
            label="Price / Sq Ft"
            value={`$${stats.pricePerSqft.toLocaleString()}`}
          />
          <StatCard
            label="Avg Days on Market"
            value={String(stats.avgDaysOnMarket)}
          />
          <StatCard
            label="Active Inventory"
            value={String(stats.inventory)}
          />
          <StatCard
            label="Closed Sales (12 mo)"
            value={String(stats.closedSales)}
          />
        </div>

        {/* REBNY Statistical Data Disclaimer - REQUIRED per UCBA Art. VIII Sec. 4 */}
        <p className="mt-6 text-xs text-gray-500 leading-relaxed max-w-4xl">
          Based on information from the REBNY Listing Service for the period
          January 2025 through December 2025. The REBNY Listing Service makes
          no representations or warranties with respect to the accuracy or
          completeness of such information. This information is not verified for
          authenticity or accuracy, is not guaranteed, and may not reflect all
          real estate activity in the market.
        </p>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <dt className="text-xs text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-gray-900">{value}</dd>
      {sub && (
        <dd className="mt-0.5 text-xs text-gray-500 flex items-center gap-1">
          {sub}
        </dd>
      )}
    </div>
  );
}
