'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackListingView } from '@/lib/posthog';

/** Fires a PostHog listing_viewed event on mount. Renders nothing. */
export default function TrackListingView({ listingId }: { listingId: string }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams?.get('ref');
    const source = ref === 'favorites' ? 'favorites'
      : ref === 'alert' ? 'alert_email'
      : ref === 'search' ? 'search'
      : 'direct';
    trackListingView(listingId, source);
  }, [listingId, searchParams]);

  return null;
}
