'use client';

/**
 * IDX Disclaimer Component
 *
 * COMPLIANCE CRITICAL:
 * This component renders required REBNY RLS attribution and disclaimers.
 * It MUST be displayed on all pages showing IDX/MLS listing data.
 *
 * Requirements per REBNY RLS Display Rules:
 * - Attribution to data source
 * - Last update timestamp (UCBA Art. VIII §4 — must reflect real refresh time)
 * - Equal housing opportunity notice
 * - Broker disclaimer
 *
 * Timestamp precedence:
 *   1. `lastUpdated` prop (ideal — server passes SyncState.last_watermark or listing.modification_timestamp)
 *   2. Client fetch of /api/idx/watermark (fallback when used in client components)
 *   3. Omitted from display (never synthesize a fake "now" date)
 */

import { useEffect, useState } from 'react';

interface IDXDisclaimerProps {
  /** Last data update timestamp */
  lastUpdated?: Date | string;
  /** Show compact version (footer) or full version (listing page) */
  variant?: 'compact' | 'full';
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format date for display
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Client-side fallback: fetch the real watermark from /api/idx/watermark.
 * Returns null until the fetch resolves — callers should render "updated regularly"
 * rather than a synthesized date during the loading window.
 */
function useIdxWatermarkFallback(enabled: boolean): Date | null {
  const [watermark, setWatermark] = useState<Date | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/idx/watermark', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.displayAt) return;
        const d = new Date(data.displayAt);
        if (!isNaN(d.getTime())) setWatermark(d);
      })
      .catch(() => { /* non-fatal; we simply won't show a date */ });
    return () => { cancelled = true; };
  }, [enabled]);
  return watermark;
}

/**
 * IDX Disclaimer and Attribution Component
 *
 * Displays required compliance text for IDX/MLS data display.
 *
 * REBNY compliance — UCBA Art. VIII §4 "Statistical Attribution": the "data last
 * updated" timestamp must reflect the actual data refresh time, not the render
 * time. Callers should pass `lastUpdated` from the server-side sync watermark
 * (SyncState.last_watermark or Listing.modification_timestamp). If the prop is
 * omitted we fall back to today's date — since idx-sync runs every 12 minutes,
 * today's date is a safe upper bound under normal operation, but passing a real
 * timestamp is strictly preferred (and eliminates SSR hydration mismatch).
 */
export default function IDXDisclaimer({
  lastUpdated,
  variant = 'compact',
  className = '',
}: IDXDisclaimerProps) {
  // Precedence: prop → client-fetch fallback → omit the date line.
  const fetchedWatermark = useIdxWatermarkFallback(!lastUpdated);
  const resolved = lastUpdated ?? fetchedWatermark;
  const timestamp = resolved ? formatDate(resolved) : null;

  if (variant === 'compact') {
    return (
      <div className={`text-xs text-gray-500 ${className}`}>
        <p>
          Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.
          {timestamp ? ` Data last updated: ${timestamp}.` : ' Data is updated continuously.'}
        </p>
        {/* Featured/Public Tier A P0 — NY DOS 19 NYCRR §175.25 requires the
            licensed brokerage's name to appear with real estate advertising.
            Featured Properties is real estate advertising. The full + search
            variants already include this line; the compact variant must too
            so each MLS-data-bearing surface carries its own attribution. */}
        <p className="mt-1">Mallan Real Estate Inc. — Licensed Real Estate Broker, New York State.</p>
        <p className="mt-1">Commission rates are not set by law and are fully negotiable.</p>
        <p className="mt-1">
          <span className="inline-flex items-center gap-1">
            <EqualHousingIcon className="w-3 h-3" />
            Equal Housing Opportunity
          </span>
        </p>
      </div>
    );
  }

  // Full variant for listing detail pages
  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
      <h4 className="text-sm font-medium text-gray-700 mb-2">
        Listing Information Disclaimer
      </h4>

      <div className="text-xs text-gray-600 space-y-2">
        <p>
          <strong>Data Source:</strong> Listing data provided by the Real Estate Board of New York
          (REBNY) Residential Listing Service (RLS).
        </p>

        <p>
          <strong>Last Updated:</strong> {timestamp ?? 'Updated continuously'}
        </p>

        <p>
          <strong>Accuracy:</strong> Based on information from the REBNY Listing Service
          {timestamp ? ` as of ${timestamp}` : ''}. Information is deemed reliable but not guaranteed.
          All measurements and square footages are approximate. Prospective buyers should
          verify all information independently.
        </p>

        <p>
          <strong>Broker Representation:</strong> Mallan Real Estate Inc. is a licensed
          real estate broker in New York State and a participant in the REBNY
          Residential Listing Service (RLS).
        </p>

        <p>
          <strong>Commission Disclosure:</strong> Commission rates are not set by law
          and are fully negotiable.
        </p>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
          <EqualHousingIcon className="w-5 h-5 text-gray-600" />
          <p className="text-gray-600">
            <strong>Equal Housing Opportunity:</strong> We are pledged to the letter and
            spirit of U.S. policy for the achievement of equal housing opportunity throughout
            the Nation.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Equal Housing Opportunity Icon
 */
function EqualHousingIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="Equal Housing Opportunity"
    >
      <path d="M12 3L2 12h3v9h14v-9h3L12 3zm0 2.84L18 11v8H6v-8l6-5.16z" />
      <path d="M9 14h6v2H9z" />
    </svg>
  );
}

/**
 * Inline disclaimer for search results
 *
 * REBNY COMPLIANCE: Includes brokerage name (NY DOS 175.25), data update timestamp,
 * statistical data disclaimer, and Equal Housing Opportunity notice.
 *
 * Pass `lastUpdated` from the server (e.g. SyncState.last_watermark) for an
 * accurate timestamp. Omitted = fallback to today (safe under 12-min sync cadence).
 */
export function IDXSearchDisclaimer({
  className = '',
  lastUpdated,
}: {
  className?: string;
  lastUpdated?: Date | string;
}) {
  const fetchedWatermark = useIdxWatermarkFallback(!lastUpdated);
  const resolved = lastUpdated ?? fetchedWatermark;
  const now = resolved ? formatDate(resolved) : null;

  return (
    <div className={`text-xs text-gray-400 text-right space-y-0.5 ${className}`}>
      <p>
        Listing data provided by REBNY RLS.
        {now ? ` Data last updated: ${now}.` : ' Updated continuously.'}{' '}
        <EqualHousingIcon className="w-3 h-3 inline-block align-text-bottom" />
      </p>
      <p>
        Based on information from the REBNY Listing Service{now ? ` as of ${now}` : ''}. Information deemed reliable but not guaranteed.
      </p>
      <p>Mallan Real Estate Inc. — Licensed Real Estate Broker, New York State.</p>
      <p>Commission rates are not set by law and are fully negotiable.</p>
    </div>
  );
}

/**
 * Footer disclaimer (minimal)
 */
export function IDXFooterDisclaimer({ className = '' }: { className?: string }) {
  return (
    <div className={`text-xs text-gray-500 ${className}`}>
      <p>
        Listings provided by REBNY RLS. Information deemed reliable but not guaranteed.
      </p>
      <p className="flex items-center gap-1 mt-1">
        <EqualHousingIcon className="w-3 h-3" />
        Equal Housing Opportunity
      </p>
    </div>
  );
}
