'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useSidePanel } from '@/lib/contexts/ListingSidePanelContext';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import InquiryModal from '@/app/components/InquiryModal';

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
}

export default function ListingSidePanel() {
  const { activeListing, isOpen, closeListing } = useSidePanel();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [inquiryMode, setInquiryMode] = useState<'showing' | 'question' | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openShowingModal = useCallback(() => setInquiryMode('showing'), []);
  const openQuestionModal = useCallback(() => setInquiryMode('question'), []);
  const closeInquiryModal = useCallback(() => setInquiryMode(null), []);

  // Reset image index when a new listing opens
  useEffect(() => {
    if (activeListing) setActiveImageIndex(0);
  }, [activeListing]);

  // Focus trap: move focus into panel on open, restore on close
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement;

    // Move focus into panel
    const firstFocusable = panel.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();

    // Trap tab inside panel
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);

    return () => {
      document.removeEventListener('keydown', handleTab);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // GSAP stagger entrance for panel contents
  useEffect(() => {
    if (!isOpen || !activeListing) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const timer = setTimeout(async () => {
      const { gsap } = await import('gsap');
      const body = panelRef.current?.querySelector('[data-panel-body]');
      if (body) {
        gsap.from(body.children, {
          y: 30, opacity: 0, duration: 0.6,
          stagger: 0.04,
          ease: 'back.out(1.2)',
        });
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isOpen, activeListing]);

  if (!activeListing) return null;

  const listing = activeListing;
  const isRental = listing.listingType === 'rent';
  const listingAddress = [
    listing.address.streetNumber,
    listing.address.streetName,
    listing.address.unit ? `, ${listing.address.unit}` : '',
  ].join(' ').trim() || listing.address.neighborhoodDisplay;
  const images = listing.media.images.map(img => img.url);
  const currentImage = images[activeImageIndex] || images[0] || '/images/listing-placeholder.svg';
  const beds = listing.propertyInfo.bedroomsTotal;
  const baths = listing.propertyInfo.bathroomsFull;
  const halfBaths = listing.propertyInfo.bathroomsHalf;
  const sqft = listing.propertyInfo.aboveGradeFinishedArea;

  return (
    <>
      {/* Dim overlay */}
      <div
        className={`dim-overlay fixed inset-0 z-40 ${isOpen ? 'on' : ''}`}
        onClick={closeListing}
        aria-hidden="true"
      />

      {/* Side panel */}
      <div
        ref={panelRef}
        className={`side-panel fixed top-0 right-0 w-full md:w-[55%] lg:w-[45%] h-full z-50 overflow-y-auto ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Listing details for ${listing.address.neighborhoodDisplay}`}
      >
        {/* Glass header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 md:px-10 h-16"
          style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
        >
          <button
            onClick={closeListing}
            className="text-[13px] font-medium text-brand-dark/90 hover:text-brand-dark transition-all duration-500 flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex items-center gap-2.5">
            <button className="w-9 h-9 rounded-full glass-card flex items-center justify-center hover:scale-105 transition-transform duration-500" aria-label="Share listing">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
            <button className="w-9 h-9 rounded-full glass-card flex items-center justify-center hover:scale-105 transition-transform duration-500" aria-label="Save listing">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Panel body */}
        <div data-panel-body className="px-6 md:px-10 pb-20">
          {/* Main image + thumbnails */}
          <div className="mt-4 mb-8">
            <div className="overflow-hidden rounded-2xl aspect-[4/3] bg-gray-50 mb-3 relative">
              <Image
                src={currentImage}
                alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 45vw"
                priority
              />
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images.slice(0, 4).map((img, i) => (
                  <button
                    key={img}
                    onClick={() => setActiveImageIndex(i)}
                    className={`thumb relative w-full aspect-square rounded-xl overflow-hidden ${i === activeImageIndex ? 'active' : ''}`}
                    aria-label={`View image ${i + 1}`}
                  >
                    <Image
                      src={img}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="100px"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Listing info */}
          <p className="text-brand-dark/90 text-[13px] font-light mb-2">
            {listing.address.neighborhoodDisplay} &middot; {listing.propertyInfo.propertyType}
          </p>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight leading-tight text-brand-dark mb-1">
            {listing.address.neighborhoodDisplay}
          </h2>
          <p className="text-brand-dark/90 text-sm font-light mb-8">
            {listing.address.streetNumber} {listing.address.streetName}{listing.address.unit ? `, ${listing.address.unit}` : ''}
          </p>

          {/* Price */}
          <p className="font-display font-bold text-2xl md:text-3xl text-brand-dark mb-1">
            {formatPrice(listing.price.listPrice, isRental)}
          </p>
          <p className="text-brand-dark/85 text-[13px] font-light mb-10">
            {listing.price.pricePerSqft ? `$${listing.price.pricePerSqft}/sf \u00B7 ` : ''}
            {listing.listing.daysOnMarket} days on market
          </p>

          {/* Description */}
          {listing.description && (
            <p className="text-[15px] text-brand-dark/95 font-light leading-[1.9] mb-10">
              {listing.description}
            </p>
          )}

          {/* Specs — glass grid */}
          <div className="grid grid-cols-2 gap-3 mb-10">
            <div className="glass-card rounded-2xl p-4">
              <p className="text-brand-dark/85 text-[11px] font-medium mb-1">Beds</p>
              <p className="font-display font-bold text-lg text-brand-dark">{beds}</p>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <p className="text-brand-dark/85 text-[11px] font-medium mb-1">Baths</p>
              <p className="font-display font-bold text-lg text-brand-dark">{baths}{halfBaths > 0 ? `.${halfBaths}` : ''}</p>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <p className="text-brand-dark/85 text-[11px] font-medium mb-1">Size</p>
              <p className="font-display font-bold text-lg text-brand-dark">{sqft > 0 ? `${sqft.toLocaleString()} sf` : 'N/A'}</p>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <p className="text-brand-dark/85 text-[11px] font-medium mb-1">
                {listing.propertyInfo.propertyType === 'Co-op' ? 'Maint.' : isRental ? 'Rent' : 'CC'}
              </p>
              <p className="font-display font-bold text-lg text-brand-dark">
                {listing.nycSpecific.maintenanceFee ? `$${listing.nycSpecific.maintenanceFee.toLocaleString()}/mo` : 'N/A'}
              </p>
            </div>
          </div>

          {/* Features / Amenities */}
          {(() => {
            const b = listing.features.building;
            const amenities: string[] = [];
            if (b.doorman) amenities.push(b.doormanType ? `${b.doormanType} Doorman` : 'Doorman');
            if (b.concierge) amenities.push('Concierge');
            if (b.elevator) amenities.push('Elevator');
            if (b.gym) amenities.push('Fitness Center');
            if (b.pool) amenities.push('Pool');
            if (b.roofDeck) amenities.push('Roof Deck');
            if (b.garage) amenities.push('Garage');
            if (b.storage) amenities.push('Storage');
            if (b.laundryRoom) amenities.push('Laundry Room');
            if (b.bikeRoom) amenities.push('Bike Room');
            if (b.playroom) amenities.push('Playroom');
            if (amenities.length === 0) return null;
            return (
              <>
                <p className="text-[11px] font-semibold text-brand-dark/90 uppercase tracking-widest mb-4">Amenities</p>
                <div className="flex flex-wrap gap-2 mb-12">
                  {amenities.map((a) => (
                    <span key={a} className="text-[12px] font-medium text-brand-dark/95 glass-card rounded-full px-4 py-2">
                      {a}
                    </span>
                  ))}
                </div>
              </>
            );
          })()}

          {/* CTA buttons */}
          <button data-analytics-cta="panel_showing" onClick={openShowingModal} className="w-full btn-liquid bg-brand-dark text-white font-medium py-4 rounded-full text-sm mb-3">
            {isRental ? 'Schedule a Viewing' : 'Request a Showing'}
          </button>
          <button data-analytics-cta="panel_question" onClick={openQuestionModal} className="w-full btn-liquid glass-card text-brand-dark font-light py-4 rounded-full text-sm mb-12">
            Ask a Question
          </button>

          {/* Agent card — uses listing agent data, no hardcoded PII */}
          {listing.agent?.listOfficeName && (
            <div className="glass-card rounded-2xl p-6 flex items-center gap-5">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.12), rgba(184,134,11,0.04))', boxShadow: 'var(--gold-glow)' }}
              >
                <span className="font-display font-bold text-brand-gold-deep text-lg">
                  {(listing.agent.listAgentName || listing.agent.listOfficeName).slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-display font-semibold text-[15px] text-brand-dark">{listing.agent.listOfficeName}</p>
                {listing.agent.listOfficePhone && (
                  <p className="text-brand-dark/85 text-[12px] font-light">{listing.agent.listOfficePhone}</p>
                )}
              </div>
            </div>
          )}

          {/* REBNY attribution */}
          {listing.agent?.listOfficeName && (
            <p className="text-[10px] text-brand-dark/90 mt-6 font-light text-center">
              Listing Courtesy of {listing.agent.listOfficeName}
            </p>
          )}

          {/* IDX Disclaimer — REBNY compliance */}
          <IDXDisclaimer variant="compact" lastUpdated={new Date()} className="mt-8 text-center" />
        </div>
      </div>

      {/* Inquiry Modal */}
      <InquiryModal
        isOpen={inquiryMode !== null}
        onClose={closeInquiryModal}
        mode={inquiryMode || 'showing'}
        listingId={listing.id}
        listingAddress={listingAddress}
        isRental={isRental}
      />
    </>
  );
}
