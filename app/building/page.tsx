import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import BackButton from '@/app/components/BackButton';
import { ComingSoonBadge } from '@/app/components/ComingSoonBadge';

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
  listingType: string;
  photoUrl: string | null;
  // UCBA Art. I §16(C) — first-showing date for Coming Soon badge.
  comingSoonDate?: string | null;
  activationDate?: string | null;
}

interface SaleRecord {
  id: string;
  mlsId: string;
  /** ACRIS rows: recorded document amount — NOT a verified unit sale price. */
  closePrice: number;
  // ACRIS recorded transfers carry no unit-level facts — null, never 0.
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  unit: string;
  closeDate: string | null;
  propertyType: string;
  office: string;
  source: string;
  label?: 'recorded-transfer';
  documentId?: string;
  bbl?: string;
  retrievedAt?: string;
}

interface BuildingData {
  success: boolean;
  building: {
    name: string | null;
    address: string;
    postalCode: string;
    yearBuilt: number | null;
    storiesTotal: number | null;
    totalUnits: number | null;
    commonInterest: string | null;
    ownershipType: string | null;
    amenities: string[];
    petPolicy: string[];
    view: string[];
    parking: {
      features: string[];
      garageSpaces: number | null;
      totalSpaces: number | null;
    };
    heating: string[];
    cooling: string[];
    associationFee: number | null;
    associationFeeFrequency: string | null;
    associationFeeIncludes: string[];
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
  gatedRecordsCount: number;
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
    description: `View all available listings, recorded transfer records, and building amenities at ${buildingLabel}. ${data?.stats?.totalActive || 0} active listings.`,
    openGraph: {
      title: `${buildingLabel} | Mallan Real Estate`,
      description: `Building details, available units, and recorded transfer records at ${buildingLabel}.`,
      images: [{ url: 'https://mallan.nyc/images/og-default.png', width: 1200, height: 630, alt: buildingLabel }],
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

  const { building, activeUnits, saleHistory, stats, gatedRecordsCount } = data;
  const buildingLabel = building.name || building.address;
  const hasDetailData = saleHistory.some((s) => !!s.sqft || !!s.beds);
  const saleUnits = activeUnits.filter((u) => u.listingType === 'sale');
  const rentalUnits = activeUnits.filter((u) => u.listingType === 'rent');
  const hasBuildingDetails = building.totalUnits || building.commonInterest || building.ownershipType;
  const hasParking = building.parking.features.length > 0 || building.parking.garageSpaces || building.parking.totalSpaces;
  const hasHvac = building.heating.length > 0 || building.cooling.length > 0;
  const hasFeeInfo = building.associationFee && building.associationFee > 0;
  const hasAnyData = activeUnits.length > 0 || saleHistory.length > 0 || building.amenities.length > 0 || building.yearBuilt || building.storiesTotal;

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
                <span className="text-brand-dark/60 text-[13px] ml-1.5">Avg. Asking Price</span>
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
            {building.totalUnits && (
              <>
                <div className="w-px h-8 bg-black/10" />
                <div className="px-4 md:px-6 py-2">
                  <span className="text-xl font-display font-bold text-brand-dark">{building.totalUnits}</span>
                  <span className="text-brand-dark/60 text-[13px] ml-1.5">Units</span>
                </div>
              </>
            )}
            {stats.totalSales > 0 && (
              <>
                <div className="w-px h-8 bg-black/10" />
                <div className="px-4 md:px-6 py-2">
                  <span className="text-xl font-display font-bold text-brand-dark">{stats.totalSales}</span>
                  <span className="text-brand-dark/60 text-[13px] ml-1.5">Recorded Transfers</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <main className="py-8 md:py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto space-y-10">

          {/* Available Units — Sales */}
          {saleUnits.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-brand-dark">
                  For Sale ({saleUnits.length})
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {saleUnits.map((unit) => (
                  <Link
                    key={unit.id}
                    href={`/listing/${unit.mlsId}`}
                    className="glass-card rounded-2xl overflow-hidden hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 group border border-black/[0.04]"
                  >
                    {/* Photo */}
                    <div className="relative aspect-[16/10] bg-gray-100">
                      {unit.photoUrl ? (
                        <Image
                          src={unit.photoUrl}
                          alt={`Unit ${unit.unit || ''} at ${buildingLabel}`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                        </div>
                      )}
                      {/* REBNY UCBA Art. I §16(C) — Coming Soon badge */}
                      <ComingSoonBadge
                        status={unit.status}
                        comingSoonDate={unit.comingSoonDate}
                        activationDate={unit.activationDate}
                        className="absolute top-2 left-2 bg-blue-600 text-white text-[12px] font-semibold px-2.5 py-1 rounded leading-tight max-w-[80%]"
                      />
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between mb-1.5">
                        <p className="text-lg font-display font-bold text-brand-dark">
                          {formatPrice(unit.listPrice)}
                        </p>
                        {unit.unit && (
                          <p className="text-[12px] text-brand-gold-deep font-medium mt-0.5">
                            Unit {unit.unit}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 text-[13px] text-brand-dark/70 mb-1">
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
                        <p className="text-[11px] text-brand-dark/50">{unit.propertyType}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>

              {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median.
                  Raised from 10px: this card's median = 13px, so 10px was below the compliance floor. */}
              <p className="text-[13px] text-brand-dark/55 mt-3">
                {saleUnits
                  .map((u) => u.office)
                  .filter((v, i, a) => v && a.indexOf(v) === i)
                  .map((office) => `Courtesy of ${office}`)
                  .join(' | ')}
              </p>
            </section>
          )}

          {/* Available Units — Rentals */}
          {rentalUnits.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-brand-dark">
                  For Rent ({rentalUnits.length})
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rentalUnits.map((unit) => (
                  <Link
                    key={unit.id}
                    href={`/listing/${unit.mlsId}`}
                    className="glass-card rounded-2xl overflow-hidden hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 group border border-black/[0.04]"
                  >
                    {/* Photo */}
                    <div className="relative aspect-[16/10] bg-gray-100">
                      {unit.photoUrl ? (
                        <Image
                          src={unit.photoUrl}
                          alt={`Unit ${unit.unit || ''} at ${buildingLabel}`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                        </div>
                      )}
                      <span className="absolute top-2.5 right-2.5 inline-flex items-center px-2.5 py-1 bg-purple-600 text-white text-[11px] font-semibold rounded-full uppercase tracking-wider shadow-sm">
                        Rental
                      </span>
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between mb-1.5">
                        <p className="text-lg font-display font-bold text-brand-dark">
                          {formatPrice(unit.listPrice)}<span className="text-[13px] font-normal text-brand-dark/50">/mo</span>
                        </p>
                        {unit.unit && (
                          <p className="text-[12px] text-brand-gold-deep font-medium mt-0.5">
                            Unit {unit.unit}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 text-[13px] text-brand-dark/70 mb-1">
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
                        <p className="text-[11px] text-brand-dark/50">{unit.propertyType}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>

              {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median.
                  Raised from 10px: this card's median = 13px, so 10px was below the compliance floor. */}
              <p className="text-[13px] text-brand-dark/55 mt-3">
                {rentalUnits
                  .map((u) => u.office)
                  .filter((v, i, a) => v && a.indexOf(v) === i)
                  .map((office) => `Courtesy of ${office}`)
                  .join(' | ')}
              </p>
            </section>
          )}

          {/* Building Details & Amenities */}
          {(building.amenities.length > 0 || hasBuildingDetails || hasParking || hasHvac || hasFeeInfo || building.view.length > 0) && (
            <section className="py-6 border-t border-black/[0.06]">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-brand-gold/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-brand-dark">Building Details</h2>
              </div>

              {/* Building Info Row */}
              {hasBuildingDetails && (
                <div className="flex flex-wrap gap-x-8 gap-y-2 mb-6 text-[13px]">
                  {building.ownershipType && (
                    <div>
                      <span className="text-brand-dark/50">Ownership:</span>{' '}
                      <span className="font-medium text-brand-dark">{building.ownershipType}</span>
                    </div>
                  )}
                  {building.commonInterest && (
                    <div>
                      <span className="text-brand-dark/50">Type:</span>{' '}
                      <span className="font-medium text-brand-dark">{building.commonInterest}</span>
                    </div>
                  )}
                  {building.totalUnits && (
                    <div>
                      <span className="text-brand-dark/50">Total Units:</span>{' '}
                      <span className="font-medium text-brand-dark">{building.totalUnits}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Amenities Grid */}
              {building.amenities.length > 0 && (
                <div className="mb-6">
                  <p className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider mb-3">Amenities</p>
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
                </div>
              )}

              {/* Detail Rows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-[13px]">
                {/* Pet Policy */}
                {building.petPolicy.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-brand-gold-deep mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
                    </svg>
                    <div>
                      <span className="text-brand-dark/50">Pets:</span>{' '}
                      <span className="font-medium text-brand-dark">{building.petPolicy.join(', ')}</span>
                    </div>
                  </div>
                )}

                {/* Parking */}
                {hasParking && (
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-brand-gold-deep mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                    </svg>
                    <div>
                      <span className="text-brand-dark/50">Parking:</span>{' '}
                      <span className="font-medium text-brand-dark">
                        {building.parking.features.join(', ')}
                        {building.parking.garageSpaces ? ` (${building.parking.garageSpaces} garage spaces)` : ''}
                      </span>
                    </div>
                  </div>
                )}

                {/* View */}
                {building.view.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-brand-gold-deep mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div>
                      <span className="text-brand-dark/50">Views:</span>{' '}
                      <span className="font-medium text-brand-dark">{building.view.join(', ')}</span>
                    </div>
                  </div>
                )}

                {/* Heating */}
                {building.heating.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-brand-gold-deep mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 6.51 6.51 0 009 4.5a4.97 4.97 0 01.656 2.426 3.75 3.75 0 002.115 2.455A3.75 3.75 0 0015.362 5.214z" />
                    </svg>
                    <div>
                      <span className="text-brand-dark/50">Heating:</span>{' '}
                      <span className="font-medium text-brand-dark">{building.heating.join(', ')}</span>
                    </div>
                  </div>
                )}

                {/* Cooling */}
                {building.cooling.length > 0 && (
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-brand-gold-deep mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                    </svg>
                    <div>
                      <span className="text-brand-dark/50">Cooling:</span>{' '}
                      <span className="font-medium text-brand-dark">{building.cooling.join(', ')}</span>
                    </div>
                  </div>
                )}

                {/* Association Fee */}
                {hasFeeInfo && (
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-brand-gold-deep mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <span className="text-brand-dark/50">HOA/Common Charges:</span>{' '}
                      <span className="font-medium text-brand-dark">
                        {formatPrice(building.associationFee!)}
                        {building.associationFeeFrequency ? `/${building.associationFeeFrequency.toLowerCase()}` : ''}
                      </span>
                      {building.associationFeeIncludes.length > 0 && (
                        <p className="text-brand-dark/50 text-[12px] mt-0.5">
                          Includes: {building.associationFeeIncludes.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* NYC Recorded Transfers (ACRIS public records) */}
          {saleHistory.length > 0 && (
            <section className="py-6 border-t border-black/[0.06]">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                </div>
                <h2 className="font-display text-xl font-bold text-brand-dark">
                  NYC Recorded Transfers ({saleHistory.length})
                </h2>
              </div>
              <p className="text-[13px] text-brand-dark/60 mb-4">NYC ACRIS public records — recorded transfer documents, not verified unit-level sales. Source: NYC ACRIS.</p>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-black/10">
                      <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">Recorded Date</th>
                      <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">Unit</th>
                      <th className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider pb-3 pr-4">Recorded Amount</th>
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
                            <td className="text-[13px] text-brand-dark/70 py-3.5 pr-4">{sale.beds ? sale.beds : '\u2014'}</td>
                            <td className="text-[13px] text-brand-dark/70 py-3.5 pr-4">{sale.baths ? sale.baths : '\u2014'}</td>
                            <td className="text-[13px] text-brand-dark/70 py-3.5 pr-4">{sale.sqft ? sale.sqft.toLocaleString() : '\u2014'}</td>
                            <td className="text-[13px] text-brand-dark/70 py-3.5 pr-4">
                              {sale.sqft && sale.closePrice > 0
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
                      {!!sale.beds && <span>{sale.beds} Bed{sale.beds !== 1 ? 's' : ''}</span>}
                      {!!sale.baths && <span>{sale.baths} Bath</span>}
                      {!!sale.sqft && <span>{sale.sqft.toLocaleString()} SF</span>}
                      {sale.propertyType && <span>{sale.propertyType}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* VOW Login Prompt — gated listings exist but require login */}
          {gatedRecordsCount > 0 && (
            <section className="py-6 border-t border-black/[0.06]">
              <div className="rounded-2xl border border-brand-gold/20 bg-brand-gold/[0.04] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-gold/15 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-brand-dark mb-0.5">
                    {gatedRecordsCount} additional listing{gatedRecordsCount !== 1 ? 's' : ''} available with sign-in
                  </p>
                  <p className="text-[13px] text-brand-dark/60">
                    Some listings in this building are only visible to registered users per REBNY RLS rules.
                  </p>
                </div>
                <Link
                  href="/about#contact"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm whitespace-nowrap"
                >
                  Contact Us
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              </div>
            </section>
          )}

          {/* Empty State — no listings, no history, no building info */}
          {!hasAnyData && (
            <section className="py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-bold text-brand-dark mb-2">No Data Available</h2>
              <p className="text-brand-dark/50 text-sm max-w-md mx-auto">
                We don&apos;t have any active listings or recorded transfer records for this building at this time.
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
          {hasAnyData && (
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
