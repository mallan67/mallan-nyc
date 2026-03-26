'use client';

import { useEffect } from 'react';

/** Fires tracked view API when trackToken is present. Silent on failure. Renders nothing. */
export default function TrackListingSend({ listingId, trackToken }: { listingId: string; trackToken?: string }) {
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
