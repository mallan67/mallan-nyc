'use client';

import { useEffect, useState } from 'react';
import SubwayBadge from '@/app/components/neighborhoods/SubwayBadge';
import type { NearbyStation } from '@/lib/transit/types';

function TransitScoreBadge({ score }: { score: number }) {
  let color = 'bg-red-100 text-red-700';
  let label = 'Minimal Transit';

  if (score >= 90) {
    color = 'bg-green-100 text-green-700';
    label = "Rider's Paradise";
  } else if (score >= 70) {
    color = 'bg-green-50 text-green-600';
    label = 'Excellent Transit';
  } else if (score >= 50) {
    color = 'bg-yellow-50 text-yellow-700';
    label = 'Good Transit';
  } else if (score >= 25) {
    color = 'bg-orange-50 text-orange-600';
    label = 'Some Transit';
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg font-bold text-lg ${color}`}>
        {score}
      </span>
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">Transit Score</p>
      </div>
    </div>
  );
}

interface TransitSidebarSummaryProps {
  latitude?: number;
  longitude?: number;
  neighborhoodTransit?: string[];
  transitScore?: number;
}

export default function TransitSidebarSummary({
  latitude,
  longitude,
  neighborhoodTransit,
  transitScore: propScore,
}: TransitSidebarSummaryProps) {
  // Canonical fetch-on-mount + setState pattern. Effect depends on
  // lat/lng so re-runs are bounded by parent re-renders.
  type Data = { stations: NearbyStation[]; transitScore: number } | null;
  const [data, setData] = useState<Data>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!latitude || !longitude) {
      setLoading(false);
      return;
    }

    fetch(`/api/transit/nearby?lat=${latitude}&lng=${longitude}&limit=3&radius=800`)
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [latitude, longitude]);

  // Fall back to neighborhood data if no coordinates
  if (!latitude || !longitude) {
    if (!neighborhoodTransit?.length && !propScore) return null;

    return (
      <div className="bg-white rounded-lg p-4 border shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">Nearby Transit</h3>
        </div>
        {propScore && <TransitScoreBadge score={propScore} />}
        {neighborhoodTransit && neighborhoodTransit.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {neighborhoodTransit.map((line) => (
              <SubwayBadge key={line} line={line} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-4 border shadow-sm animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
        <div className="h-10 bg-gray-200 rounded w-32 mb-3" />
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-6 h-6 bg-gray-200 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.stations.length === 0) return null;

  const nearest = data.stations[0];
  const allLines = Array.from(
    new Set(data.stations.flatMap((s) => s.station.lines))
  );

  return (
    <div className="bg-white rounded-lg p-4 border shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-900">Nearby Transit</h3>
      </div>

      <TransitScoreBadge score={data.transitScore} />

      <div className="mt-3 pt-3 border-t">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700 font-medium">{nearest.station.name}</span>
          <span className="text-gray-500">{nearest.walkMinutes} min walk</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {allLines.map((line) => (
            <SubwayBadge key={line} line={line} />
          ))}
        </div>
      </div>
    </div>
  );
}
