import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import BackButton from '@/app/components/BackButton';

// ISR — revalidate every 10 minutes
export const revalidate = 600;

type Props = {
  searchParams: Promise<{
    streetNumber?: string;
    streetName?: string;
    postalCode?: string;
    buildingName?: string;
  }>;
};

interface ActiveUnit {
  id: string;
  mlsId: string;
  listPrice: number;
  beds: number;
  baths: number;
  bathsHalf: number;
  sqft: number;
  unit: string;
  propertyType: string;
  office: string;
  status: string;
}

interface SaleRecord {
  id: string;
  mlsId: string;
  closePrice: number;
  beds: number;
  baths: number;
  sqft: number;
  unit: string;
  closeDate: string | null;
  propertyType: string;
  office: string;
  source: string;
}

interface BuildingData {
  success: boolean;
  building: {
    name: string | null;
    address: string;
    postalCode: string;
    yearBuilt: number | null;
    storiesTotal: number | null;
    amenities: string[];
    petPolicy: string[];
  };
  activeUnits: ActiveUnit[];
  saleHistory: SaleRecord[];
  stats: {
    totalActive: number;
    totalSales: number;
    avgPrice: number | null;
    avgSqft: number | null;
    avgPricePerSqft: number | null;
  };
  _compliance: {
    source: string;
    attribution: string;
    disclaimerRequired: boolean;
  };
}

async function fetchBuildingData(params: {
  streetNumber: string;
  streetName: string;
  postalCode?: string;
  buildingName?: string;
}): Promise<BuildingData | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const searchParams = new URLSearchParams({
    streetNumber: params.streetNumber,
    streetName: params.streetName,
  });
  if (params.postalCode) searchParams.set('postalCode', params.postalCode);
  if (params.buildingName) searchParams.set('buildingName', params.buildingName);

  try {
    const res = await fetch(`${baseUrl}/api/buildings?${searchParams}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;
    return data as BuildingData;
  } catch {
    return null;
  }
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  if (!sp.streetNumber || !sp.streetName) {
    return { title: 'Building | Mallan Real Estate' };
  }

  const data = await fetchBuildingData({
    streetNumber: sp.streetNumber,
    streetName: sp.streetName,
    postalCode: sp.postalCode,
    buildingName: sp.buildingName,
  });

  const buildingLabel = data?.building?.name || `${sp.streetNumber} ${sp.streetName}`;

  return {
    title: `${buildingLabel} | Building Details | Mallan Real Estate`,
    description: `View all available listings, sales history, and building amenities at ${buildingLabel}. ${data?.stats?.totalActive || 0} active listings.`,
    openGraph: {
      title: `${buildingLabel} | Mallan Real Estate`,
      description: `Building details, available units, and sales history at ${buildingLabel}.`,
      type: 'website',
    },
  };
}

/** Amenity label → icon mapping */
function AmenityIcon({ label }: { label: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    Doorman: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    Elevator: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
      </svg>
    ),
    Gym: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h1.5m15 0H21m-3-6v12M6 6v12m3-9h6m-6 6h6" />
      </svg>
    ),
    Pool: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    ),
    Garage: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    Concierge: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
    Laundry: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  };

  return (
    <span className="text-brand-gold-deep">
      {iconMap[label] || (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      )}
    </span>
  );
}

export default async function BuildingPage({ searchParams }: Props) {
  const sp = await searchParams;

  if (!sp.streetNumber || !sp.streetName) {
    notFound();
  }

  const data = await fetchBuildingData({
    streetNumber: sp.streetNumber,
    streetName: sp.streetName,
    postalCode: sp.postalCode,
    buildingName: sp.buildingName,
  });

  if (!data) {
    notFound();
  }

  const { building, activeUnits, saleHistory, stats } = data;
  const buildingLabel = building.name || building.address;
  const hasDetailData = saleHistory.some((s) => s.sqft > 0 || s.beds > 0);

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      {/* Breadcrumb */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-black/5 pt-[68px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
          <nav className="flex items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
            <BackButton fallbackHref="/buy" />
            <Link href="/" className="text-brand-dark/60 hover:text-brand-gold transition-colors">
              Home
            </Link>
            <span className="text-brand-dark/30">/</span>
            <span className="text-brand-dark font-medium">Building</span>
          </nav>
        </div>
      </div>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-[#1a1a1a] to-[#2a2a2a] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          {/* Building Icon */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-gold/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-white/50 uppercase tracking-[0.15em]">
              Building Profile
            </p>
          </div>

          <h1 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight mb-2">
            {buildingLabel}
          </h1>
          <p className="text-white/70 text-lg">
            {building.address}
            {building.postalCode && <>, New York, NY {building.postalCode}</>}
          </p>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-b border-black/5 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-0 py-4">
            {stats.totalActive > 0 && (
              <div className="flex items-center gap-2 px-4 md:px-6 py-2">
                <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
                <div>
                  <span className="text-xl font-display font-bold text-brand-dark">{stats.totalActive}</span>
                  <span className="text-brand-dark/60 text-[13px] ml-1.5">Active</span>
                </div>
              </div>
            )}
            {stats.totalActive > 0 && stats.avgPrice && <div className="w-px h-8 bg-black/10" />}
            {stats.avgPrice && (
              <div className="px-4 md:px-6 py-2">
                <span className="text-xl font-display font-bold text-brand-dark">{formatPrice(stats.avgPrice)}</span>
                <span className="text-brand-dark/60 text-[13px] ml-1.5">Avg Price</span>
              </div>
            )}
            {stats.avgSqft && (
              <>
                <div className="w-px h-8 bg-black/10" />
                <div className="px-4 md:px-6 py-2">
                  <span className="text-xl font-display font-bold text-brand-dark">{stats.avgSqft.toLocaleString()}</span>
                  <span className="text-brand-dark/60 text-[13px] ml-1.5">Avg SF</span>
                </div>
              </>
            )}
            {stats.avgPricePerSqft && (
              <>
                <div className="w-px h-8 bg-black/10" />
                <div className="px-4 md:px-6 py-2">
                  <span className="text-xl font-display font-bold text-brand-dark">${stats.avgPricePerSqft.toLocaleString()}</span>
                  <span className="text-brand-dark/60 text-[13px] ml-1.5">/SF</span>
                </div>
              </>
            )}
            {building.yearBuilt && (
              <>
                <div className="w-px h-8 bg-black/10" />
                <div className="px-4 md:px-6 py-2">
                  <span className="text-xl font-display font-bold text-brand-dark">{building.yearBuilt}</span>
                  <span className="text-brand-dark/60 text-[13px] ml-1.5">Year Built</span>
                </div>
              </>
            )}
            {building.storiesTotal && (
              <>
                <div className="w-px h-8 bg-black/10" />
                <div className="px-4 md:px-6 py-2">
                  <span className="text-xl font-display font-bold text-brand-dark">{building.storiesTotal}</span>
                  <span className="text-brand-dark/60 text-[13px] ml-1.5">Stories</span>
                </div>
              </>
            )}
            {stats.totalSales > 0 && (
              <>
                <div className="w-px h-8 bg-black/10" />
                <div className="px-4 md:px-6 py-2">
                  <span className="text-xl font-display font-bold text-brand-dark">{stats.totalSales}</span>
                  <span className="text-brand-dark/60 text-[13px] ml-1.5">Recent Sales</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <main className="py-8 md:py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto space-y-10">

          {/* Available Units */}
          {activeUnits.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-brand-dark">
                  Available Units ({activeUnits.length})
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeUnits.map((unit) => (
                  <Link
                    key={unit.id}
                    href={`/listing/${unit.mlsId}`}
                    className="glass-card rounded-2xl p-5 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 group border border-black/[0.04]"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-xl font-display font-bold text-brand-dark">
                          {formatPrice(unit.listPrice)}
                        </p>
                        {unit.unit && (
                          <p className="text-[13px] text-brand-gold-deep font-medium">
                            Unit {unit.unit}
                          </p>
                        )}
                      </div>
                      <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-600 text-[11px] font-semibold rounded-full uppercase tracking-wider">
                        {unit.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-sm text-brand-dark/70">
                      <span>{unit.beds} Bed{unit.beds !== 1 ? 's' : ''}</span>
                      <span className="text-brand-dark/20">&middot;</span>
                      <span>
                        {unit.baths}
                        {unit.bathsHalf > 0 ? `.${unit.bathsHalf}` : ''} Bath
                      </span>
                      {unit.sqft > 0 && (
                        <>
                          <span className="text-brand-dark/20">&middot;</span>
                          <span>{unit.sqft.toLocaleString()} SF</span>
                        </>
                      )}
                    </div>

                    {unit.propertyType && (
                      <p className="text-[12px] text-brand-dark/50 mt-2">{unit.propertyType}</p>
                    )}

                    <div className="mt-3 pt-3 border-t border-black/5">
                      <span className="text-[12px] font-medium text-brand-gold-deep group-hover:text-brand-gold transition-colors flex items-center gap-1">
                        View Listing
                        <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Courtesy attribution */}
              <p className="text-[10px] text-brand-dark/40 mt-3">
                {activeUnits
                  .map((u) => u.office)
                  .filter((v, i, a) => v && a.indexOf(v) === i)
                  .map((office) => `Courtesy of ${office}`)
                  .join(' | ')}
              </p>
            </section>
          )}

          {/* Building Amenities */}
          {building.amenities.length > 0 && (
            <section className="py-6 border-t border-black/[0.06]">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-brand-gold/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-brand-dark">Building Amenities</h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {building.amenities.map((amenity) => (
                  <div
                    key={amenity}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#F8F7F4] border border-black/[0.03]"
                  >
                    <AmenityIcon label={amenity} />
                    <span className="text-[13px] font-medium text-brand-dark">{amenity}</span>
                  </div>
                ))}
              </div>

              {/* Pet Policy */}
              {building.petPolicy.length > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-brand-dark/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
                  </svg>
                  <span className="text-[13px] text-brand-dark/60">
                    Pets: {building.petPolicy.join(', ')}
                  </span>
                </div>
              )}
            </section>
          )}

          {/* Sales History */}
          {saleHistory.length > 0 && (
            <section className="py-6 border-t border-black/[0.06]">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-brand-dark">
                  Sales History ({saleHistory.length})
                </h2>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-black/10">
                      <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">Date</th>
                      <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">Unit</th>
                      <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">Sale Price</th>
                      {hasDetailData && (
                        <>
                          <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">Beds</th>
                          <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">Baths</th>
                          <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">Sq Ft</th>
                          <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">$/SF</th>
                        </>
                      )}
                      <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleHistory.map((sale) => (
                      <tr key={sale.id} className="border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors">
                        <td className="text-[13px] text-brand-dark/70 py-3.5 pr-4">{formatDate(sale.closeDate)}</td>
                        <td className="text-[13px] font-medium text-brand-gold-deep py-3.5 pr-4">{sale.unit || '\u2014'}</td>
                        <td className="text-[13px] font-medium text-brand-dark py-3.5 pr-4">{formatPrice(sale.closePrice)}</td>
                        {hasDetailData && (
                          <>
                            <td className="text-[13px] text-brand-dark/70 py-3.5 pr-4">{sale.beds > 0 ? sale.beds : '\u2014'}</td>
                            <td className="text-[13px] text-brand-dark/70 py-3.5 pr-4">{sale.baths > 0 ? sale.baths : '\u2014'}</td>
                            <td className="text-[13px] text-brand-dark/70 py-3.5 pr-4">{sale.sqft > 0 ? sale.sqft.toLocaleString() : '\u2014'}</td>
                            <td className="text-[13px] text-brand-dark/70 py-3.5 pr-4">
                              {sale.sqft > 0 && sale.closePrice > 0
                                ? `$${Math.round(sale.closePrice / sale.sqft).toLocaleString()}`
                                : '\u2014'}
                            </td>
                          </>
                        )}
                        <td className="text-[13px] text-brand-dark/50 py-3.5">{sale.propertyType || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card layout */}
              <div className="md:hidden space-y-3">
                {saleHistory.map((sale) => (
                  <div key={sale.id} className="rounded-xl bg-[#F8F7F4] p-4 border border-black/[0.03]">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-[15px] font-display font-bold text-brand-dark">
                          {formatPrice(sale.closePrice)}
                        </p>
                        {sale.unit && (
                          <p className="text-[12px] text-brand-gold-deep font-medium">Unit {sale.unit}</p>
                        )}
                      </div>
                      <span className="text-[12px] text-brand-dark/50">{formatDate(sale.closeDate)}</span>
                    </div>
                    <div className="flex gap-3 text-[12px] text-brand-dark/60">
                      {sale.beds > 0 && <span>{sale.beds} Bed{sale.beds !== 1 ? 's' : ''}</span>}
                      {sale.baths > 0 && <span>{sale.baths} Bath</span>}
                      {sale.sqft > 0 && <span>{sale.sqft.toLocaleString()} SF</span>}
                      {sale.propertyType && <span>{sale.propertyType}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {activeUnits.length === 0 && saleHistory.length === 0 && (
            <section className="py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-bold text-brand-dark mb-2">No Data Available</h2>
              <p className="text-brand-dark/50 text-sm max-w-md mx-auto">
                We don&apos;t have any active listings or recent sales history for this building at this time.
              </p>
              <Link
                href="/buy"
                className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm"
              >
                Browse All Listings
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </section>
          )}

          {/* CTA Section */}
          {(activeUnits.length > 0 || saleHistory.length > 0) && (
            <section className="py-8 border-t border-black/[0.06]">
              <div className="bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] rounded-3xl p-8 md:p-10 text-center">
                <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-3">
                  Interested in {buildingLabel}?
                </h2>
                <p className="text-white/60 text-sm max-w-md mx-auto mb-6">
                  Get expert guidance from our agents who know this building inside and out.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <a
                    href="tel:646-258-4460"
                    className="btn-liquid px-6 py-3 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm"
                  >
                    Call (646) 258-4460
                  </a>
                  <Link
                    href="/about#contact"
                    className="btn-liquid px-6 py-3 border border-white/30 text-white font-medium rounded-full hover:bg-white/10 transition-colors text-sm"
                  >
                    Contact Us
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* REBNY Attribution */}
          <IDXDisclaimer />
        </div>
      </main>
    </div>
  );
}
