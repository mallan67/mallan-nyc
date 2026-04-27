import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import BackButton from '@/app/components/BackButton';
import BuildingViolations from '@/app/components/BuildingViolations';
import { ComingSoonBadge } from '@/app/components/ComingSoonBadge';

export const revalidate = 600;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    sn?: string; // streetNumber
    st?: string; // streetName
    z?: string;  // postalCode
    bn?: string; // buildingName
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

interface BuildingInfo {
  name: string | null;
  address: string;
  postalCode: string;
  yearBuilt: number | null;
  storiesTotal: number | null;
  totalUnits: number | null;
  commonInterest: string | null;
  ownershipType: string | null;
  structureType: string | null;
  newConstruction: boolean | null;
  taxAnnualAmount: number | null;
  amenities: string[];
  petPolicy: string[];
  view: string[];
  parking: { features: string[]; garageSpaces: number | null; totalSpaces: number | null };
  heating: string[];
  cooling: string[];
  flooring: string[];
  interiorFeatures: string[];
  appliances: string[];
  associationFee: number | null;
  associationFeeFrequency: string | null;
  associationFeeIncludes: string[];
}

interface BuildingData {
  success: boolean;
  building: BuildingInfo;
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
  _compliance: { source: string; attribution: string; disclaimerRequired: boolean };
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

  const sp = new URLSearchParams({
    streetNumber: params.streetNumber,
    streetName: params.streetName,
  });
  if (params.postalCode) sp.set('postalCode', params.postalCode);
  if (params.buildingName) sp.set('buildingName', params.buildingName);

  try {
    const res = await fetch(`${baseUrl}/api/buildings?${sp}`, { next: { revalidate: 600 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.success ? (data as BuildingData) : null;
  } catch {
    return null;
  }
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

/** Map raw Trestle enum values to human-readable NYC display labels */
function displayLabel(raw: string | null): string {
  if (!raw) return '';
  const map: Record<string, string> = {
    StockCooperative: 'Co-op',
    Condominium: 'Condo',
    Condop: 'Condop',
    RentalBuilding: 'Rental Building',
    HighRise: 'High Rise',
    MidRise: 'Mid Rise',
    LowRise: 'Low Rise',
    WalkUp: 'Walk-Up',
    Townhouse: 'Townhouse',
    MultiFamily: 'Multi-Family',
    SingleFamily: 'Single Family',
    Brownstone: 'Brownstone',
    PreWar: 'Pre-War',
    PostWar: 'Post-War',
    NewConstruction: 'New Construction',
    Apartment: 'Apartment',
  };
  return map[raw] || raw.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function AmenityIcon({ label }: { label: string }) {
  const icons: Record<string, string> = {
    Doorman: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    Elevator: 'M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 21m0 0L12 16.5m4.5 4.5V7.5',
    Gym: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
  };
  const d = icons[label] || 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z';
  return (
    <span className="text-brand-gold-deep">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </span>
  );
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  if (!sp.sn || !sp.st) return { title: 'Building | Mallan Real Estate' };

  const data = await fetchBuildingData({
    streetNumber: sp.sn, streetName: sp.st, postalCode: sp.z, buildingName: sp.bn,
  });

  const label = data?.building?.name || `${sp.sn} ${sp.st}`;
  const zip = sp.z ? `, ${sp.z}` : '';
  const activeCount = data?.stats?.totalActive || 0;
  const salesCount = data?.stats?.totalSales || 0;

  const canonicalParams = new URLSearchParams({ sn: sp.sn, st: sp.st });
  if (sp.z) canonicalParams.set('z', sp.z);
  if (sp.bn) canonicalParams.set('bn', sp.bn);

  return {
    title: `${label} — Units, Sales History & Amenities | Mallan Real Estate`,
    description: `Explore ${label} in New York, NY${zip}. ${activeCount} active listing${activeCount !== 1 ? 's' : ''}, ${salesCount} recent sale${salesCount !== 1 ? 's' : ''}. View building amenities, price history, and available units.`,
    alternates: { canonical: `https://mallan.nyc/buildings/profile?${canonicalParams.toString()}` },
    openGraph: {
      title: `${label} | Building Intelligence | Mallan Real Estate`,
      description: `Building profile for ${label}. Active listings, sales history, amenities, and market data.`,
      type: 'website',
      images: [{ url: 'https://mallan.nyc/images/og-default.png', width: 1200, height: 630, alt: label }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${label} | Mallan Real Estate`,
      images: ['https://mallan.nyc/images/og-default.png'],
    },
  };
}

export default async function BuildingSlugPage({ searchParams }: Props) {
  const sp = await searchParams;
  if (!sp.sn || !sp.st) notFound();

  const data = await fetchBuildingData({
    streetNumber: sp.sn, streetName: sp.st, postalCode: sp.z, buildingName: sp.bn,
  });
  if (!data) notFound();

  const { building, activeUnits, saleHistory, stats, gatedRecordsCount } = data;
  const buildingLabel = building.name || building.address;
  const hasDetailData = saleHistory.some((s) => s.sqft > 0 || s.beds > 0);
  // No hero photo — unit listing photos are not building exterior photos
  const buildingType = displayLabel(building.commonInterest) || displayLabel(building.ownershipType);
  const structure = displayLabel(building.structureType);
  const isCoop = building.commonInterest === 'StockCooperative' || building.ownershipType === 'Co-op';
  const saleUnits = activeUnits.filter((u) => u.listingType === 'sale');
  const rentalUnits = activeUnits.filter((u) => u.listingType === 'rent');
  const hasBuildingDetails = building.totalUnits || building.commonInterest || building.ownershipType || building.structureType || building.newConstruction || building.taxAnnualAmount;
  const hasParking = building.parking.features.length > 0 || building.parking.garageSpaces || building.parking.totalSpaces;
  const hasHvac = building.heating.length > 0 || building.cooling.length > 0;
  const hasInterior = building.flooring.length > 0 || building.interiorFeatures.length > 0 || building.appliances.length > 0;
  // Maintenance/common charges are per-unit, not shown at building level
  const hasAnyData = activeUnits.length > 0 || saleHistory.length > 0 || building.amenities.length > 0 || building.yearBuilt || building.storiesTotal || building.totalUnits || building.structureType || building.commonInterest;

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Residence',
    name: buildingLabel,
    address: {
      '@type': 'PostalAddress',
      streetAddress: building.address,
      addressLocality: 'New York',
      addressRegion: 'NY',
      postalCode: building.postalCode,
      addressCountry: 'US',
    },
    ...(building.yearBuilt ? { yearBuilt: building.yearBuilt } : {}),
    ...(building.storiesTotal ? { numberOfRooms: building.storiesTotal } : {}),
    ...(building.amenities.length > 0 ? {
      amenityFeature: building.amenities.map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
    } : {}),
  };

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Breadcrumb */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-black/5 pt-[68px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
          <nav className="flex items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
            <BackButton fallbackHref="/buy" />
            <Link href="/" className="text-brand-dark/60 hover:text-brand-gold transition-colors">Home</Link>
            <span className="text-brand-dark/30">/</span>
            <span className="text-brand-dark font-medium">{buildingLabel}</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-b from-[#1a1a1a] to-[#2a2a2a] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-brand-gold/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-white/50 uppercase tracking-[0.15em]">Building Intelligence</p>
          </div>
          <h1 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight mb-2">{buildingLabel}</h1>
          <p className="text-white/70 text-lg">
            {building.address}{building.postalCode && <>, New York, NY {building.postalCode}</>}
          </p>
          {/* Quick stats inline with display labels */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-sm">
            {building.yearBuilt && <span className="text-white/50">Built {building.yearBuilt}</span>}
            {building.storiesTotal && <span className="text-white/50">{building.storiesTotal} Stories</span>}
            {building.totalUnits && <span className="text-white/50">{building.totalUnits} Units</span>}
            {buildingType && <span className="text-white/50">{buildingType}</span>}
            {structure && <span className="text-white/50">{structure}</span>}
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-b border-black/5 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-0 py-4">
            {stats.totalActive > 0 && (
              <div className="px-4 md:px-6 py-2">
                <span className="text-xl font-display font-bold text-brand-dark">{stats.totalActive}</span>
                <span className="text-brand-dark/60 text-[13px] ml-1.5">Active</span>
              </div>
            )}
            {stats.avgPrice && (
              <>
                <div className="w-px h-8 bg-black/10" />
                <div className="px-4 md:px-6 py-2">
                  <span className="text-xl font-display font-bold text-brand-dark">{formatPrice(stats.avgPrice)}</span>
                  <span className="text-brand-dark/60 text-[13px] ml-1.5">Avg Price</span>
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

          {/* For Sale Units */}
          {saleUnits.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold text-brand-dark mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                  </svg>
                </span>
                For Sale ({saleUnits.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {saleUnits.map((unit) => (
                  <Link key={unit.id} href={`/listing/${unit.mlsId}`}
                    className="glass-card rounded-2xl overflow-hidden hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 group border border-black/[0.04]">
                    <div className="relative aspect-[16/10] bg-gray-100">
                      {unit.photoUrl ? (
                        <Image src={unit.photoUrl} alt={`Unit ${unit.unit || ''} at ${buildingLabel}`} fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" unoptimized />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
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
                        <p className="text-lg font-display font-bold text-brand-dark">{formatPrice(unit.listPrice)}</p>
                        {unit.unit && <p className="text-[12px] text-brand-gold-deep font-medium mt-0.5">Unit {unit.unit}</p>}
                      </div>
                      <div className="flex items-center gap-2.5 text-[13px] text-brand-dark/70 mb-1">
                        <span>{unit.beds} Bed{unit.beds !== 1 ? 's' : ''}</span>
                        <span className="text-brand-dark/20">&middot;</span>
                        <span>{unit.baths}{unit.bathsHalf > 0 ? `.${unit.bathsHalf}` : ''} Bath</span>
                        {unit.sqft > 0 && <><span className="text-brand-dark/20">&middot;</span><span>{unit.sqft.toLocaleString()} SF</span></>}
                      </div>
                      {unit.propertyType && <p className="text-[11px] text-brand-dark/50">{unit.propertyType}</p>}
                      {/* REBNY attribution per-card — UCBA Art. III §2(C): font not smaller than median */}
                      <p className="text-sm text-brand-dark/80 mt-2 truncate">
                        RLS · Listing Courtesy of {unit.office || 'listing broker'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* For Rent Units */}
          {rentalUnits.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold text-brand-dark mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                </span>
                For Rent ({rentalUnits.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rentalUnits.map((unit) => (
                  <Link key={unit.id} href={`/listing/${unit.mlsId}`}
                    className="glass-card rounded-2xl overflow-hidden hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 group border border-black/[0.04]">
                    <div className="relative aspect-[16/10] bg-gray-100">
                      {unit.photoUrl ? (
                        <Image src={unit.photoUrl} alt={`Unit ${unit.unit || ''} at ${buildingLabel}`} fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" unoptimized />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                        </div>
                      )}
                      <span className="absolute top-2.5 right-2.5 inline-flex items-center px-2.5 py-1 bg-purple-600 text-white text-[11px] font-semibold rounded-full uppercase tracking-wider shadow-sm">Rental</span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-1.5">
                        <p className="text-lg font-display font-bold text-brand-dark">{formatPrice(unit.listPrice)}<span className="text-[13px] font-normal text-brand-dark/50">/mo</span></p>
                        {unit.unit && <p className="text-[12px] text-brand-gold-deep font-medium mt-0.5">Unit {unit.unit}</p>}
                      </div>
                      <div className="flex items-center gap-2.5 text-[13px] text-brand-dark/70 mb-1">
                        <span>{unit.beds} Bed{unit.beds !== 1 ? 's' : ''}</span>
                        <span className="text-brand-dark/20">&middot;</span>
                        <span>{unit.baths}{unit.bathsHalf > 0 ? `.${unit.bathsHalf}` : ''} Bath</span>
                        {unit.sqft > 0 && <><span className="text-brand-dark/20">&middot;</span><span>{unit.sqft.toLocaleString()} SF</span></>}
                      </div>
                      {unit.propertyType && <p className="text-[11px] text-brand-dark/50">{unit.propertyType}</p>}
                      {/* REBNY attribution per-card — UCBA Art. III §2(C): font not smaller than median */}
                      <p className="text-sm text-brand-dark/80 mt-2 truncate">
                        RLS · Listing Courtesy of {unit.office || 'listing broker'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Building Details & Amenities */}
          {(building.amenities.length > 0 || hasBuildingDetails || hasParking || hasHvac || hasInterior || building.view.length > 0) && (
            <section className="py-6 border-t border-black/[0.06]">
              <h2 className="font-display text-xl font-bold text-brand-dark mb-6">Building Details</h2>
              {hasBuildingDetails && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
                  {buildingType && (
                    <div className="rounded-xl bg-[#F8F7F4] border border-black/[0.03] p-4">
                      <p className="text-[11px] text-brand-dark/50 uppercase tracking-wider mb-1">Type</p>
                      <p className="text-[14px] font-semibold text-brand-dark">{buildingType}</p>
                    </div>
                  )}
                  {structure && (
                    <div className="rounded-xl bg-[#F8F7F4] border border-black/[0.03] p-4">
                      <p className="text-[11px] text-brand-dark/50 uppercase tracking-wider mb-1">Structure</p>
                      <p className="text-[14px] font-semibold text-brand-dark">{structure}</p>
                    </div>
                  )}
                  {building.totalUnits && (
                    <div className="rounded-xl bg-[#F8F7F4] border border-black/[0.03] p-4">
                      <p className="text-[11px] text-brand-dark/50 uppercase tracking-wider mb-1">Total Units</p>
                      <p className="text-[14px] font-semibold text-brand-dark">{building.totalUnits}</p>
                    </div>
                  )}
                  {building.storiesTotal && (
                    <div className="rounded-xl bg-[#F8F7F4] border border-black/[0.03] p-4">
                      <p className="text-[11px] text-brand-dark/50 uppercase tracking-wider mb-1">Stories</p>
                      <p className="text-[14px] font-semibold text-brand-dark">{building.storiesTotal}</p>
                    </div>
                  )}
                  {building.yearBuilt && (
                    <div className="rounded-xl bg-[#F8F7F4] border border-black/[0.03] p-4">
                      <p className="text-[11px] text-brand-dark/50 uppercase tracking-wider mb-1">Year Built</p>
                      <p className="text-[14px] font-semibold text-brand-dark">{building.yearBuilt}</p>
                    </div>
                  )}
                  {building.ownershipType && (
                    <div className="rounded-xl bg-[#F8F7F4] border border-black/[0.03] p-4">
                      <p className="text-[11px] text-brand-dark/50 uppercase tracking-wider mb-1">Ownership</p>
                      <p className="text-[14px] font-semibold text-brand-dark">{building.ownershipType}</p>
                    </div>
                  )}
                  {building.newConstruction && (
                    <div className="rounded-xl bg-[#F8F7F4] border border-black/[0.03] p-4">
                      <p className="text-[11px] text-brand-dark/50 uppercase tracking-wider mb-1">Construction</p>
                      <p className="text-[14px] font-semibold text-brand-dark">New Construction</p>
                    </div>
                  )}
                  {building.taxAnnualAmount && building.taxAnnualAmount > 0 && (
                    <div className="rounded-xl bg-[#F8F7F4] border border-black/[0.03] p-4">
                      <p className="text-[11px] text-brand-dark/50 uppercase tracking-wider mb-1">Annual Tax</p>
                      <p className="text-[14px] font-semibold text-brand-dark">{formatPrice(building.taxAnnualAmount)}</p>
                    </div>
                  )}
                </div>
              )}
              {building.amenities.length > 0 && (
                <div className="mb-6">
                  <p className="text-[11px] font-semibold text-brand-dark/50 uppercase tracking-wider mb-3">Amenities</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {building.amenities.map((amenity) => (
                      <div key={amenity} className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#F8F7F4] border border-black/[0.03]">
                        <AmenityIcon label={amenity} />
                        <span className="text-[13px] font-medium text-brand-dark">{amenity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-[13px]">
                {building.petPolicy.length > 0 && (
                  <div><span className="text-brand-dark/50">Pets:</span> <span className="font-medium text-brand-dark">{building.petPolicy.join(', ')}</span></div>
                )}
                {hasParking && (
                  <div><span className="text-brand-dark/50">Parking:</span> <span className="font-medium text-brand-dark">{building.parking.features.join(', ')}{building.parking.garageSpaces ? ` (${building.parking.garageSpaces} spaces)` : ''}</span></div>
                )}
                {building.view.length > 0 && (
                  <div><span className="text-brand-dark/50">Views:</span> <span className="font-medium text-brand-dark">{building.view.join(', ')}</span></div>
                )}
                {building.heating.length > 0 && (
                  <div><span className="text-brand-dark/50">Heating:</span> <span className="font-medium text-brand-dark">{building.heating.join(', ')}</span></div>
                )}
                {building.cooling.length > 0 && (
                  <div><span className="text-brand-dark/50">Cooling:</span> <span className="font-medium text-brand-dark">{building.cooling.join(', ')}</span></div>
                )}
                {building.flooring.length > 0 && (
                  <div><span className="text-brand-dark/50">Flooring:</span> <span className="font-medium text-brand-dark">{building.flooring.join(', ')}</span></div>
                )}
                {building.interiorFeatures.length > 0 && (
                  <div><span className="text-brand-dark/50">Interior:</span> <span className="font-medium text-brand-dark">{building.interiorFeatures.join(', ')}</span></div>
                )}
                {building.appliances.length > 0 && (
                  <div><span className="text-brand-dark/50">Appliances:</span> <span className="font-medium text-brand-dark">{building.appliances.join(', ')}</span></div>
                )}
                {/* Maintenance/common charges are per-unit, not building-level — shown on individual listing pages */}
              </div>
            </section>
          )}

          {/* Sales History */}
          {saleHistory.length > 0 && (
            <section className="py-6 border-t border-black/[0.06]">
              <h2 className="font-display text-xl font-bold text-brand-dark mb-6">Sales History ({saleHistory.length})</h2>
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
                              {sale.sqft > 0 && sale.closePrice > 0 ? `$${Math.round(sale.closePrice / sale.sqft).toLocaleString()}` : '\u2014'}
                            </td>
                          </>
                        )}
                        <td className="text-[13px] text-brand-dark/50 py-3.5">{sale.propertyType || '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {saleHistory.map((sale) => (
                  <div key={sale.id} className="rounded-xl bg-[#F8F7F4] p-4 border border-black/[0.03]">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-[15px] font-display font-bold text-brand-dark">{formatPrice(sale.closePrice)}</p>
                        {sale.unit && <p className="text-[12px] text-brand-gold-deep font-medium">Unit {sale.unit}</p>}
                      </div>
                      <span className="text-[12px] text-brand-dark/50">{formatDate(sale.closeDate)}</span>
                    </div>
                    <div className="flex gap-3 text-[12px] text-brand-dark/60">
                      {sale.beds > 0 && <span>{sale.beds} Bed{sale.beds !== 1 ? 's' : ''}</span>}
                      {sale.baths > 0 && <span>{sale.baths} Bath</span>}
                      {sale.sqft > 0 && <span>{sale.sqft.toLocaleString()} SF</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Gated records */}
          {gatedRecordsCount > 0 && (
            <section className="py-6 border-t border-black/[0.06]">
              <div className="rounded-2xl border border-brand-gold/20 bg-brand-gold/[0.04] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-brand-dark mb-0.5">
                    {gatedRecordsCount} additional listing{gatedRecordsCount !== 1 ? 's' : ''} available with sign-in
                  </p>
                  <p className="text-[13px] text-brand-dark/60">
                    Some listings in this building are only visible to registered users per REBNY RLS rules.
                  </p>
                </div>
                <Link href="/about#contact" className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm whitespace-nowrap">
                  Contact Us
                </Link>
              </div>
            </section>
          )}

          {/* Empty state */}
          {!hasAnyData && (
            <section className="py-16 text-center">
              <h2 className="font-display text-xl font-bold text-brand-dark mb-2">No Data Available</h2>
              <p className="text-brand-dark/50 text-sm max-w-md mx-auto">
                We don&apos;t have any active listings or recent sales history for this building at this time.
              </p>
              <Link href="/buy" className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm">
                Browse All Listings
              </Link>
            </section>
          )}

          {/* Seller CTA — "Thinking of selling?" */}
          {hasAnyData && (
            <section className="py-8 border-t border-black/[0.06]">
              <div className="rounded-3xl overflow-hidden">
                {/* Seller-focused CTA */}
                <div className="bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] p-8 md:p-10">
                  <div className="grid md:grid-cols-2 gap-8 items-center">
                    <div>
                      <p className="text-brand-gold text-[11px] font-medium tracking-[0.2em] uppercase mb-3">For Owners</p>
                      <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-3">
                        Thinking of Selling in {buildingLabel}?
                      </h2>
                      <p className="text-white/60 text-sm leading-relaxed mb-2">
                        We know this building inside and out.
                        {stats.totalSales > 0 && ` With ${stats.totalSales} recent sale${stats.totalSales !== 1 ? 's' : ''} on record, `}
                        {stats.avgPrice && ` an average sale price of ${formatPrice(stats.avgPrice)}, `}
                        {' '}we can show you exactly where your unit stands in today&apos;s market.
                      </p>
                      <ul className="space-y-2 mt-4 mb-6">
                        <li className="flex items-center gap-2 text-white/70 text-[13px]">
                          <svg className="w-4 h-4 text-brand-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          Free Comparative Market Analysis
                        </li>
                        <li className="flex items-center gap-2 text-white/70 text-[13px]">
                          <svg className="w-4 h-4 text-brand-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          Building-specific sales history &amp; pricing data
                        </li>
                        <li className="flex items-center gap-2 text-white/70 text-[13px]">
                          <svg className="w-4 h-4 text-brand-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          Listed on 10+ platforms the moment you go live
                        </li>
                      </ul>
                      <div className="flex flex-wrap gap-3">
                        <Link href="/sell#valuation" className="px-6 py-3 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm">
                          Get Free Valuation
                        </Link>
                        <a href="tel:646-258-4460" className="px-6 py-3 border border-white/30 text-white font-medium rounded-full hover:bg-white/10 transition-colors text-sm">
                          Call (646) 258-4460
                        </a>
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-6">
                        <p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold mb-4">Your Listing Reaches</p>
                        <div className="space-y-3">
                          {[
                            { name: 'REBNY RLS', detail: '30,000+ NYC agents' },
                            { name: 'StreetEasy', detail: "NYC's #1 search" },
                            { name: 'Zillow + Trulia', detail: 'Most-visited nationally' },
                            { name: 'Realtor.com', detail: 'Official NAR site' },
                            { name: 'Redfin', detail: 'Tech-forward buyers' },
                            { name: 'mallan.nyc', detail: 'Featured listing' },
                          ].map((p) => (
                            <div key={p.name} className="flex items-center justify-between">
                              <span className="text-[13px] font-medium text-white/80">{p.name}</span>
                              <span className="text-[11px] text-white/40">{p.detail}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Buyer CTA */}
                <div className="bg-[#F8F7F4] p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display font-semibold text-brand-dark text-[15px]">Interested in buying at {buildingLabel}?</h3>
                    <p className="text-brand-dark/50 text-[13px]">Get expert guidance from our agents who know this building.</p>
                  </div>
                  <Link href="/about#contact" className="px-5 py-2.5 bg-brand-dark text-white font-medium rounded-full hover:bg-brand-dark/90 transition-colors text-sm whitespace-nowrap shrink-0">
                    Contact Us
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* ECB Violations — expandable, loads on click from NYC Open Data */}
          <BuildingViolations address={building.address} />

          <IDXDisclaimer />
        </div>
      </main>
    </div>
  );
}
