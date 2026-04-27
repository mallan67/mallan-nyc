'use client';

import { useCallback, useState } from 'react';
import NearestStations from './NearestStations';
import CommuteCalculator from './CommuteCalculator';
import type { NearbyStation } from '@/lib/transit/types';
import { useAsyncResource } from '@/lib/hooks/useAsyncResource';

function TransitScoreBar({ score }: { score: number }) {
  let color = 'bg-red-500';
  let label = 'Minimal Transit';

  if (score >= 90) {
    color = 'bg-green-500';
    label = "Rider's Paradise";
  } else if (score >= 70) {
    color = 'bg-green-400';
    label = 'Excellent Transit';
  } else if (score >= 50) {
    color = 'bg-yellow-400';
    label = 'Good Transit';
  } else if (score >= 25) {
    color = 'bg-orange-400';
    label = 'Some Transit';
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-gray-900">{score}</span>
        <span className="text-sm text-gray-500">/100</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${color}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface TransitCommuteToolProps {
  latitude?: number;
  longitude?: number;
  borough?: string;
  neighborhoodTransit?: string[];
  transitScore?: number;
}

export default function TransitCommuteTool({
  latitude,
  longitude,
}: TransitCommuteToolProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);

  // Lazy fetch — keyed off `isExpanded` so the request is only kicked
  // off after the user opens the panel. `null` key keeps the resource
  // idle.
  const fetchKey =
    isExpanded && latitude && longitude ? `${latitude},${longitude}` : null;

  type StationsResponse = { stations: NearbyStation[]; transitScore: number; expanded: boolean };

  const fetcher = useCallback(
    async (key: string | number, signal: AbortSignal): Promise<StationsResponse> => {
      const [lat, lng] = String(key).split(',');
      const res = await fetch(
        `/api/transit/nearby?lat=${lat}&lng=${lng}&limit=8&radius=800`,
        { signal },
      );
      const data = await res.json();
      return {
        stations: (data.stations as NearbyStation[]) || [],
        transitScore: data.transitScore || 0,
        expanded: !!data.expanded,
      };
    },
    [],
  );

  const { data, loading, error, status } = useAsyncResource(fetchKey, fetcher);
  const stations = data?.stations ?? [];
  const transitScore = data?.transitScore ?? 0;
  const expanded = data?.expanded ?? false;
  const refetch = useCallback(() => {
    // Force a refetch by toggling the panel closed/open. Any approach
    // that changes the key works here.
    setIsExpanded(false);
    setTimeout(() => setIsExpanded(true), 0);
  }, []);
  // Loading should only be true once the panel is expanded; pre-expand
  // status === 'idle' should not show the spinner.
  const showLoading = isExpanded && (loading || status === 'idle');

  if (!latitude || !longitude) return null;

  return (
    <section className="bg-white rounded-lg border">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
            </svg>
          </div>
          <div className="text-left">
            <h2 className="text-lg font-sans font-semibold text-gray-900">Transit & Commute</h2>
            <p className="text-sm text-gray-500">Nearby stations, live arrivals & commute times</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-6 pb-6 border-t">
          {showLoading && (
            <div className="py-8 text-center">
              <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-500 mt-2">Finding nearby stations...</p>
            </div>
          )}

          {error && (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-500">Unable to load transit data.</p>
              <button
                type="button"
                onClick={refetch}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {!showLoading && !error && (
            <>
              {/* Transit Score */}
              <div className="py-4">
                <TransitScoreBar score={transitScore} />
              </div>

              {/* Expanded radius note */}
              {expanded && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  No stations within 800m. Showing stations within 1.6km (1 mi).
                </div>
              )}

              {/* Station List */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Nearest Stations</h3>
                <NearestStations
                  stations={stations}
                  onStationClick={(id) =>
                    setExpandedStationId(expandedStationId === id ? null : id)
                  }
                  expandedStationId={expandedStationId}
                />
              </div>

              {/* Commute Calculator */}
              {latitude && longitude && (
                <CommuteCalculator latitude={latitude} longitude={longitude} />
              )}

              {/* MTA Attribution */}
              <p className="text-xs text-gray-400 pt-3 border-t mt-4">
                Transit data from MTA, PATH, and NYC Ferry. Walk times are estimates based on average walking speed.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
