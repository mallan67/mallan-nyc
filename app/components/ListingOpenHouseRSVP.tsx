'use client';

import { useState, useEffect } from 'react';
import OpenHouseRSVP from '@/app/components/OpenHouseRSVP';

interface OpenHouseData {
  id: string;
  listingId: string;
  address: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface ListingOpenHouseRSVPProps {
  listingId: string;
  listingAddress: string;
}

/**
 * Fetches upcoming open houses for a given listing and renders
 * RSVP buttons if any are found. Used on the listing detail page sidebar.
 *
 * Matches by listingId (exact MLS ID match) — no fuzzy address matching.
 */
export default function ListingOpenHouseRSVP({ listingId, listingAddress }: ListingOpenHouseRSVPProps) {
  const [openHouses, setOpenHouses] = useState<OpenHouseData[]>([]);

  useEffect(() => {
    if (!listingId) return;

    fetch('/api/open-houses')
      .then(res => res.json())
      .then(data => {
        const allOH = (data.openHouses || []) as OpenHouseData[];

        // Exact match by listing ID (MLS ID)
        const matching = allOH.filter(oh => oh.listingId === listingId);

        // Only show upcoming open houses
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const upcoming = matching.filter(oh => {
          const ohDate = new Date(oh.date + 'T00:00:00');
          return ohDate >= today;
        });

        // Deduplicate by date + time (Trestle can return multiple entries for same slot)
        const seen = new Set<string>();
        const deduped = upcoming.filter(oh => {
          const key = `${oh.date}|${oh.startTime}|${oh.endTime}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Sort by date ascending and limit to 4 entries
        deduped.sort((a, b) => a.date.localeCompare(b.date));
        setOpenHouses(deduped.slice(0, 4));
      })
      .catch(() => { /* silently fail — this is an enhancement */ });
  }, [listingId]);

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

          return (
            <div key={oh.id} className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-medium text-brand-dark">{displayDate}</p>
                <p className="text-brand-dark/60">{timeStr}</p>
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
