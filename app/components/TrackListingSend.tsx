'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Fires the tracked-view API when a ?t= token is present. Reads the token
 * CLIENT-SIDE (useSearchParams) so the listing page no longer needs to read
 * searchParams on the server — which had forced dynamic rendering and blocked
 * ISR/CDN caching. Silent on failure. Renders nothing. Must be wrapped in
 * <Suspense> by the caller.
 */
export default function TrackListingSend({ listingId }: { listingId: string }) {
  const trackToken = useSearchParams().get('t') ?? undefined;

  useEffect(() => {
    if (!trackToken) return;

    fetch('/api/tracking/listing-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: trackToken, listing_id: listingId }),
    }).catch(() => {}); // silent — page works normally
  }, [listingId, trackToken]);

  return null;
}
