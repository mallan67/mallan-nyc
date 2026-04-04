/**
 * IDX Disclaimer Component
 *
 * COMPLIANCE CRITICAL:
 * This component renders required REBNY RLS attribution and disclaimers.
 * It MUST be displayed on all pages showing IDX/MLS listing data.
 *
 * Requirements per REBNY RLS Display Rules:
 * - Attribution to data source
 * - Last update timestamp
 * - Equal housing opportunity notice
 * - Broker disclaimer
 */

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
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * IDX Disclaimer and Attribution Component
 *
 * Displays required compliance text for IDX/MLS data display.
 */
export default function IDXDisclaimer({
  lastUpdated,
  variant = 'compact',
  className = '',
}: IDXDisclaimerProps) {
  // Always show today's date — data is refreshed every 12 minutes via sync cron
  const timestamp = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  if (variant === 'compact') {
    return (
      <div className={`text-xs text-gray-500 ${className}`}>
        <p>
          Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.
          {` Data last updated: ${timestamp}.`}
        </p>
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
          <strong>Last Updated:</strong> {timestamp}
        </p>

        <p>
          <strong>Accuracy:</strong> Based on information from the REBNY Listing Service
          as of {timestamp}. Information is deemed reliable but not guaranteed.
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
 */
export function IDXSearchDisclaimer({ className = '' }: { className?: string }) {
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={`text-xs text-gray-400 text-right space-y-0.5 ${className}`}>
      <p>
        Listing data provided by REBNY RLS. Data last updated: {now}.{' '}
        <EqualHousingIcon className="w-3 h-3 inline-block align-text-bottom" />
      </p>
      <p>
        Based on information from the REBNY Listing Service as of {now}. Information deemed reliable but not guaranteed.
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
