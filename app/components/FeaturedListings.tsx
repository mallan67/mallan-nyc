'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import { ComingSoonBadge } from '@/app/components/ComingSoonBadge';
import OpenHouseBanner from '@/app/components/OpenHouseBanner';
import type { NextOpenHouse } from '@/lib/open-houses/upcoming-open-houses';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';
import { useSwipe } from '@/lib/hooks/useSwipe';
import {
  LISTING_PLACEHOLDER_IMAGE,
  getValidPhotoMedia,
} from '@/lib/media/listing-card-media';
import { buildFeaturedListingMedia, type FeaturedListingMedia } from '@/lib/media/featured-listing-media';
import { toEmbedUrl } from '@/lib/media/embed-url';
import { formatBathrooms } from '@/lib/format/bathrooms';
import {
  orderFeaturedListings,
  filterFeaturedDisplayable,
  collectDisplayableFeatured,
  featuredBadgeFor,
  featuredCardHref,
  isPinnedFeatured,
  buildExclusiveFeaturedParams,
} from '@/lib/featured/featured-ordering';

interface FeaturedListing {
  id: string;
  mlsId: string;
  /**
   * Raw RLS/Trestle key or internal SL-/RL- prefix. On the public DTO `id`
   * already carries listing_id for DB rows, but the field is surfaced
   * explicitly so a broker can pin by ANY of id / mlsId / listing_id and the
   * match still resolves. Optional — Trestle-direct rows may omit it.
   */
  listing_id?: string;
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
  /** Host-split playable video from the DTO (UCBA Art. I §5(C) unbranded-preferred). */
  videoUrl?: string;
  /** Host-split interactive 3D tour from the DTO. */
  virtualTourURL?: string;
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
  /** Upcoming public open house for the card banner (populated by /api/listings). */
  nextOpenHouse?: NextOpenHouse;
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

/**
 * Featured-card media surface.
 *
 * DOM CONTRACT (the hydration fix): NO interactive control may be a descendant
 * of an <a>. Previously `ListingCard` wrapped this entire gallery -- buttons and
 * all -- in a Next `Link`. A <button> inside an <a> is invalid HTML; React
 * reports an invalid-nesting hydration error and the client component never
 * finishes hydrating, which is why photos, video and 3D all disappeared at once
 * rather than one media type failing.
 *
 * The link now covers ONLY the non-interactive photo area, and every control is
 * a sibling of it. The warning is not suppressed -- the structure is corrected.
 */
function PhotoGallery({
  media,
  alt,
  href,
}: {
  media: FeaturedListingMedia;
  alt: string;
  href: string;
}) {
  const [idx, setIdx] = useState(0);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(new Set());
  const [overlay, setOverlay] = useState<null | 'video' | '3d'>(null);

  const validPhotos = media.photos.filter((m) => !failedPhotoUrls.has(String(m.url)));
  const images = validPhotos.length > 0
    ? validPhotos
    : [{ url: LISTING_PLACEHOLDER_IMAGE, order: 0 }];
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

  const hasControls = media.hasVideo || media.hasVirtualTour;
  const isHostedVideo = (u: string) => /youtube\.com|youtu\.be|vimeo\.com|wistia\.com/.test(u);

  return (
    <div className="relative">
      <div
        className="relative overflow-hidden aspect-[4/3] bg-gray-100 touch-pan-y"
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        {/* Link wraps ONLY the passive photo surface -- never a control. */}
        <Link href={href} className="block cursor-pointer group" aria-label={alt}>
          <IDXImage
            src={currentSrc}
            alt={alt}
            aspect="card"
            sizeProfile="grid"
            onError={handlePhotoError}
          />
        </Link>

        {/* Controls are SIBLINGS of the link, never descendants. */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goPrev(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition z-20"
              aria-label="Previous photo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goNext(); }}
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

        {/* Video / 3D player -- rendered ONLY once opened (no eager iframe, no
            autoplay) and mounted outside every Link. */}
        {overlay && (
          <div className="absolute inset-0 z-40 bg-black">
            {overlay === 'video' && media.videoUrl && (
              isHostedVideo(media.videoUrl) ? (
                <iframe
                  src={toEmbedUrl(media.videoUrl)}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Video tour"
                />
              ) : (
                <video src={media.videoUrl} className="absolute inset-0 w-full h-full object-contain" controls playsInline preload="metadata" title="Video tour" />
              )
            )}
            {overlay === '3d' && media.virtualTourUrl && (
              <iframe
                src={toEmbedUrl(media.virtualTourUrl)}
                className="absolute inset-0 w-full h-full"
                allow="fullscreen; xr-spatial-tracking"
                allowFullScreen
                title="3D tour"
              />
            )}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOverlay(null); }}
              className="absolute top-2 right-2 z-50 px-3 py-1.5 rounded-full bg-white/90 text-brand-dark text-[12px] font-medium hover:bg-white"
              aria-label="Close media and return to photos"
            >
              Back to photos
            </button>
          </div>
        )}
      </div>

      {/* Media-type row -- discoverable without paging through every photo.
          Only controls backed by REAL media are rendered; no disabled tabs. */}
      {hasControls && !overlay && (
        <div className="flex items-center gap-2 px-3 py-2 text-[12px] border-t border-black/5 bg-white">
          <span className="text-brand-dark/70">Photos {media.photoCount}</span>
          {media.hasVideo && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOverlay('video'); }}
              className="px-2 py-0.5 rounded border border-black/10 hover:bg-black/5 transition"
            >
              Video
            </button>
          )}
          {media.hasVirtualTour && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOverlay('3d'); }}
              className="px-2 py-0.5 rounded border border-black/10 hover:bg-black/5 transition"
            >
              3D Tour
            </button>
          )}
        </div>
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

function ListingCard({ listing, pinned }: { listing: FeaturedListing; pinned?: boolean }) {
  const isRental = listing.listingType === 'rent';
  // Full media model — photos PLUS video and 3D. The old path ran
  // getValidPhotoMedia() here and again inside PhotoGallery, stripping Video,
  // VirtualTour and FloorPlan before the gallery ever saw them, so Cotality
  // video/3D could never render. getValidPhotoMedia stays unchanged; it is
  // correctly scoped to photo-only hero selection and is still used elsewhere.
  const media = buildFeaturedListingMedia(listing);
  // Single badge: Mallan-owned exclusives → "Mallan Exclusive" (accurate
  // tooltip, never an RLS/syndication claim); pinned third-party IDX/RLS →
  // "Featured". Mallan-owned wins, so a pinned exclusive shows ONE badge.
  const badge = featuredBadgeFor(listing, !!pinned);
  const [calcOpen, setCalcOpen] = useState(false);

  const cc = listing.monthlyCommonCharges || listing.monthlyMaintenance;

  return (
    <div className="prop-card rounded-3xl overflow-hidden bg-white relative">
      {badge && (
        <span
          // bg-brand-slate (#3d4556) — same color as the Open House banner, white text. Replaces
          // the gold badge (white-on-gold failed WCAG contrast ~2.5:1 per PageSpeed). The Open House
          // banner itself is unchanged. (2026-06-25)
          className="absolute top-4 left-4 z-30 bg-brand-slate text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm"
          title={badge.title}
        >
          {badge.text}
        </span>
      )}
      {/* REBNY UCBA Art. I §16(C) — Coming Soon listings must show this exact badge */}
      <ComingSoonBadge
        status={listing.status}
        comingSoonDate={listing.comingSoonDate}
        activationDate={listing.activationDate}
        className="absolute top-4 right-4 z-30 bg-blue-600 text-white text-[12px] font-semibold px-2.5 py-1 rounded leading-tight max-w-[60%]"
      />
      {/* NO outer Link here. The gallery owns its own link over the passive
          photo surface only; wrapping the whole gallery put <button> controls
          inside an <a>, which is invalid DOM and broke hydration outright. */}
      <div className="relative">
        <PhotoGallery
          media={media}
          href={featuredCardHref(listing)}
          alt={`Photo of ${listing.address.streetNumber} ${listing.address.streetName}`.trim()}
        />
        {/* Open-house banner — bottom-left of the photo, clear of the gold badge (top-left), the
            Coming Soon badge (top-right), the title (below), and the photo counter (bottom-right). */}
        <OpenHouseBanner openHouse={listing.nextOpenHouse} className="absolute bottom-3 left-3 z-30 pointer-events-none" />
      </div>

      <div className="p-5 md:p-6">
        <Link href={featuredCardHref(listing)} className="block cursor-pointer">
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
          {/* Attribution: CRM exclusives show Mallan; RLS shows brokerage courtesy.
              UCBA Art. III §2(C): font not smaller than median — median of always-rendered
              text elements in this card = 13px (tristle gate 2026-06-10), so 13px is the floor. */}
          <p className="text-[13px] text-brand-dark/60 mt-2">
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

        // Build the base query params from config (limit is applied per page).
        const params = new URLSearchParams();
        params.set('type', filters.type === 'rent' ? 'rent' : 'sale');
        params.set('excludeUndisclosed', 'true');
        params.set('sort', config.sort || 'price-desc');
        // Coming Soon Layer 1 — Featured excludes ONLY Coming Soon (no-showings
        // inventory shouldn't headline the homepage); Active AND
        // ActiveUnderContract stay eligible (the latter is part of the normal
        // public display set, incl. pinned under-contract listings — Codex #366).
        // Per-request param; does NOT change global search status policy. The
        // client-side `filterFeaturedDisplayable` is the authoritative gate
        // (it also drops photoless cards the API can't filter).
        params.set('statuses', 'Active,ActiveUnderContract');
        if (filters.minPrice) params.set('minPrice', String(filters.minPrice));
        if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice));
        if (filters.minBeds) params.set('beds', String(filters.minBeds));
        if (filters.boroughs.length === 1) params.set('borough', filters.boroughs[0]);
        if (filters.neighborhoods.length === 1) params.set('neighborhood', filters.neighborhoods[0]);

        // Exclusives feed (Mallan-owned) — small, single fetch, kicked off in
        // parallel; awaited before the general loop so the stop condition can
        // account for exclusive-vs-general dedupe collapse.
        // Mallan exclusives must headline Featured regardless of the generic
        // homepage curation filters (minBeds/minPrice/borough/neighborhood) — see
        // buildExclusiveFeaturedParams. The GENERAL feed below KEEPS those filters,
        // so third-party studios stay excluded; and /api/listings?exclusive=mallan
        // restricts to true Mallan (SL-/RL-/website-only) rows, so this feed can
        // never admit a third-party studio. (2026-06-23)
        const exclParams = buildExclusiveFeaturedParams(params);
        const exclPromise = fetch(`/api/listings?${exclParams.toString()}`)
          .then((r) => (r.ok ? r.json() : { listings: [] }))
          .catch(() => ({ listings: [] }));
        const exclData = await exclPromise;
        const exclusives: FeaturedListing[] = filterFeaturedDisplayable<FeaturedListing>(exclData.listings || []);

        // General feed — page DEEPER until the ORDERED grid is full. The newest
        // listings disproportionately lack media coverage (the listing_media
        // backfill gap), so a single page can leave the section short (5 cards
        // instead of 6). The stop predicate runs the REAL ordering and checks the
        // post-dedupe count ≥ limit — not the raw collected length — because
        // orderFeaturedListings can collapse SEVERAL general rows against one
        // Mallan exclusive's address, so a raw count could still under-fill
        // (Codex #368). Capture `_lastUpdated` from page 0 for the IDX disclaimer.
        // (Interim fill-fix until coverage backfill.)
        const pageSize = Math.max(limit * 8, 48);
        let firstLastUpdated: string | undefined;
        const generalListings = await collectDisplayableFeatured<FeaturedListing>(
          async (skip, size) => {
            const pageParams = new URLSearchParams(params.toString());
            pageParams.set('skip', String(skip));
            pageParams.set('limit', String(size));
            const r = await fetch(`/api/listings?${pageParams.toString()}`);
            if (!r.ok) return [];
            const d = await r.json();
            if (skip === 0 && d._lastUpdated) firstLastUpdated = d._lastUpdated as string;
            return (d.listings || []) as FeaturedListing[];
          },
          {
            enough: (collected) =>
              orderFeaturedListings(exclusives, collected, pinnedSet, limit).length >= limit,
            pageSize,
            maxPages: 5,
          },
        );

        if (cancelled || (generalListings.length === 0 && exclusives.length === 0)) return;

        // Order: (1) ALL Mallan-owned exclusives first by classification/source
        // (not by pinnedIds), (2) pinned third-party listings, (3) regular
        // listings. Dedupe by id + canonical address so a CRM exclusive
        // collapses its RLS/IDX twin and nothing renders twice. generalListings
        // is already filtered to displayable by collectDisplayableFeatured.
        const featured = orderFeaturedListings(exclusives, generalListings, pinnedSet, limit);

        if (!cancelled) {
          setListings(featured);
          setPinnedIds(pinnedSet);
          if (firstLastUpdated) setLastUpdated(new Date(firstLastUpdated));
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
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">Featured Listings</h2>
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
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">Featured Listings</h2>
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
              pinned={isPinnedFeatured(listing, pinnedIds)}
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
