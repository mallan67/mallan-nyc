'use client';

import { useEffect } from 'react';
import { trackListingView } from '@/lib/posthog';

/** Fires a PostHog listing_viewed event on mount. Renders nothing. */
export default function TrackListingView({ listingId, refSource }: { listingId: string; refSource?: string }) {
  useEffect(() => {
    const source = refSource === 'favorites' ? 'favorites'
      : refSource === 'alert' ? 'alert_email'
      : refSource === 'search' ? 'search'
      : 'direct';
    trackListingView(listingId, source);
  }, [listingId, refSource]);

  return null;
}
