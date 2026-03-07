'use client';

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { DisplayListing } from '@/lib/idx/display-adapter';
import { listingHref } from '@/lib/idx/display-adapter';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Fix Leaflet default marker icons in Next.js/webpack
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// ── Map styles (OpenFreeMap vector tiles via MapLibre GL) ──
const MAP_STYLES = {
  bright: { label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  liberty: { label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
  positron: { label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' },
} as const;

type MapStyleKey = keyof typeof MAP_STYLES;

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  return `$${(price / 1_000).toFixed(0)}K`;
}

/** Price pill marker icon */
function createPriceIcon(
  price: number,
  isRental: boolean,
  highlighted: boolean,
  comingSoon: boolean,
  stackCount?: number,
): L.DivIcon {
  const label = formatPrice(price, isRental);
  const bg = highlighted ? '#C4A052' : comingSoon ? '#f59e0b' : '#1a1a1a';
  const text = '#ffffff';
  const badge = stackCount && stackCount > 1
    ? `<span style="position:absolute;top:-6px;right:-6px;background:#C4A052;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:99px;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;">${stackCount}</span>`
    : '';
  return L.divIcon({
    className: 'price-marker',
    html: `<div style="
      position:relative;
      background:${bg};color:${text};
      font-size:11px;font-weight:600;
      padding:3px 8px;border-radius:8px;
      white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);
      border:2px solid ${highlighted ? '#fff' : 'transparent'};
      transform:translate(-50%,-100%);
      cursor:pointer;
      transition:transform 0.15s ease, box-shadow 0.15s ease;
    ">${label}${badge}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// ── Same-building coordinate offset ──
const COORD_KEY = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
const OFFSET_RADIUS = 0.00012;

function computePositions(listings: DisplayListing[]): Map<string, [number, number]> {
  const groups = new Map<string, DisplayListing[]>();
  for (const l of listings) {
    if (!l.address.latitude || !l.address.longitude) continue;
    const key = COORD_KEY(l.address.latitude, l.address.longitude);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }

  const positions = new Map<string, [number, number]>();
  for (const [, group] of groups) {
    if (group.length === 1) {
      const l = group[0];
      positions.set(l.id, [l.address.latitude!, l.address.longitude!]);
    } else {
      for (let i = 0; i < group.length; i++) {
        const l = group[i];
        const angle = (i / group.length) * 2 * Math.PI - Math.PI / 2;
        positions.set(l.id, [
          l.address.latitude! + OFFSET_RADIUS * Math.cos(angle),
          l.address.longitude! + OFFSET_RADIUS * Math.sin(angle),
        ]);
      }
    }
  }
  return positions;
}

function computeStackCounts(listings: DisplayListing[]): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const l of listings) {
    if (!l.address.latitude || !l.address.longitude) continue;
    const key = COORD_KEY(l.address.latitude, l.address.longitude);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l.id);
  }
  const counts = new Map<string, number>();
  for (const [, ids] of groups) {
    for (const id of ids) {
      counts.set(id, ids.length);
    }
  }
  return counts;
}

/** Add OpenFreeMap vector tile layer via MapLibre GL */
function MapLibreLayer({ styleUrl }: { styleUrl: string }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    // Dynamic import to avoid SSR issues
    import('@maplibre/maplibre-gl-leaflet').then((mod) => {
      // Remove old layer
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
      // Add new MapLibre GL layer — the module attaches L.maplibreGL to Leaflet
      const createLayer = (L as unknown as { maplibreGL?: (opts: { style: string }) => L.Layer }).maplibreGL
        || (mod.default as unknown as (opts: { style: string }) => L.Layer);
      const glLayer = createLayer({ style: styleUrl });
      glLayer.addTo(map);
      layerRef.current = glLayer;
    });

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, styleUrl]);

  return null;
}

/** Fit map bounds to markers when listing coordinates change */
function FitBounds({ coordHash, listings }: { coordHash: string; listings: { lat: number; lng: number }[] }) {
  const map = useMap();
  const prevHash = useRef('');
  const userInteracted = useRef(false);

  useEffect(() => {
    const onMoveStart = () => { userInteracted.current = true; };
    map.on('dragstart', onMoveStart);
    map.on('zoomstart', onMoveStart);
    return () => {
      map.off('dragstart', onMoveStart);
      map.off('zoomstart', onMoveStart);
    };
  }, [map]);

  useEffect(() => {
    if (listings.length === 0) return;
    if (coordHash === prevHash.current) return;
    const isFirstLoad = prevHash.current === '';
    prevHash.current = coordHash;

    if (userInteracted.current && !isFirstLoad) {
      userInteracted.current = false;
    }

    const bounds = L.latLngBounds(listings.map(l => [l.lat, l.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
  }, [coordHash, listings, map]);

  return null;
}

interface SearchMapProps {
  listings: DisplayListing[];
  highlightedId?: string | null;
  onMarkerClick?: (id: string) => void;
}

export default function SearchMap({ listings, highlightedId, onMarkerClick }: SearchMapProps) {
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('bright');

  const mappable = useMemo(
    () => listings.filter((l) => l.address.latitude && l.address.longitude),
    [listings]
  );

  const center: [number, number] = useMemo(() => {
    if (mappable.length === 0) return [40.7484, -73.9857];
    const avgLat = mappable.reduce((s, l) => s + (l.address.latitude || 0), 0) / mappable.length;
    const avgLng = mappable.reduce((s, l) => s + (l.address.longitude || 0), 0) / mappable.length;
    return [avgLat, avgLng];
  }, [mappable]);

  const positions = useMemo(() => computePositions(mappable), [mappable]);
  const stackCounts = useMemo(() => computeStackCounts(mappable), [mappable]);

  const boundsData = useMemo(
    () => mappable.map(l => ({ lat: l.address.latitude!, lng: l.address.longitude! })),
    [mappable]
  );
  const coordHash = useMemo(
    () => mappable.map(l => l.id).sort().join(','),
    [mappable]
  );

  const totalListings = listings.length;
  const withoutCoords = totalListings - mappable.length;

  const handleMarkerClick = useCallback((id: string) => {
    onMarkerClick?.(id);
  }, [onMarkerClick]);

  if (mappable.length === 0) {
    return (
      <div className="rounded-2xl bg-gray-100 flex flex-col items-center justify-center h-full min-h-[300px] gap-3">
        <svg className="w-12 h-12 text-brand-dark/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        <p className="text-brand-dark/85 text-center px-4">
          {totalListings === 0
            ? 'No listings to display on map'
            : `${totalListings} listing${totalListings !== 1 ? 's' : ''} found, but location data is not available for map display`}
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden h-full min-h-[300px]">
      {/* Info badge */}
      {withoutCoords > 0 && (
        <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm text-xs text-brand-dark/85 px-3 py-1.5 rounded-lg shadow-sm">
          Showing {mappable.length} of {totalListings} on map
        </div>
      )}

      {/* Map style switcher */}
      <div className="absolute top-3 right-3 z-[1000] flex gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm p-1">
        {(Object.entries(MAP_STYLES) as [MapStyleKey, typeof MAP_STYLES[MapStyleKey]][]).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setMapStyle(key)}
            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              mapStyle === key
                ? 'bg-brand-dark text-white'
                : 'text-brand-dark/70 hover:text-brand-dark hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <MapContainer
        center={center}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <MapLibreLayer styleUrl={MAP_STYLES[mapStyle].url} />
        <FitBounds coordHash={coordHash} listings={boundsData} />
        {mappable.map((listing) => {
          const isHighlighted = highlightedId === listing.id;
          const isComingSoon = !!listing._displayCompliance.comingSoon;
          const isRental = listing.listingType === 'rent';
          const pos = positions.get(listing.id) || [listing.address.latitude!, listing.address.longitude!];
          const stackCount = stackCounts.get(listing.id) || 1;
          return (
            <Marker
              key={listing.id}
              position={pos}
              icon={createPriceIcon(listing.listPrice, isRental, isHighlighted, isComingSoon, stackCount)}
              zIndexOffset={isHighlighted ? 1000 : 0}
              eventHandlers={{
                click: () => handleMarkerClick(listing.id),
              }}
            >
              <Popup>
                <div className="min-w-[220px] p-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">
                        {formatPrice(listing.listPrice, isRental)}
                      </p>
                      <p className="text-xs text-gray-700 mt-0.5">
                        {listing.address.streetName === 'Address Undisclosed'
                          ? 'Address Undisclosed'
                          : `${listing.address.streetNumber} ${listing.address.streetName}${listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}`}
                      </p>
                    </div>
                    {stackCount > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-medium flex-shrink-0">
                        {stackCount} in bldg
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {listing.bedroomsTotal} bed &middot; {listing.bathroomsFull} bath
                    {listing.livingArea ? ` · ${listing.livingArea.toLocaleString()} sqft` : ''}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400">
                      {listing.listOfficeName}
                    </p>
                    <a
                      href={listingHref(listing)}
                      className="text-xs font-medium text-brand-gold hover:text-brand-gold/80 transition-colors"
                    >
                      View Details →
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Attribution */}
      <div className="absolute bottom-1 left-1 z-[1000] text-[9px] text-gray-500 bg-white/70 px-1.5 py-0.5 rounded">
        <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="hover:underline">OpenFreeMap</a>
        {' '}© <a href="https://openmaptiles.org" target="_blank" rel="noopener noreferrer" className="hover:underline">OpenMapTiles</a>
        {' '}· <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:underline">OpenStreetMap</a>
      </div>
    </div>
  );
}
