'use client';

import Link from 'next/link';
import IDXImage from '@/app/components/IDXImage';
import FavoriteButton from '@/app/components/FavoriteButton';
import FareActFeeBadge from '@/app/components/FareActFeeBadge';
import OpenHouseBanner from '@/app/components/OpenHouseBanner';
import { CardPhotoNav, CardPhotoCounter } from '@/app/components/CardPhotoNav';
import { type DisplayListing, listingHref, hasVirtualTour, hasVideo } from '@/lib/idx/display-adapter';
import { useCardPhotoCarousel } from '@/lib/hooks/useCardPhotoCarousel';
import type { CardSizeKey } from '@/lib/media/responsive-image';
import { formatBathrooms } from '@/lib/format/bathrooms';
import { shouldAutoCropWhiteBorder } from '@/lib/media/listing-card-media';

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * PR-FE.2 Option C (2026-05-15) — "Also listed by …" badge text.
 *
 * Returns null when this listing has no co-listed siblings on the
 * current response page. Otherwise returns a short string for the
 * supplementary badge rendered immediately below the primary REBNY
 * attribution line.
 *
 * The badge is INFORMATIONAL only — REBNY UCBA Art. III §2(C)
 * compliance is satisfied by the existing "RLS · Listing Courtesy of
 * {listOfficeName}" attribution above. The badge merely tells the
 * user that this physical property is co-listed by additional
 * brokerages — preventing the "looks like a duplicate / glitch"
 * confusion when the same apartment appears 3 times in search results
 * (typical NYC luxury new-development pattern).
 *
 * Format (Maya copy decision, 2026-05-15):
 *   - 1 sibling : "Additional listing source: {brokerage}"
 *   - 2 siblings: "Additional listing source: {brokerage} + 1 other"
 *   - N siblings: "Additional listing source: {brokerage} + {N-1} others"
 *   - count > 0 but no brokerage names: "Multiple listing sources"
 *
 * "Additional listing source" was preferred over "Also listed by" to
 * stay legally neutral — it explains the visual duplication without
 * implying co-brokerage, partnership, or any agency relationship
 * between the listing brokerages. Each row's primary attribution
 * ("RLS · Listing Courtesy of {brokerage}") remains the
 * UCBA Art. III §2(C) compliant attribution; this badge is
 * supplementary context only.
 */
function formatCoListedBadge(listing: DisplayListing): string | null {
  const count = listing._coListedCount;
  if (!count || count <= 0) return null;
  const brokerages = listing._coListedBrokerages ?? [];
  if (brokerages.length === 0) return 'Multiple listing sources';
  const first = brokerages[0];
  if (count === 1) return `Additional listing source: ${first}`;
  if (count === 2) return `Additional listing source: ${first} + 1 other`;
  return `Additional listing source: ${first} + ${count - 1} others`;
}

function formatComingSoonBadge(listing: DisplayListing): string | null {
  if (!listing._displayCompliance.comingSoon) return null;
  const date = listing._displayCompliance.comingSoonDate;
  if (date) {
    const formatted = new Date(date).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    return `Coming Soon. No Showings or Open House until ${formatted}`;
  }
  return 'Coming Soon. No Showings or Open House Permitted';
}

/** Small "3D Tour" indicator pill, rendered over the card photo. Keyed on the
 *  Property field `virtualTourURL` (see hasVirtualTour in display-adapter). */
function TourBadge({ compact = false, video = false }: { compact?: boolean; video?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 bg-black/55 backdrop-blur-sm text-white rounded-lg ${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-1'}`}
      aria-label={video ? 'Video available' : '3D tour available'}
    >
      <svg className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9" />
      </svg>
      {video ? 'Video' : '3D Tour'}
    </span>
  );
}

interface CardProps {
  listing: DisplayListing;
  isRental: boolean;
  isHighlighted?: boolean;
  onHover?: (id: string | null) => void;
  /**
   * Above-the-fold hint. Passed by the search page for the first row of
   * results so those photos load eagerly instead of waiting on the lazy
   * loader; every other card stays lazy. See `IDXImage`'s `priority`.
   */
  priority?: boolean;
  /**
   * Which measured size profile this card occupies. GridCard serves two
   * different layouts — the 2-col all-listings grid and the 3-col grid
   * view — which render at materially different widths (501px vs 326px
   * at 1024). One profile could not cover both without over-declaring
   * the narrower one by up to 1.67x, so the caller states which.
   */
  sizeProfile?: CardSizeKey;
}

/** Grid card — standard card with photo on top */
export function GridCard({ listing, isRental, isHighlighted, onHover, priority = false, sizeProfile = 'grid' }: CardProps) {
  const carousel = useCardPhotoCarousel(listing.media);

  return (
    // Non-interactive wrapper (2026-07-31). This was previously a single
    // <a> wrapping the whole card, which put the carousel <button>s and
    // FavoriteButton INSIDE an anchor — invalid per the HTML content
    // model ("no interactive content descendant") and a real a11y
    // problem: the buttons inherited link semantics in the accessibility
    // tree. The card is now a plain container with two explicit links,
    // matching the structure SplitCard already used.
    //
    // Block-level is still load-bearing — as an inline <a> the card grew
    // to the photo's max-content (1920 px source) and overflowed the
    // mobile viewport (583 px at 390 px wide). A <div> is block by
    // default, so the original `block` class is no longer needed. See
    // docs/mobile-search-card-overflow-audit-2026-05-17.md §E (F1).
    <div
      className={`glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group ${
        isHighlighted ? 'ring-2 ring-brand-gold shadow-lg' : ''
      }`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div
        className="relative overflow-hidden touch-pan-y"
        onTouchStart={carousel.swipe.onTouchStart}
        onTouchMove={carousel.swipe.onTouchMove}
        onTouchEnd={carousel.swipe.onTouchEnd}
      >
        {/* Photo is a link so clicking the image still opens the listing.
            aria-hidden + tabIndex=-1 keep it out of the a11y tree and tab
            order, so the card exposes exactly ONE listing link (the info
            block below, which carries the address) instead of two
            duplicates. `onClick` cancels the navigation that would
            otherwise fire at the end of a swipe. */}
        <Link
          href={listingHref(listing)}
          className="block"
          onClick={carousel.swipe.cancelIfSwiping}
          aria-hidden="true"
          tabIndex={-1}
        >
          <IDXImage
            src={carousel.currentSrc}
            alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
            aspect="card"
            sizeProfile={sizeProfile}
            priority={priority}
            className="group-hover:scale-105 transition-transform duration-700"
            onError={carousel.handlePhotoError}
            autoCropWhiteBorder={shouldAutoCropWhiteBorder(listing._source)}
          />
        </Link>
        {formatComingSoonBadge(listing) ? (
          <span className="absolute top-3 left-3 px-3 py-1 bg-amber-500 text-white text-xs rounded-xl z-10">
            {formatComingSoonBadge(listing)}
          </span>
        ) : (
          <div className="absolute top-3 left-3 z-10">
            <FavoriteButton listing={listing} />
          </div>
        )}
        {(carousel.count > 0 || hasVirtualTour(listing) || hasVideo(listing)) && (
          <div className="absolute top-3 right-3 flex gap-1.5 z-10">
            {(hasVirtualTour(listing) || hasVideo(listing)) && <TourBadge video={!hasVirtualTour(listing)} />}
            {/* Was a static total ("12"). Now the live position ("3/12")
                so the badge reflects the carousel the user can actually
                drive. Falls back to the bare count for single-photo cards. */}
            <CardPhotoCounter carousel={carousel} withIcon showSingle className="text-[11px] px-2 py-1 !rounded-lg" />
          </div>
        )}
        {/* Arrows are siblings of the photo link, never descendants. */}
        <CardPhotoNav carousel={carousel} size="md" />
        <OpenHouseBanner openHouse={listing.nextOpenHouse} className="absolute bottom-3 left-3 z-10" />
      </div>
      {/* The card's ONE real listing link: keyboard-reachable, carries the
          address, and is what Enter activates. */}
      <Link
        href={listingHref(listing)}
        className="block p-4 sm:p-5"
        onClick={carousel.swipe.cancelIfSwiping}
      >
        <p className="text-2xl font-display font-bold text-brand-dark">
          {formatPrice(listing.listPrice, isRental)}
        </p>
        <div className="flex gap-3 text-[15px] text-brand-dark/90 mt-1.5">
          <span>{listing.bedroomsTotal} Bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
          <span className="text-brand-dark/30">&middot;</span>
          <span>{formatBathrooms(listing.bathroomsFull, listing.bathroomsHalf)} Bath</span>
          {listing.livingArea && listing.livingArea > 0 && (
            <>
              <span className="text-brand-dark/30">&middot;</span>
              <span>{listing.livingArea.toLocaleString()} SF</span>
            </>
          )}
        </div>
        <p className="text-[15px] text-brand-dark mt-2">
          {listing.address.streetName === 'Address Undisclosed' ? (
            <span className="italic text-brand-dark/85">Address Undisclosed</span>
          ) : (
            <>{listing.address.streetNumber} {listing.address.streetName}{listing.address.unitNumber && `, ${listing.address.unitNumber}`}</>
          )}
        </p>
        <p className="text-sm text-brand-dark/70 mt-0.5">
          {listing.propertyType && <>{listing.propertyType}</>}
          {listing.address.neighborhood && listing.address.neighborhood !== listing.address.borough
            ? <>{listing.propertyType ? ' · ' : ''}{listing.address.neighborhood}, {listing.address.borough}</>
            : <>{listing.propertyType ? ' · ' : ''}{listing.address.borough}</>}
        </p>
        {!isRental && listing.associationFee && (
          <p className="text-sm text-brand-dark/70 mt-1">
            {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
          </p>
        )}
        {isRental && listing.moveInCosts && (
          <p className="text-sm text-brand-dark/70 mt-1">Move-In: {listing.moveInCosts}</p>
        )}
        {isRental && (
          <FareActFeeBadge
            moveInCosts={listing.moveInCosts}
            tenantPaysDescription={listing.tenantPaysDescription}
            className="mt-1"
          />
        )}
        {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median — median of
            always-rendered text elements in this card = 14px (tristle gate 2026-06-10); size pinned, lightened to /70. */}
        <p className="text-sm text-brand-dark/70 mt-2">
          {listing._source === 'exclusive'
            ? (listing._displayCompliance?.attributionText || 'Mallan Real Estate Inc.')
            : `RLS · Listing Courtesy of ${listing.listOfficeName || 'listing broker'}`}
        </p>
        {formatCoListedBadge(listing) && (
          // PR-FE.2 Option C — co-listed siblings badge. See
          // formatCoListedBadge at the top of this file for the text
          // rules. Rendered as a small pill below the REBNY attribution
          // so the primary "Listing Courtesy of {brokerage}" text stays
          // dominant (UCBA Art. III §2(C) compliance preserved). The
          // span is inline-block + gold accent so it visually reads
          // as supplementary info, not as another listing's
          // attribution.
          <p className="mt-1.5">
            <span className="inline-block text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold-deep ring-1 ring-brand-gold/30">
              {formatCoListedBadge(listing)}
            </span>
          </p>
        )}
      </Link>
    </div>
  );
}

/** List card — horizontal layout */
export function ListCard({ listing, isRental, isHighlighted, onHover, priority = false }: CardProps) {
  const carousel = useCardPhotoCarousel(listing.media);

  return (
    // Non-interactive wrapper — see the note on GridCard. Carousel
    // buttons and FavoriteButton must not be anchor descendants.
    <div
      className={`glass-card rounded-2xl overflow-hidden hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300 flex group ${
        isHighlighted ? 'ring-2 ring-brand-gold shadow-lg' : ''
      }`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div
        className="relative w-48 sm:w-64 flex-shrink-0 overflow-hidden touch-pan-y"
        onTouchStart={carousel.swipe.onTouchStart}
        onTouchMove={carousel.swipe.onTouchMove}
        onTouchEnd={carousel.swipe.onTouchEnd}
      >
        <Link
          href={listingHref(listing)}
          className="block"
          onClick={carousel.swipe.cancelIfSwiping}
          aria-hidden="true"
          tabIndex={-1}
        >
          <IDXImage
            src={carousel.currentSrc}
            alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
            aspect="card"
            sizeProfile="list"
            priority={priority}
            className="group-hover:scale-105 transition-transform duration-700"
            onError={carousel.handlePhotoError}
            autoCropWhiteBorder={shouldAutoCropWhiteBorder(listing._source)}
          />
        </Link>
        {formatComingSoonBadge(listing) ? (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-amber-500 text-white text-xs rounded-lg z-10">
            {formatComingSoonBadge(listing)}
          </span>
        ) : (
          <div className="absolute top-2 left-2 z-10">
            <FavoriteButton listing={listing} />
          </div>
        )}
        {(hasVirtualTour(listing) || hasVideo(listing)) && (
          <div className="absolute top-2 right-2 z-10"><TourBadge compact video={!hasVirtualTour(listing)} /></div>
        )}
        <CardPhotoCounter
          carousel={carousel}
          className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0.5 z-10"
        />
        <CardPhotoNav carousel={carousel} size="sm" />
        <OpenHouseBanner openHouse={listing.nextOpenHouse} className="absolute bottom-2 left-2 z-10" />
      </div>
      <Link
        href={listingHref(listing)}
        className="block p-4 flex-1 min-w-0"
        onClick={carousel.swipe.cancelIfSwiping}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xl font-display font-bold text-brand-dark">
              {formatPrice(listing.listPrice, isRental)}
            </p>
            <div className="flex gap-3 text-[15px] text-brand-dark/90 mt-1">
              <span>{listing.bedroomsTotal} Bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
              <span className="text-brand-dark/30">&middot;</span>
              <span>{formatBathrooms(listing.bathroomsFull, listing.bathroomsHalf)} Bath</span>
              {listing.livingArea && listing.livingArea > 0 && (
                <>
                  <span className="text-brand-dark/30">&middot;</span>
                  <span>{listing.livingArea.toLocaleString()} SF</span>
                </>
              )}
            </div>
            <p className="text-[15px] text-brand-dark truncate mt-1.5">
              {listing.address.streetName === 'Address Undisclosed' ? (
                <span className="italic text-brand-dark/85">Address Undisclosed</span>
              ) : (
                <>{listing.address.streetNumber} {listing.address.streetName}{listing.address.unitNumber && `, ${listing.address.unitNumber}`}</>
              )}
            </p>
            <p className="text-sm text-brand-dark/70 mt-0.5">
              {listing.propertyType && <>{listing.propertyType}</>}
              {listing.address.neighborhood && listing.address.neighborhood !== listing.address.borough
                ? <>{listing.propertyType ? ' · ' : ''}{listing.address.neighborhood}, {listing.address.borough}</>
                : <>{listing.propertyType ? ' · ' : ''}{listing.address.borough}</>}
            </p>
          </div>
          {listing.propertySubType && (
            <span className="text-xs px-2 py-1 bg-gray-100 text-brand-dark rounded-lg flex-shrink-0">
              {listing.propertySubType}
            </span>
          )}
        </div>
        {!isRental && listing.associationFee && (
          <p className="text-sm text-brand-dark/70 mt-1">
            {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
          </p>
        )}
        {isRental && listing.moveInCosts && (
          <p className="text-sm text-brand-dark/70 mt-1">Move-In: {listing.moveInCosts}</p>
        )}
        {isRental && (
          <FareActFeeBadge
            moveInCosts={listing.moveInCosts}
            tenantPaysDescription={listing.tenantPaysDescription}
            className="mt-1"
          />
        )}
        {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median — median of
            always-rendered text elements in this card = 14px (tristle gate 2026-06-10); size pinned, lightened to /70. */}
        <p className="text-sm text-brand-dark/70 mt-2">
          {listing._source === 'exclusive'
            ? (listing._displayCompliance?.attributionText || 'Mallan Real Estate Inc.')
            : `RLS · Listing Courtesy of ${listing.listOfficeName || 'listing broker'}`}
        </p>
        {formatCoListedBadge(listing) && (
          // PR-FE.2 Option C — co-listed siblings badge. See
          // formatCoListedBadge at the top of this file for the text
          // rules. Rendered as a small pill below the REBNY attribution
          // so the primary "Listing Courtesy of {brokerage}" text stays
          // dominant (UCBA Art. III §2(C) compliance preserved). The
          // span is inline-block + gold accent so it visually reads
          // as supplementary info, not as another listing's
          // attribution.
          <p className="mt-1.5">
            <span className="inline-block text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold-deep ring-1 ring-brand-gold/30">
              {formatCoListedBadge(listing)}
            </span>
          </p>
        )}
      </Link>
    </div>
  );
}

/** Split-view card — compact card for 2-col grid with photo carousel + touch swipe */
export function SplitCard({ listing, isRental, isHighlighted, onHover, priority = false }: CardProps) {
  // Same hook as GridCard/ListCard — this card's former inline
  // implementation is what the hook was extracted from, so behavior here
  // is unchanged apart from the hover reveal moving to CSS.
  const carousel = useCardPhotoCarousel(listing.media);

  return (
    <div
      className={`group glass-card rounded-xl overflow-hidden hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition-all duration-300 ${
        isHighlighted ? 'ring-2 ring-brand-gold shadow-lg' : ''
      }`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Photo with carousel + touch swipe */}
      <div
        className="relative overflow-hidden touch-pan-y"
        onTouchStart={carousel.swipe.onTouchStart}
        onTouchMove={carousel.swipe.onTouchMove}
        onTouchEnd={carousel.swipe.onTouchEnd}
      >
        {/* aria-hidden + tabIndex=-1: the info link below is the card's
            single keyboard-reachable listing link, same as Grid/List. */}
        <Link
          href={listingHref(listing)}
          className="block w-full"
          onClick={carousel.swipe.cancelIfSwiping}
          aria-hidden="true"
          tabIndex={-1}
        >
          <IDXImage
            src={carousel.currentSrc}
            alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
            aspect="wide"
            sizeProfile="split"
            priority={priority}
            // Hover zoom moved from a `hovered` useState to `group-hover`
            // so the card carries no state that CSS can express — same
            // visual result, one fewer re-render per pointer enter/leave.
            className="transition-transform duration-500 group-hover:scale-105"
            onError={carousel.handlePhotoError}
            autoCropWhiteBorder={shouldAutoCropWhiteBorder(listing._source)}
          />
        </Link>
        {formatComingSoonBadge(listing) && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-amber-500 text-white text-[9px] rounded-md z-10">
            {formatComingSoonBadge(listing)}
          </span>
        )}
        {/* Open house (mutually exclusive with Coming Soon — ComingSoon is excluded from open houses). */}
        <OpenHouseBanner openHouse={listing.nextOpenHouse} className="absolute top-1.5 left-1.5 z-10 !text-[9px] !px-1.5 !py-0.5" />
        <div className="absolute top-1.5 right-1.5 z-10">
          <FavoriteButton listing={listing} size="sm" />
        </div>
        {/* Photo position badge */}
        <CardPhotoCounter
          carousel={carousel}
          className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0.5 z-10"
        />
        {(hasVirtualTour(listing) || hasVideo(listing)) && (
          <div className="absolute bottom-1.5 left-1.5 z-10"><TourBadge compact video={!hasVirtualTour(listing)} /></div>
        )}
        {/* Photo nav arrows + dots — shared with GridCard/ListCard */}
        <CardPhotoNav carousel={carousel} size="sm" />
      </div>
      {/* Info */}
      <Link href={listingHref(listing)} className="block px-3.5 py-3">
        <p className="text-lg font-display font-bold text-brand-dark">
          {formatPrice(listing.listPrice, isRental)}
        </p>
        <div className="flex gap-2 text-sm text-brand-dark/90 mt-1">
          <span>{listing.bedroomsTotal} Bed{listing.bedroomsTotal !== 1 ? 's' : ''}</span>
          <span className="text-brand-dark/30">&middot;</span>
          <span>{formatBathrooms(listing.bathroomsFull, listing.bathroomsHalf)} Bath</span>
          {listing.livingArea && listing.livingArea > 0 && (
            <>
              <span className="text-brand-dark/30">&middot;</span>
              <span>{listing.livingArea.toLocaleString()} SF</span>
            </>
          )}
        </div>
        <p className="text-sm text-brand-dark truncate mt-1.5">
          {listing.address.streetName === 'Address Undisclosed'
            ? 'Address Undisclosed'
            : `${listing.address.streetNumber} ${listing.address.streetName}${listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}`}
        </p>
        <p className="text-[13px] text-brand-dark/70 truncate mt-0.5">
          {listing.propertyType && <>{listing.propertyType}</>}
          {listing.address.neighborhood && listing.address.neighborhood !== listing.address.borough
            ? <>{listing.propertyType ? ' · ' : ''}{listing.address.neighborhood}, {listing.address.borough || 'Manhattan'}</>
            : <>{listing.propertyType ? ' · ' : ''}{listing.address.borough || 'Manhattan'}</>}
        </p>
        {!isRental && listing.associationFee && (
          <p className="text-[13px] text-brand-dark/70 mt-0.5">
            {listing.propertyType === 'Co-op' ? 'Maint' : 'CC'}: ${listing.associationFee.toLocaleString()}/mo
          </p>
        )}
        {isRental && listing.moveInCosts && (
          <p className="text-[13px] text-brand-dark/70 mt-0.5">Move-In: {listing.moveInCosts}</p>
        )}
        {/* REBNY attribution — UCBA Art. III §2(C): font not smaller than median — median of
            always-rendered text elements in this SplitCard = 14px (tristle gate 2026-06-10); size pinned. */}
        <p className="text-sm text-brand-dark/60 mt-2">
          {listing._source === 'exclusive'
            ? (listing._displayCompliance?.attributionText || 'Mallan Real Estate Inc.')
            : `RLS · Listing Courtesy of ${listing.listOfficeName || 'listing broker'}`}
        </p>
        {formatCoListedBadge(listing) && (
          // PR-FE.2 Option C — co-listed siblings badge. See
          // formatCoListedBadge at the top of this file for the text
          // rules. Rendered as a small pill below the REBNY attribution
          // so the primary "Listing Courtesy of {brokerage}" text stays
          // dominant (UCBA Art. III §2(C) compliance preserved). The
          // span is inline-block + gold accent so it visually reads
          // as supplementary info, not as another listing's
          // attribution.
          <p className="mt-1.5">
            <span className="inline-block text-[11px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold-deep ring-1 ring-brand-gold/30">
              {formatCoListedBadge(listing)}
            </span>
          </p>
        )}
      </Link>
    </div>
  );
}
