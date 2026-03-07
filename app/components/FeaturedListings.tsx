'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import { isDisplayableInIDX } from '@/lib/compliance/idx-display-gate';
import { useSidePanel } from '@/lib/contexts/ListingSidePanelContext';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';
import { useSwipe } from '@/lib/hooks/useSwipe';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';

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

type MediaTab = 'photos' | 'floorplan' | 'video' | '3d';

function MediaTabBar({ active, onSelect, listing }: { active: MediaTab; onSelect: (t: MediaTab) => void; listing: Listing }) {
  const tabs: { key: MediaTab; label: string; available: boolean; icon: JSX.Element }[] = [
    {
      key: 'photos', label: 'Photos', available: listing.media.images.length > 0,
      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
      key: 'floorplan', label: 'Floor Plan', available: !!listing.media.floorPlanUrl,
      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" /></svg>,
    },
    {
      key: 'video', label: 'Video', available: !!listing.media.videoUrl,
      icon: <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>,
    },
    {
      key: '3d', label: '3D', available: !!listing.media.virtualTourUrl,
      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>,
    },
  ];

  const availableTabs = tabs.filter(t => t.available);

  if (availableTabs.length <= 1) return null;

  return (
    <div className="flex gap-1 px-4 py-2 bg-black/5">
      {availableTabs.map((tab) => (
        <button
          key={tab.key}
          onClick={(e) => { e.stopPropagation(); onSelect(tab.key); }}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all ${
            active === tab.key
              ? 'bg-brand-dark text-white'
              : 'text-brand-dark/85 hover:bg-black/5'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PhotoGallery({ listing }: { listing: Listing }) {
  const [idx, setIdx] = useState(0);
  const images = listing.media.images;
  const img = images[idx] || images[0];

  const goPrev = useCallback(() => setIdx(i => i === 0 ? images.length - 1 : i - 1), [images.length]);
  const goNext = useCallback(() => setIdx(i => i === images.length - 1 ? 0 : i + 1), [images.length]);
  const swipe = useSwipe(goNext, goPrev);

  return (
    <div
      className="relative overflow-hidden aspect-[4/3] bg-gray-50 touch-pan-y"
      onTouchStart={swipe.onTouchStart}
      onTouchMove={swipe.onTouchMove}
      onTouchEnd={swipe.onTouchEnd}
    >
      <IDXImage
        src={img?.url || '/images/listing-placeholder.svg'}
        alt={img?.caption || 'Listing photo'}
        aspect="card"
      />
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition z-20"
            aria-label="Previous photo"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition z-20"
            aria-label="Next photo"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-20">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-white w-4' : 'bg-white/50'}`}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>
          <span className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded-lg z-20">
            {idx + 1}/{images.length}
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

  // NYC closing costs estimate
  const transferTax = price > 500000 ? price * 0.01825 : price * 0.014;
  const attorneyFee = 3500;
  const titleInsurance = price * 0.005;
  const totalClosing = Math.round(transferTax + attorneyFee + titleInsurance);

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[10px] text-brand-dark/90 uppercase tracking-wide">Down %</label>
          <input
            type="range" min={5} max={50} value={downPct}
            onChange={(e) => setDownPct(Number(e.target.value))}
            className="w-full accent-brand-gold h-1"
          />
          <span className="text-[11px] text-brand-dark/90 font-medium">{downPct}% (${(downPayment / 1000).toFixed(0)}K)</span>
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-brand-dark/90 uppercase tracking-wide">Rate %</label>
          <input
            type="range" min={3} max={10} step={0.25} value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="w-full accent-brand-gold h-1"
          />
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
      <div className="text-[10px] text-brand-dark/90 space-y-0.5">
        <p>Transfer tax: ${transferTax.toLocaleString(undefined, { maximumFractionDigits: 0 })} | Attorney: ${attorneyFee.toLocaleString()} | Title: ${titleInsurance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
      </div>
    </div>
  );
}

function RentVsBuyCalc({ monthlyRent }: { monthlyRent: number }) {
  const annualRent = monthlyRent * 12;
  const fiveYearRent = annualRent * 5;
  // Equivalent purchase price (price-to-rent ratio ~20x in NYC)
  const equivalentBuy = Math.round(annualRent * 20);
  // Estimated monthly mortgage for equivalent purchase
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
        <span className="text-brand-dark/85">Mortgage for equivalent</span>
        <span className="text-brand-dark/95 font-medium">${monthlyMortgage.toLocaleString()}/mo</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-brand-dark/85">{monthlySavings > 0 ? 'Renting saves' : 'Buying saves'}</span>
        <span className={`font-medium ${monthlySavings > 0 ? 'text-green-600' : 'text-brand-gold-deep'}`}>${Math.abs(monthlySavings).toLocaleString()}/mo</span>
      </div>
    </div>
  );
}

function ListingCard({ listing }: { listing: Listing }) {
  const { openListing } = useSidePanel();
  const isRental = listing.listingType === 'rent';
  const beds = listing.propertyInfo.bedroomsTotal;
  const baths = listing.propertyInfo.bathroomsFull;
  const halfBaths = listing.propertyInfo.bathroomsHalf;
  const sqft = listing.propertyInfo.aboveGradeFinishedArea;

  const [mediaTab, setMediaTab] = useState<MediaTab>('photos');
  const [calcOpen, setCalcOpen] = useState(false);

  return (
    <div className="prop-card rounded-3xl overflow-hidden bg-white">
      {/* Media area */}
      <div
        className="cursor-pointer group"
        onClick={() => openListing(listing)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openListing(listing); } }}
        aria-label={`View details for ${listing.address.neighborhoodDisplay} listing at ${formatPrice(listing.price.listPrice, isRental)}`}
      >
        {mediaTab === 'photos' && (
          <div className="relative">
            <PhotoGallery listing={listing} />
            {listing.flags.isExclusive && (
              <span className="absolute top-4 left-4 glass-card text-brand-dark text-[11px] font-medium px-3.5 py-1.5 rounded-full z-10">
                Exclusive
              </span>
            )}
            {listing.flags.isNewListing && !listing.flags.isExclusive && (
              <span className="absolute top-4 left-4 glass-card text-brand-dark text-[11px] font-medium px-3.5 py-1.5 rounded-full z-10">
                New
              </span>
            )}
          </div>
        )}

        {mediaTab === 'floorplan' && listing.media.floorPlanUrl && (
          <div className="relative overflow-hidden aspect-[4/3] bg-gray-50">
            <IDXImage src={listing.media.floorPlanUrl} alt="Floor Plan" aspect="card" />
            <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[11px] px-3 py-1 rounded-lg z-10">Floor Plan</span>
          </div>
        )}

        {mediaTab === 'video' && listing.media.videoUrl && (
          <div className="relative aspect-[4/3] bg-black" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={listing.media.videoUrl}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Video Tour"
            />
          </div>
        )}

        {mediaTab === '3d' && listing.media.virtualTourUrl && (
          <div className="relative aspect-[4/3] bg-black" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={listing.media.virtualTourUrl}
              className="absolute inset-0 w-full h-full"
              allow="fullscreen"
              title="3D Virtual Tour"
            />
          </div>
        )}
      </div>

      {/* Media tab bar */}
      <MediaTabBar active={mediaTab} onSelect={setMediaTab} listing={listing} />

      {/* Card body */}
      <div className="p-5 md:p-6">
        <div
          className="cursor-pointer"
          onClick={() => openListing(listing)}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3 className="font-display font-semibold text-base md:text-[17px] truncate text-brand-dark">
                {listing.address.neighborhoodDisplay}
              </h3>
              <p className="text-brand-dark/90 text-[13px] font-light">
                {listing.propertyInfo.propertyType}
              </p>
            </div>
            <p className="font-display font-bold text-base md:text-lg whitespace-nowrap text-brand-dark">
              {formatPrice(listing.price.listPrice, isRental)}
            </p>
          </div>
          <p className="text-brand-dark/90 text-[13px] font-light">
            {beds} bd &middot; {baths}{halfBaths > 0 ? `.${halfBaths}` : ''} ba
            {sqft > 0 && ` \u00B7 ${sqft.toLocaleString()} sf`}
          </p>
          {!isRental && listing.nycSpecific.maintenanceFee && (
            <p className="text-brand-dark/85 text-[12px] font-light mt-1">
              {listing.propertyInfo.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.nycSpecific.maintenanceFee.toLocaleString()}/mo
            </p>
          )}
          {listing.agent?.listOfficeName && (
            <p className="text-[10px] text-brand-dark/85 mt-1.5 font-light">
              Listing Courtesy of {listing.agent.listOfficeName}
            </p>
          )}
        </div>

        {/* Calculator toggle */}
        <div className="mt-3 pt-3 border-t border-black/5">
          <button
            onClick={(e) => { e.stopPropagation(); setCalcOpen(!calcOpen); }}
            className="flex items-center justify-between w-full text-[12px] group/calc"
          >
            <span className="flex items-center gap-1.5 text-brand-dark/85 group-hover/calc:text-brand-dark transition-colors">
              <svg className="w-4 h-4 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {isRental ? 'Rent vs Buy Calculator' : 'Mortgage + Closing Costs'}
            </span>
            <svg className={`w-4 h-4 text-brand-dark/85 transition-transform ${calcOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {calcOpen && (
            <div className="mt-3 animate-in">
              {isRental ? (
                <RentVsBuyCalc monthlyRent={listing.price.listPrice} />
              ) : (
                <MortgageCalc price={listing.price.listPrice} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FeaturedListings() {
  const gridRef = useGsapReveal<HTMLDivElement>({ children: true, y: 50, scale: 0.97 });

  const listings = (listingsData.listings as unknown as Listing[])
    .filter((l) => l.status === 'active' && isDisplayableInIDX(l))
    .sort((a, b) => {
      if (a.flags.isFeatured && !b.flags.isFeatured) return -1;
      if (!a.flags.isFeatured && b.flags.isFeatured) return 1;
      if (a.flags.isExclusive && !b.flags.isExclusive) return -1;
      if (!a.flags.isExclusive && b.flags.isExclusive) return 1;
      return new Date(b.listing.listingDate).getTime() - new Date(a.listing.listingDate).getTime();
    })
    .slice(0, 6);

  // No listings to display — hide the section entirely
  if (listings.length === 0) return null;

  return (
    <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40">
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
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>

        <div className="mt-10 sm:mt-12 text-center sm:hidden">
          <Link href="/buy" className="text-[13px] font-light text-brand-dark/85 hover:text-brand-dark transition-all duration-500">
            View All &rarr;
          </Link>
        </div>

        <IDXDisclaimer variant="compact" lastUpdated={new Date()} />
      </div>
    </section>
  );
}
