'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import { ComingSoonBadge } from '@/app/components/ComingSoonBadge';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';
import { useSwipe } from '@/lib/hooks/useSwipe';
import {
  LISTING_PLACEHOLDER_IMAGE,
  getValidPhotoMedia,
} from '@/lib/media/listing-card-media';
import { formatBathrooms } from '@/lib/format/bathrooms';

interface FeaturedListing {
  id: string;
  mlsId: string;
  slug: string;
  status: string;
  listingType: 'sale' | 'rent';
  address: {
    streetNumber: string;
    streetName: string;
    unitNumber: string | null;
    neighborhood?: string;
    borough?: string;
    county?: string;
  };
  listPrice: number;
  propertyType: string;
  propertySubType: string | null;
  bedroomsTotal: number;
  bathroomsFull: number;
  bathroomsHalf: number;
  livingArea: number | null;
  listOfficeName: string;
  media: { url: string; mediaType: string; order: number }[];
  photosCount?: number;
  monthlyCommonCharges?: number;
  monthlyMaintenance?: number;
  /** UCBA Art. I §16(C) — first-showing date used in the Coming Soon badge. */
  comingSoonDate?: string | null;
  activationDate?: string | null;
  _attribution?: string;
  _source?: string;
  _displayCompliance?: { attributionText?: string };
  _lastUpdated?: string;
  /**
   * PR-FE.2 Option C (2026-05-15) — co-listed siblings annotation
   * propagated through the API. See lib/idx/public-dto.ts for the
   * field semantics. Optional; absent on single-source listings.
   */
  _coListedCount?: number;
  _coListedBrokerages?: string[];
}

interface FeaturedConfig {
  pinnedListingIds: string[];
  filters: {
    type: string;
    boroughs: string[];
    neighborhoods: string[];
    minPrice: number;
    maxPrice: number;
    minBeds: number;
  };
  sort: string;
  limit: number;
}

const DEFAULT_CONFIG: FeaturedConfig = {
  pinnedListingIds: [],
  filters: { type: 'sale', boroughs: ['Manhattan'], neighborhoods: [], minPrice: 500000, maxPrice: 0, minBeds: 1 },
  sort: 'newest',
  limit: 6,
};

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) {
    return `$${price.toLocaleString()}/mo`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function PhotoGallery({ photos, alt }: { photos: { url: string; mediaType: string; order?: number }[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(new Set());
  const validPhotos = getValidPhotoMedia(photos).filter((m) => !failedPhotoUrls.has(String(m.url)));
  const images = validPhotos.length > 0
    ? validPhotos
    : [{ url: LISTING_PLACEHOLDER_IMAGE, mediaType: 'Photo' }];
  const safeIdx = Math.min(idx, images.length - 1);
  const currentSrc = images[safeIdx]?.url || LISTING_PLACEHOLDER_IMAGE;

  const goPrev = useCallback(() => setIdx(i => i === 0 ? images.length - 1 : i - 1), [images.length]);
  const goNext = useCallback(() => setIdx(i => i === images.length - 1 ? 0 : i + 1), [images.length]);
  const swipe = useSwipe(goNext, goPrev);
  const handlePhotoError = useCallback(() => {
    if (currentSrc === LISTING_PLACEHOLDER_IMAGE) return;
    setFailedPhotoUrls(prev => new Set(prev).add(currentSrc));
    setIdx(0);
  }, [currentSrc]);

  return (
    <div
      className="relative overflow-hidden aspect-[4/3] bg-gray-100 touch-pan-y"
      onTouchStart={swipe.onTouchStart}
      onTouchMove={swipe.onTouchMove}
      onTouchEnd={swipe.onTouchEnd}
    >
      <IDXImage
        src={currentSrc}
        alt={alt}
        aspect="card"
        onError={handlePhotoError}
      />
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition z-20"
            aria-label="Previous photo"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition z-20"
            aria-label="Next photo"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <span className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg z-20">
            {safeIdx + 1}/{images.length}
          </span>
        </>
      )}
    </div>
  );
}

function MortgageCalc({ price }: { price: number }) {
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(6.5);

  const downPayment = price * (downPct / 100);
  const loanAmount = price - downPayment;
  const monthlyRate = rate / 100 / 12;
  const payments = 360;
  const monthly = monthlyRate > 0
    ? Math.round((loanAmount * monthlyRate * Math.pow(1 + monthlyRate, payments)) / (Math.pow(1 + monthlyRate, payments) - 1))
    : Math.round(loanAmount / payments);

  const transferTax = price > 500000 ? price * 0.01825 : price * 0.014;
  const attorneyFee = 3500;
  const titleInsurance = price * 0.005;
  const totalClosing = Math.round(transferTax + attorneyFee + titleInsurance);

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[10px] text-brand-dark/90 uppercase tracking-wide">Down %</label>
          <input type="range" min={5} max={50} value={downPct} onChange={(e) => setDownPct(Number(e.target.value))} className="w-full accent-brand-gold h-1" />
          <span className="text-[11px] text-brand-dark/90 font-medium">{downPct}% (${(downPayment / 1000).toFixed(0)}K)</span>
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-brand-dark/90 uppercase tracking-wide">Rate %</label>
          <input type="range" min={3} max={10} step={0.25} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full accent-brand-gold h-1" />
          <span className="text-[11px] text-brand-dark/90 font-medium">{rate}%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-brand-gold/10 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-brand-dark/90 uppercase">Monthly</p>
          <p className="font-display font-bold text-brand-dark">${monthly.toLocaleString()}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-brand-dark/90 uppercase">Closing Costs</p>
          <p className="font-display font-bold text-brand-dark">${(totalClosing / 1000).toFixed(0)}K</p>
        </div>
      </div>
    </div>
  );
}

function RentVsBuyCalc({ monthlyRent }: { monthlyRent: number }) {
  const annualRent = monthlyRent * 12;
  const fiveYearRent = annualRent * 5;
  const equivalentBuy = Math.round(annualRent * 20);
  const loanAmt = equivalentBuy * 0.8;
  const mr = 0.065 / 12;
  const monthlyMortgage = Math.round((loanAmt * mr * Math.pow(1 + mr, 360)) / (Math.pow(1 + mr, 360) - 1));
  const monthlySavings = monthlyMortgage - monthlyRent;

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-brand-gold/10 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-brand-dark/90 uppercase">5yr Rent Cost</p>
          <p className="font-display font-bold text-brand-dark">${(fiveYearRent / 1000).toFixed(0)}K</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-brand-dark/90 uppercase">Buy Equivalent</p>
          <p className="font-display font-bold text-brand-dark">${(equivalentBuy / 1000000).toFixed(1)}M</p>
        </div>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-brand-dark/85">{monthlySavings > 0 ? 'Renting saves' : 'Buying saves'}</span>
        <span className={`font-medium ${monthlySavings > 0 ? 'text-green-600' : 'text-brand-gold-deep'}`}>${Math.abs(monthlySavings).toLocaleString()}/mo</span>
      </div>
    </div>
  );
}

function ListingCard({ listing, isPinned }: { listing: FeaturedListing; isPinned?: boolean }) {
  const isRental = listing.listingType === 'rent';
  const photos = getValidPhotoMedia(listing.media).map((m) => ({
    url: String(m.url),
    mediaType: m.mediaType || 'Photo',
    order: m.order ?? undefined,
  }));
  const [calcOpen, setCalcOpen] = useState(false);

  const cc = listing.monthlyCommonCharges || listing.monthlyMaintenance;

  return (
    <div className="prop-card rounded-3xl overflow-hidden bg-white relative">
      {isPinned && (
        <span
          className="absolute top-4 left-4 z-30 bg-brand-gold text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm"
          title="Featured listing — listed on REBNY RLS and syndicated to all major platforms"
        >
          Featured
        </span>
      )}
      {/* REBNY UCBA Art. I §16(C) — Coming Soon listings must show this exact badge */}
      <ComingSoonBadge
        status={listing.status}
        comingSoonDate={listing.comingSoonDate}
        activationDate={listing.activationDate}
        className="absolute top-4 right-4 z-30 bg-blue-600 text-white text-[12px] font-semibold px-2.5 py-1 rounded leading-tight max-w-[60%]"
      />
      <Link href={`/listing/${listing.slug}?key=${encodeURIComponent(listing.mlsId || listing.id)}`} className="block cursor-pointer group">
        <PhotoGallery photos={photos} alt={`Photo of ${listing.address.streetNumber} ${listing.address.streetName}`.trim()} />
      </Link>

      <div className="p-5 md:p-6">
        <Link href={`/listing/${listing.slug}?key=${encodeURIComponent(listing.mlsId || listing.id)}`} className="block cursor-pointer">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-base md:text-[17px] truncate text-brand-dark">
                {listing.address.streetNumber} {listing.address.streetName}{listing.address.unitNumber ? `, #${listing.address.unitNumber}` : ''}
              </h3>
              <p className="text-brand-dark/90 text-[13px] font-light">
                {listing.propertySubType || listing.propertyType}{listing.address.neighborhood ? ` in ${listing.address.neighborhood}` : ''}
              </p>
            </div>
            <p className="font-display font-bold text-base md:text-lg whitespace-nowrap text-brand-dark">
              {formatPrice(listing.listPrice, isRental)}
            </p>
          </div>
          <p className="text-brand-dark/90 text-[13px] font-light">
            {listing.bedroomsTotal} bd &middot; {formatBathrooms(listing.bathroomsFull, listing.bathroomsHalf)} ba
            {listing.livingArea && listing.livingArea > 0 && ` \u00B7 ${listing.livingArea.toLocaleString()} sf`}
          </p>
          {!isRental && cc && cc > 0 && (
            <p className="text-brand-dark/85 text-[12px] font-light mt-1">
              CC: ${cc.toLocaleString()}/mo
            </p>
          )}
          {/* Attribution: CRM exclusives show Mallan; RLS shows brokerage courtesy */}
          <p className="text-base text-brand-dark/80 mt-2">
            {listing._source === 'exclusive'
              ? (listing._displayCompliance?.attributionText || 'Mallan Real Estate Inc.')
              : `RLS · Listing Courtesy of ${listing.listOfficeName || 'listing broker'}`}
          </p>
          {/* PR-FE.2 Option C — co-listed siblings badge, kept in sync
              with SearchListingCard's formatCoListedBadge variants. */}
          {listing._coListedCount && listing._coListedCount > 0 && (
            <p className="mt-1.5">
              <span className="inline-block text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold-deep ring-1 ring-brand-gold/30">
                {/* Copy aligned with formatCoListedBadge() in
                    SearchListingCard.tsx — "Additional listing source"
                    chosen for legal neutrality (no implication of
                    co-brokerage / partnership). */}
                {listing._coListedBrokerages && listing._coListedBrokerages.length > 0
                  ? (listing._coListedCount === 1
                      ? `Additional listing source: ${listing._coListedBrokerages[0]}`
                      : listing._coListedCount === 2
                        ? `Additional listing source: ${listing._coListedBrokerages[0]} + 1 other`
                        : `Additional listing source: ${listing._coListedBrokerages[0]} + ${listing._coListedCount - 1} others`)
                  : 'Multiple listing sources'}
              </span>
            </p>
          )}
        </Link>

        <div className="mt-3 pt-3 border-t border-black/5">
          <button
            onClick={() => setCalcOpen(!calcOpen)}
            className="flex items-center justify-between w-full text-[12px] group/calc"
          >
            <span className="flex items-center gap-1.5 text-brand-dark/85 group-hover/calc:text-brand-dark transition-colors">
              <svg className="w-4 h-4 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {isRental ? 'Rent vs Buy Calculator' : 'Mortgage + Closing Costs'}
            </span>
            <svg className={`w-4 h-4 text-brand-dark/85 transition-transform ${calcOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {calcOpen && (
            <div className="mt-3 animate-in">
              {isRental ? (
                <RentVsBuyCalc monthlyRent={listing.listPrice} />
              ) : (
                <MortgageCalc price={listing.listPrice} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-3xl overflow-hidden bg-white animate-pulse">
      <div className="aspect-[4/3] bg-gray-200" />
      <div className="p-5 md:p-6 space-y-3">
        <div className="flex justify-between">
          <div className="h-5 bg-gray-200 rounded w-32" />
          <div className="h-5 bg-gray-200 rounded w-20" />
        </div>
        <div className="h-4 bg-gray-200 rounded w-40" />
        <div className="h-3 bg-gray-200 rounded w-24" />
      </div>
    </div>
  );
}

export default function FeaturedListings() {
  const gridRef = useGsapReveal<HTMLDivElement>({ children: true, y: 50, scale: 0.97 });
  const [listings, setListings] = useState<FeaturedListing[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchFeatured() {
      try {
        // Load config from API (DB-backed) with static file fallback
        let config: FeaturedConfig = DEFAULT_CONFIG;
        try {
          const cfgRes = await fetch('/api/featured-config');
          if (cfgRes.ok) config = await cfgRes.json();
        } catch {
          // Use defaults
        }

        const { filters, pinnedListingIds, limit } = config;
        const pinnedSet = new Set(pinnedListingIds);

        // Build query params from config
        const params = new URLSearchParams();
        params.set('type', filters.type === 'rent' ? 'rent' : 'sale');
        params.set('limit', String(Math.max(limit * 3, 30)));
        params.set('excludeUndisclosed', 'true');
        params.set('sort', config.sort || 'price-desc');
        if (filters.minPrice) params.set('minPrice', String(filters.minPrice));
        if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice));
        if (filters.minBeds) params.set('beds', String(filters.minBeds));
        if (filters.boroughs.length === 1) params.set('borough', filters.boroughs[0]);
        if (filters.neighborhoods.length === 1) params.set('neighborhood', filters.neighborhoods[0]);

        const [res, exclRes] = await Promise.all([
          fetch(`/api/listings?${params.toString()}`),
          fetch(`/api/listings?type=${filters.type === 'rent' ? 'rent' : 'sale'}&exclusive=mallan&excludeUndisclosed=true&limit=12`),
        ]);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        const exclData = exclRes.ok ? await exclRes.json() : { listings: [] };

        const generalListings: FeaturedListing[] = data.listings || [];
        const exclusives: FeaturedListing[] = exclData.listings || [];

        if (cancelled || (generalListings.length === 0 && exclusives.length === 0)) return;

        const seenIds = new Set<string>();
        const merged: FeaturedListing[] = [];
        for (const l of exclusives) { if (!seenIds.has(l.id)) { seenIds.add(l.id); merged.push(l); } }
        const pinned = generalListings.filter(l => pinnedSet.has(l.id) || pinnedSet.has(l.mlsId));
        for (const l of pinned) { if (!seenIds.has(l.id)) { seenIds.add(l.id); merged.push(l); } }
        const rest = generalListings.filter(l => !pinnedSet.has(l.id) && !pinnedSet.has(l.mlsId));
        for (const l of rest) { if (!seenIds.has(l.id)) { seenIds.add(l.id); merged.push(l); } }

        const featured = merged.slice(0, limit);

        if (!cancelled) {
          setListings(featured);
          setPinnedIds(pinnedSet);
          if (data._lastUpdated) setLastUpdated(new Date(data._lastUpdated));
        }
      } catch {
        console.warn('[FeaturedListings] Failed to load featured listings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchFeatured();
    return () => { cancelled = true; };
  }, []);

  // Still loading — show skeletons
  if (loading) {
    return (
      <section className="px-6 md:px-12 lg:px-20 py-16 md:py-20 lg:py-24">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex items-end justify-between mb-12 md:mb-16">
            <div>
              <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Featured</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">Properties</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 md:gap-8">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        </div>
      </section>
    );
  }

  // No listings — hide the section
  if (listings.length === 0) return null;

  return (
    <section className="px-6 md:px-12 lg:px-20 py-16 md:py-20 lg:py-24">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex items-end justify-between mb-12 md:mb-16">
          <div>
            <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Featured</p>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">Properties</h2>
          </div>
          <Link href="/buy" className="text-[13px] font-light text-brand-dark/85 hover:text-brand-dark transition-all duration-500 hidden sm:block">
            View All &rarr;
          </Link>
        </div>

        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 md:gap-8">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              isPinned={pinnedIds.has(listing.id) || pinnedIds.has(listing.mlsId)}
            />
          ))}
        </div>

        <div className="mt-10 sm:mt-12 text-center sm:hidden">
          <Link href="/buy" className="text-[13px] font-light text-brand-dark/85 hover:text-brand-dark transition-all duration-500">
            View All &rarr;
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-black/5">
          {/* If server passes lastUpdated, use it; otherwise the component fetches /api/idx/watermark. Never synthesize render-time date (UCBA Art. VIII §4). */}
          <IDXDisclaimer variant="compact" lastUpdated={lastUpdated ?? undefined} />
        </div>
      </div>
    </section>
  );
}
