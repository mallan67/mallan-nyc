/**
 * AuctionBanner — UCBA Art. I exception path UI (C3c).
 *
 * Server component. Renders an unmissable amber banner above the price
 * block on /listing/[id] when a listing is being sold via auction.
 *
 * Why this is prominent: UCBA Art. I treats auctions as the exception to
 * the 24-hour price-change rule (Art. I §6). The auction end date is
 * binding — bidding closes at that timestamp regardless of price/status
 * mechanics that govern non-auction listings — so it must be unmissable.
 *
 * Renders nothing (returns null) on non-auction listings. No empty div,
 * no hidden div — so non-auction listings show no false signal that an
 * auction is happening.
 *
 * The data shape comes from PublicListingDTO.auction (lib/idx/public-dto.ts),
 * which is itself sourced from the auction_yn / auction_type /
 * auction_start_date / auction_end_date / auction_terms_url columns added
 * to the Listing model in PR #50 and gated by validator AU-001..AU-005
 * (lib/compliance/rls-enforcement.ts) added in PR #57.
 *
 * @module app/components/AuctionBanner
 */

import type { AuctionPublic } from '@/lib/idx/public-dto';

/**
 * Format an auction end-date ISO string for human display.
 * Uses en-US locale so output matches the rest of the listing detail page.
 */
function formatAuctionEnd(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return `${dateStr} at ${timeStr}`;
}

/** Map the validator picklist values to user-friendly display labels. */
function auctionTypeLabel(type: AuctionPublic['type']): string {
  switch (type) {
    case 'Absolute':
      return 'Absolute Auction';
    case 'WithReserve':
      return 'Auction (Reserve)';
    case 'Minimum':
      return 'Auction (Minimum Bid)';
    default:
      // Defensive: validator AU-002 already restricts the picklist, but if
      // an unexpected value somehow reaches the page we still render
      // "Auction" rather than leaking the raw enum value.
      return 'Auction';
  }
}

interface AuctionBannerProps {
  auction: AuctionPublic | null | undefined;
}

/**
 * Defensive: only emit hrefs that parse as absolute http(s) URLs. The
 * validator (AU-006) and the DTO (`safeHttpUrl`) already reject unsafe
 * schemes at submit + serialization time; this is the third layer so a
 * `javascript:` / `data:` / etc. value can never become a live link
 * even if it slipped past the upstream gates somehow.
 */
function isSafeHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export default function AuctionBanner({ auction }: AuctionBannerProps) {
  // Negative test: auction missing or end date missing → render nothing.
  if (!auction || !auction.endDate) return null;

  const endLabel = formatAuctionEnd(auction.endDate);
  const typeLabel = auctionTypeLabel(auction.type);
  const safeTermsUrl =
    auction.termsUrl && isSafeHttpUrl(auction.termsUrl) ? auction.termsUrl : null;

  return (
    <div
      role="region"
      aria-label="Auction notice"
      className="mb-6 rounded-lg border-2 border-amber-500 bg-amber-50 px-5 py-4 text-amber-900"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-bold uppercase tracking-wide">
          {typeLabel}
        </span>
        <span className="text-sm font-medium">
          Bidding ends{' '}
          <span className="font-semibold">{endLabel}</span>
        </span>
        {safeTermsUrl ? (
          <a
            href={safeTermsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm font-semibold underline hover:text-amber-700"
          >
            View auction terms
          </a>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-amber-800">
        This property is being sold at auction. The auction end date is
        binding; standard listing rules around price changes do not apply
        (UCBA Art. I).
      </p>
    </div>
  );
}
