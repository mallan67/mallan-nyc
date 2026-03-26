'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/** Fires tracked view API when ?t= param is present. Silent on failure. Renders nothing. */
export default function TrackListingSend({ listingId }: { listingId: string }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('t');
    if (!token) return;

    fetch('/api/tracking/listing-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, listing_id: listingId }),
    }).catch(() => {}); // silent — page works normally
  }, [listingId, searchParams]);

  return null;
}
