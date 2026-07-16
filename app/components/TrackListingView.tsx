'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackListingView } from '@/lib/posthog';

/**
 * Fires a PostHog listing_viewed event on mount. Reads the ?ref= source
 * CLIENT-SIDE (useSearchParams) so the listing page no longer needs to read
 * searchParams on the server — which had forced dynamic rendering and blocked
 * ISR/CDN caching. Renders nothing. Must be wrapped in <Suspense> by the caller.
 */
export default function TrackListingView({ listingId }: { listingId: string }) {
  const refSource = useSearchParams().get('ref') ?? undefined;

  useEffect(() => {
    const source = refSource === 'favorites' ? 'favorites'
      : refSource === 'alert' ? 'alert_email'
      : refSource === 'search' ? 'search'
      : 'direct';
    trackListingView(listingId, source);
  }, [listingId, refSource]);

  return null;
}
