'use client';

import SubwayBadge from '@/app/components/neighborhoods/SubwayBadge';
import StationArrivals from './StationArrivals';
import type { NearbyStation } from '@/lib/transit/types';

function TransitBadge({ line, type }: { line: string; type: string }) {
  if (type === 'subway' || type === 'sir') {
    return <SubwayBadge line={line} />;
  }

  if (type === 'path') {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-blue-700 text-white" aria-label="PATH">
        P
      </span>
    );
  }

  // Ferry
  return (
    <span className="inline-flex items-center justify-center h-6 px-1.5 rounded-full text-xs font-bold bg-teal-600 text-white" aria-label={line}>
      <svg className="w-3.5 h-3.5 mr-0.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.9-6.68c.11-.37.05-.76-.15-1.07s-.53-.49-.9-.49h-1.9V7c0-1.1-.9-2-2-2h-3V3c0-.55-.45-1-1-1h-4c-.55 0-1 .45-1 1v2H7c-1.1 0-2 .9-2 2v3.85H3.1c-.38 0-.72.18-.9.49-.2.31-.26.7-.15 1.07L3.95 19zM7 7h10v3.85H7V7z" />
      </svg>
    </span>
  );
}

function TransitTypeIcon({ type }: { type: string }) {
  if (type === 'subway') {
    return (
      <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
      </svg>
    );
  }
  if (type === 'path') {
    return (
      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
      </svg>
    );
  }
  if (type === 'ferry') {
    return (
      <svg className="w-5 h-5 text-teal-600" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.9-6.68c.11-.37.05-.76-.15-1.07s-.53-.49-.9-.49h-1.9V7c0-1.1-.9-2-2-2h-3V3c0-.55-.45-1-1-1h-4c-.55 0-1 .45-1 1v2H7c-1.1 0-2 .9-2 2v3.85H3.1c-.38 0-.72.18-.9.49-.2.31-.26.7-.15 1.07L3.95 19zM7 7h10v3.85H7V7z" />
      </svg>
    );
  }
  // SIR
  return (
    <svg className="w-5 h-5 text-blue-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
    </svg>
  );
}

interface NearestStationsProps {
  stations: NearbyStation[];
  onStationClick?: (stationId: string) => void;
  expandedStationId?: string | null;
}

export default function NearestStations({
  stations,
  onStationClick,
  expandedStationId,
}: NearestStationsProps) {
  if (stations.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        No transit stations found nearby. This area may be car-dependent.
      </div>
    );
  }

  return (
    <div className="divide-y">
      {stations.map((ns) => {
        const isOpen = expandedStationId === ns.station.id;
        return (
          <div key={ns.station.id}>
            <button
              type="button"
              onClick={() => onStationClick?.(ns.station.id)}
              className={`w-full text-left py-3 px-1 hover:bg-gray-50 transition-colors ${
                isOpen ? 'bg-gray-50' : ''
              }`}
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-3">
                <TransitTypeIcon type={ns.station.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {ns.station.name}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {ns.walkMinutes} min walk
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ns.station.lines.map((line) => (
                      <TransitBadge key={line} line={line} type={ns.station.type} />
                    ))}
                  </div>
                </div>
                {onStationClick && (
                  <svg
                    className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>
              {ns.station.ada && (
                <span className="inline-block mt-1 ml-8 text-xs text-blue-600">
                  <svg className="w-3 h-3 inline mr-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm4.5 8h-3.14c-.82 0-1.58.28-2.19.75L8.5 13h-.01L6 18l1.74.98L9.5 14.5l2-.5v8h2v-5.5l2.5 1.5V22h2v-6l-3.5-3 1-2h3c.83 0 1.5-.67 1.5-1.5S17.33 10 16.5 10z" />
                  </svg>
                  ADA Accessible
                </span>
              )}
            </button>
            {isOpen && (
              <StationArrivals
                stationId={ns.station.id}
                stationName={ns.station.name}
                lines={ns.station.lines}
                type={ns.station.type}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
