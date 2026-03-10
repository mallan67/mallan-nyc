import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Our Track Record | Mallan Real Estate',
  description:
    'See our closed deals, transaction volume, and proven results across NYC. Mallan Real Estate delivers results for sellers and buyers.',
  alternates: { canonical: 'https://mallan.nyc/results' },
  openGraph: {
    title: 'Our Track Record | Mallan Real Estate',
    description: 'Proven results across NYC — closed deals, transaction volume, and neighborhood expertise.',
  },
};

interface Deal {
  id: string;
  street: string;
  unit: string | null;
  city: string;
  neighborhood: string | null;
  dealType: string;
  propertyType: string | null;
  closePrice: number | null;
  closeDate: string | null;
  beds: number | null;
  bathsFull: number | null;
  sqft: number | null;
  photoUrl: string | null;
  agentName: string | null;
  agentSlug: string | null;
}

interface ResultsData {
  stats: {
    totalTransactions: number;
    totalSales: number;
    totalRentals: number;
    totalVolume: number;
    avgSalePrice: number;
  };
  topNeighborhoods: { name: string; count: number }[];
  propertyTypes: { name: string; count: number }[];
  recentDeals: Deal[];
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`;
  return `$${price.toLocaleString()}`;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(0)}M`;
  return `$${(vol / 1_000).toFixed(0)}K`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

async function getResults(): Promise<ResultsData | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  try {
    const res = await fetch(`${baseUrl}/api/results`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function ResultsPage() {
  const data = await getResults();

  const stats = data?.stats || {
    totalTransactions: 0,
    totalSales: 0,
    totalRentals: 0,
    totalVolume: 0,
    avgSalePrice: 0,
  };

  const deals = data?.recentDeals || [];
  const topNeighborhoods = data?.topNeighborhoods || [];
  const propertyTypes = data?.propertyTypes || [];

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1600&q=80&auto=format&fit=crop"
            alt="NYC skyline"
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
        </div>
        <div className="relative z-10 pt-32 pb-20 md:pt-40 md:pb-28 px-6 text-center">
          <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-4">
            Our Track Record
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl lg:text-6xl tracking-tight text-white mb-4">
            Results That Speak
          </h1>
          <p className="text-white/70 text-base md:text-lg font-light max-w-xl mx-auto">
            Every transaction represents a client who trusted us with one of
            the biggest decisions of their life.
          </p>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="bg-white border-b border-black/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center">
            <div>
              <p className="text-3xl md:text-4xl font-display font-bold text-brand-dark">
                {stats.totalTransactions}
              </p>
              <p className="text-brand-dark/50 text-[13px] mt-1">
                Total Transactions
              </p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-display font-bold text-brand-dark">
                {stats.totalVolume > 0 ? formatVolume(stats.totalVolume) : '\u2014'}
              </p>
              <p className="text-brand-dark/50 text-[13px] mt-1">
                Sales Volume
              </p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-display font-bold text-brand-dark">
                {stats.avgSalePrice > 0 ? formatPrice(stats.avgSalePrice) : '\u2014'}
              </p>
              <p className="text-brand-dark/50 text-[13px] mt-1">
                Avg Sale Price
              </p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-display font-bold text-brand-dark">
                {topNeighborhoods.length}
              </p>
              <p className="text-brand-dark/50 text-[13px] mt-1">
                Neighborhoods Served
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="py-12 md:py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {/* Recent Closed Deals */}
          {deals.length > 0 && (
            <section className="mb-16">
              <div className="text-center mb-10">
                <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                  Closed Deals
                </p>
                <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-brand-dark">
                  Recent Transactions
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="relative aspect-[16/10] bg-gray-100">
                      {deal.photoUrl ? (
                        <Image
                          src={deal.photoUrl}
                          alt={deal.street}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                          <svg
                            className="w-10 h-10 text-gray-300"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z"
                            />
                          </svg>
                        </div>
                      )}
                      <div className="absolute top-2.5 left-2.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-1 rounded-lg uppercase tracking-wider ${
                            deal.dealType === 'rent'
                              ? 'bg-purple-600/90 text-white'
                              : 'bg-green-600/90 text-white'
                          }`}
                        >
                          {deal.dealType === 'rent' ? 'Rented' : 'Sold'}
                        </span>
                      </div>
                      {deal.closeDate && (
                        <div className="absolute bottom-2.5 right-2.5">
                          <span className="text-[10px] font-medium px-2 py-1 rounded-lg bg-black/50 text-white/90 backdrop-blur-sm">
                            {formatDate(deal.closeDate)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      {deal.closePrice && (
                        <p className="text-lg font-display font-bold text-brand-dark">
                          {formatPrice(deal.closePrice)}
                          {deal.dealType === 'rent' && (
                            <span className="text-[13px] font-normal text-brand-dark/50">
                              /mo
                            </span>
                          )}
                        </p>
                      )}
                      <p className="text-brand-dark/80 text-sm mt-1 truncate">
                        {deal.street}
                        {deal.unit ? `, ${deal.unit}` : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-[12px] text-brand-dark/50">
                        {deal.neighborhood && <span>{deal.neighborhood}</span>}
                        {deal.propertyType && deal.propertyType !== 'Residential' && (
                          <>
                            {deal.neighborhood && (
                              <span className="text-brand-dark/20">&middot;</span>
                            )}
                            <span>{deal.propertyType}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[12px] text-brand-dark/50">
                        {deal.beds != null && deal.beds > 0 && (
                          <span>
                            {deal.beds} Bed{deal.beds !== 1 ? 's' : ''}
                          </span>
                        )}
                        {deal.bathsFull != null && deal.bathsFull > 0 && (
                          <>
                            <span className="text-brand-dark/20">&middot;</span>
                            <span>{deal.bathsFull} Bath</span>
                          </>
                        )}
                        {deal.sqft != null && deal.sqft > 0 && (
                          <>
                            <span className="text-brand-dark/20">&middot;</span>
                            <span>{deal.sqft.toLocaleString()} SF</span>
                          </>
                        )}
                      </div>
                      {deal.agentName && deal.agentSlug && (
                        <Link
                          href={`/agents/${deal.agentSlug}`}
                          className="text-[11px] text-brand-gold-deep hover:text-brand-gold font-medium mt-2 inline-block transition-colors"
                        >
                          {deal.agentName}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Neighborhood Expertise + Property Types side by side */}
          {(topNeighborhoods.length > 0 || propertyTypes.length > 0) && (
            <section className="mb-16 grid md:grid-cols-2 gap-8">
              {topNeighborhoods.length > 0 && (
                <div className="rounded-2xl bg-[#F8F7F4] border border-black/[0.03] p-6 md:p-8">
                  <h3 className="font-display font-bold text-lg text-brand-dark mb-5">
                    Neighborhoods We Serve
                  </h3>
                  <div className="space-y-3">
                    {topNeighborhoods.map((n) => {
                      const maxCount = topNeighborhoods[0]?.count || 1;
                      const pct = Math.round((n.count / maxCount) * 100);
                      return (
                        <div key={n.name}>
                          <div className="flex justify-between text-[13px] mb-1">
                            <span className="font-medium text-brand-dark">{n.name}</span>
                            <span className="text-brand-dark/50">
                              {n.count} deal{n.count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-gold rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {propertyTypes.length > 0 && (
                <div className="rounded-2xl bg-[#F8F7F4] border border-black/[0.03] p-6 md:p-8">
                  <h3 className="font-display font-bold text-lg text-brand-dark mb-5">
                    Property Types
                  </h3>
                  <div className="space-y-3">
                    {propertyTypes.map((pt) => {
                      const maxCount = propertyTypes[0]?.count || 1;
                      const pct = Math.round((pt.count / maxCount) * 100);
                      return (
                        <div key={pt.name}>
                          <div className="flex justify-between text-[13px] mb-1">
                            <span className="font-medium text-brand-dark">{pt.name}</span>
                            <span className="text-brand-dark/50">
                              {pt.count} deal{pt.count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-dark/60 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* CTA */}
          <section className="bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] rounded-3xl p-8 md:p-12 text-center">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-4">
              Your Turn
            </p>
            <h2 className="font-display font-bold text-2xl md:text-3xl lg:text-4xl text-white mb-4">
              Ready to See What Your Property Is Worth?
            </h2>
            <p className="text-white/60 text-sm max-w-lg mx-auto mb-8">
              Get a free, no-obligation market analysis. See how your property compares to recent
              sales in your neighborhood.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/sell#valuation"
                className="inline-flex items-center justify-center px-8 py-3.5 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm"
              >
                Get Free Valuation
              </Link>
              <a
                href="tel:+16462584460"
                className="inline-flex items-center justify-center px-8 py-3.5 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 transition-colors text-sm"
              >
                Call (646) 258-4460
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
