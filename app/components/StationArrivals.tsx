'use client';

import { useState, useEffect, useRef } from 'react';
import SubwayBadge from '@/app/components/neighborhoods/SubwayBadge';
import type { StationArrivalsData } from '@/lib/transit/types';

interface StationArrivalsProps {
  stationId: string;
  stationName: string;
  lines: string[];
  type: string;
}

export default function StationArrivals({
  stationId,
  stationName,
  lines,
  type,
}: StationArrivalsProps) {
  const [data, setData] = useState<StationArrivalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Only fetch for subway and PATH (ferry doesn't have real-time feeds)
    if (type !== 'subway' && type !== 'path') {
      setLoading(false);
      return;
    }

    const fetchArrivals = () => {
      fetch(`/api/transit/arrivals?stationId=${stationId}&lines=${lines.join(',')}`)
        .then((res) => res.json())
        .then((json) => {
          setData(json);
          setLoading(false);
          setError(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    };

    fetchArrivals();

    // Poll every 30 seconds
    intervalRef.current = setInterval(fetchArrivals, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [stationId, lines, type]);

  // Ferry/SIR schedule-only display
  if (type === 'ferry' || type === 'sir') {
    return (
      <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-500">
        <p>Schedule-based service. Check{' '}
          <a
            href={type === 'ferry' ? 'https://www.ferry.nyc' : 'https://new.mta.info/maps/subway-line-maps/staten-island-railway'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {type === 'ferry' ? 'ferry.nyc' : 'MTA SIR'}
          </a>
          {' '}for timetables.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-4 py-3 bg-gray-50 border-t">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-3 h-3 border border-gray-400 border-t-blue-600 rounded-full animate-spin" />
          Loading live arrivals...
        </div>
      </div>
    );
  }

  if (error || !data || data.feedStatus === 'unavailable') {
    return (
      <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-500">
        Live times unavailable. Check{' '}
        <a
          href="https://new.mta.info"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          MTA.info
        </a>
      </div>
    );
  }

  if (data.arrivals.length === 0) {
    return (
      <div className="px-4 py-3 bg-gray-50 border-t text-sm text-gray-500">
        No upcoming arrivals at {stationName}.
      </div>
    );
  }

  // Group by direction
  const uptown = data.arrivals.filter((a) => a.direction === 'Uptown');
  const downtown = data.arrivals.filter((a) => a.direction === 'Downtown');

  return (
    <div className="bg-gray-50 border-t text-sm">
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-200">
        <span className="font-medium text-gray-700">Live Arrivals</span>
        <span className="text-xs text-gray-400">
          Updated {new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {uptown.length > 0 && (
        <div className="px-4 py-2">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
            {uptown[0].destination}
          </p>
          <div className="space-y-1">
            {uptown.slice(0, 3).map((arrival, i) => (
              <div key={i} className="flex items-center gap-2">
                <SubwayBadge line={arrival.line} />
                <span className="text-gray-700 flex-1">{arrival.destination}</span>
                <span className="font-medium text-gray-900">
                  {arrival.minutesAway <= 0 ? 'Now' : `${arrival.minutesAway} min`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {downtown.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
            {downtown[0].destination}
          </p>
          <div className="space-y-1">
            {downtown.slice(0, 3).map((arrival, i) => (
              <div key={i} className="flex items-center gap-2">
                <SubwayBadge line={arrival.line} />
                <span className="text-gray-700 flex-1">{arrival.destination}</span>
                <span className="font-medium text-gray-900">
                  {arrival.minutesAway <= 0 ? 'Now' : `${arrival.minutesAway} min`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
