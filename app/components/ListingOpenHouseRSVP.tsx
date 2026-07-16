'use client';

import { useState, useEffect } from 'react';
import OpenHouseRSVP from '@/app/components/OpenHouseRSVP';
import { selectListingOpenHouses, type ListingOpenHouseEntry } from '@/lib/open-houses/select-open-houses';

type OpenHouseData = ListingOpenHouseEntry;

interface ListingOpenHouseRSVPProps {
  listingId: string;
  listingAddress: string;
  /** Normalized address key for the page's listing (twin-safe matching: a local SL-0007 page can
   *  match its Cotality RLS-twin open house that /api/open-houses deduped under the RLS listingId).
   *  Computed server-side from the listing's structured address; empty/absent when suppressed. */
  listingAddressKey?: string;
}

/**
 * Fetches upcoming open houses for a given listing and renders
 * RSVP buttons if any are found. Used on the listing detail page sidebar.
 *
 * Matches by listingId (exact MLS ID match) — no fuzzy address matching.
 */
export default function ListingOpenHouseRSVP({ listingId, listingAddress, listingAddressKey }: ListingOpenHouseRSVPProps) {
  const [openHouses, setOpenHouses] = useState<OpenHouseData[]>([]);

  useEffect(() => {
    if (!listingId) return;

    fetch('/api/open-houses')
      .then(res => res.json())
      .then(data => {
        const allOH = (data.openHouses || []) as OpenHouseData[];
        // Twin-safe select: exact listingId OR shared normalized addressKey (canonical resolver),
        // then upcoming-only, dedupe by slot, cap 4. Closes the SL-0007↔RLS20099289 dedup gap.
        setOpenHouses(selectListingOpenHouses(allOH, { listingId, listingAddressKey }));
      })
      .catch(() => { /* silently fail — this is an enhancement */ });
  }, [listingId, listingAddressKey]);

  if (openHouses.length === 0) return null;

  return (
    <div className="glass-card rounded-3xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="font-display font-semibold text-sm">Upcoming Open House{openHouses.length > 1 ? 's' : ''}</h3>
      </div>
      <div className="space-y-3">
        {openHouses.map(oh => {
          const dateObj = new Date(oh.date + 'T00:00:00');
          const displayDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          const timeStr = [oh.startTime, oh.endTime].filter(Boolean).join(' - ');
          // Keep the existing date/time layout; only append the appointment designation when present.
          const timeLine = oh.openHouseType === 'By Appointment' ? `${timeStr} · By Appointment` : timeStr;

          return (
            <div key={oh.id} className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-medium text-brand-dark">{displayDate}</p>
                <p className="text-brand-dark/60">{timeLine}</p>
              </div>
              <OpenHouseRSVP
                openHouseId={oh.id}
                listingAddress={listingAddress}
                openHouseDate={oh.date}
                openHouseTime={timeStr}
                variant="button"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
