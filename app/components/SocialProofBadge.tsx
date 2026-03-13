'use client';

import { useState, useEffect } from 'react';

interface SocialProofData {
  views: number;
  saves: number;
  showingsThisWeek: number;
  demandLevel: string;
}

/**
 * SocialProofBadge — Shows anonymized demand signals on listing cards/detail pages.
 *
 * No PII, no demographics. Aggregate counts only. Fair Housing safe.
 *
 * Display rules:
 * - Only show if views >= 5 (avoid showing "1 person viewed" which feels creepy)
 * - Show most impactful signal (showings > saves > views)
 * - Demand level badge only for "high" or "very_high"
 */
export default function SocialProofBadge({
  listingId,
  variant = 'inline',
}: {
  listingId: string;
  variant?: 'inline' | 'detail';
}) {
  const [data, setData] = useState<SocialProofData | null>(null);

  useEffect(() => {
    fetch(`/api/listings/${encodeURIComponent(listingId)}/social-proof`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, [listingId]);

  if (!data || data.views < 5) return null;

  // Pick the most impactful signal
  const signal = data.showingsThisWeek > 0
    ? `${data.showingsThisWeek} showing${data.showingsThisWeek > 1 ? 's' : ''} this week`
    : data.saves >= 3
    ? `Saved ${data.saves} times`
    : `${data.views} views this week`;

  const isHot = data.demandLevel === 'very_high' || data.demandLevel === 'high';

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
        isHot ? 'text-orange-600' : 'text-brand-dark/60'
      }`}>
        {isHot && (
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 23c-3.3 0-6-2.7-6-6 0-2.1 1.3-4.5 2.8-6.3C10.4 8.8 12 6.5 12 4c0 2.5 1.6 4.8 3.2 6.7C16.7 12.5 18 14.9 18 17c0 3.3-2.7 6-6 6z" />
          </svg>
        )}
        {signal}
      </span>
    );
  }

  // Detail variant — fuller display
  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-xl text-sm ${
      isHot ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-brand-dark/70'
    }`}>
      {isHot && (
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 23c-3.3 0-6-2.7-6-6 0-2.1 1.3-4.5 2.8-6.3C10.4 8.8 12 6.5 12 4c0 2.5 1.6 4.8 3.2 6.7C16.7 12.5 18 14.9 18 17c0 3.3-2.7 6-6 6z" />
        </svg>
      )}
      <div>
        <p className="font-medium">{isHot ? 'High Demand' : 'Active Listing'}</p>
        <p className="text-[12px] opacity-80">
          {data.views} views · {data.saves} saves
          {data.showingsThisWeek > 0 && ` · ${data.showingsThisWeek} showing${data.showingsThisWeek > 1 ? 's' : ''} scheduled`}
        </p>
      </div>
    </div>
  );
}
