'use client';

/**
 * SELLER-002 — invisible per-listing event tracker (registry SELLER-002;
 * Maya directive 2026-07-03).
 *
 * Mounted once on the listing detail page. Behavior:
 *  1. Fires `listing_view` on mount — at most once per session per listing
 *     (sessionStorage guard, lib/tracking/listing-events-client.ts).
 *  2. Installs ONE capture-phase delegated click listener that fires the
 *     event named by the nearest `data-track-event` attribute. Existing
 *     interaction points (gallery, share, save, contact CTAs) opt in by
 *     carrying that attribute — no per-component wiring, no prop drilling.
 *
 * Privacy: first-party anonymous analytics only (localStorage UUID
 * `mallan_vid`, sessionStorage `mallan_sid`) — no fingerprinting, no
 * cookies, no third-party scripts. The capture endpoint is fail-closed
 * behind the Maya-held LISTING_EVENTS_ENABLED env flag and always answers
 * 204, so this component is safe to ship before the flag (or the
 * listing_events table) exists.
 *
 * Event names are validated against the 11-value allowlist client-side too
 * (lib/tracking/listing-events.ts is pure/isomorphic), so a stray DOM
 * attribute can never mint a new event type.
 */

import { useEffect } from 'react';
import { isListingEventType } from '@/lib/tracking/listing-events';
import { fireListingEvent, fireListingViewOnce } from '@/lib/tracking/listing-events-client';

export default function ListingEventTracker({ listingId }: { listingId: string }) {
  useEffect(() => {
    if (!listingId) return;

    fireListingViewOnce(listingId);

    const onClick = (e: MouseEvent) => {
      try {
        const target = e.target as Element | null;
        const el = target && typeof target.closest === 'function'
          ? target.closest('[data-track-event]')
          : null;
        if (!el) return;
        const eventType = el.getAttribute('data-track-event');
        // listing_view is mount-only — never a click event.
        if (!isListingEventType(eventType) || eventType === 'listing_view') return;
        fireListingEvent(listingId, eventType);
      } catch {
        /* tracking must never break the page */
      }
    };

    // Capture phase so inner handlers that stopPropagation still get counted.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [listingId]);

  return null;
}
