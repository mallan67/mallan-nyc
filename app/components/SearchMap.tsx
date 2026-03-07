'use client';

import { useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { DisplayListing } from '@/lib/idx/display-adapter';
import 'leaflet/dist/leaflet.css';

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

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  return `$${(price / 1_000).toFixed(0)}K`;
}

/** Price pill marker icon */
function createPriceIcon(price: number, isRental: boolean, highlighted: boolean, comingSoon: boolean): L.DivIcon {
  const label = formatPrice(price, isRental);
  const bg = highlighted ? '#C4A052' : comingSoon ? '#f59e0b' : '#1a1a1a';
  const text = '#ffffff';
  return L.divIcon({
    className: 'price-marker',
    html: `<div style="
      background:${bg};color:${text};
      font-size:11px;font-weight:600;
      padding:3px 8px;border-radius:8px;
      white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.2);
      border:2px solid ${highlighted ? '#fff' : 'transparent'};
      transform:translate(-50%,-100%);
    ">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Fit map bounds to markers when listings change */
function FitBounds({ listings }: { listings: { lat: number; lng: number }[] }) {
  const map = useMap();
  const prevLen = useRef(0);

  useEffect(() => {
    if (listings.length === 0) return;
    // Only auto-fit when the listing set changes significantly
    if (Math.abs(listings.length - prevLen.current) < 2 && prevLen.current > 0) return;
    prevLen.current = listings.length;

    const bounds = L.latLngBounds(listings.map(l => [l.lat, l.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [listings, map]);

  return null;
}

interface SearchMapProps {
  listings: DisplayListing[];
  highlightedId?: string | null;
  onMarkerClick?: (id: string) => void;
}

export default function SearchMap({ listings, highlightedId, onMarkerClick }: SearchMapProps) {
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

  const boundsData = useMemo(
    () => mappable.map(l => ({ lat: l.address.latitude!, lng: l.address.longitude! })),
    [mappable]
  );

  const totalListings = listings.length;
  const withoutCoords = totalListings - mappable.length;

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
        <p className="text-brand-dark/85 text-xs text-center px-4">
          Try switching to Grid or List view to see results
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden h-full min-h-[300px]">
      {withoutCoords > 0 && (
        <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm text-xs text-brand-dark/85 px-3 py-1.5 rounded-lg shadow-sm">
          Showing {mappable.length} of {totalListings} listings on map
        </div>
      )}
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds listings={boundsData} />
        {mappable.map((listing) => {
          const isHighlighted = highlightedId === listing.id;
          const isComingSoon = !!listing._displayCompliance.comingSoon;
          const isRental = listing.listingType === 'rent';
          return (
            <Marker
              key={listing.id}
              position={[listing.address.latitude!, listing.address.longitude!]}
              icon={createPriceIcon(listing.listPrice, isRental, isHighlighted, isComingSoon)}
              eventHandlers={{
                click: () => onMarkerClick?.(listing.id),
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <p className="font-semibold text-sm">
                    {formatPrice(listing.listPrice, isRental)}
                  </p>
                  <p className="text-xs text-gray-700">
                    {listing.address.streetName === 'Address Undisclosed'
                      ? 'Address Undisclosed'
                      : `${listing.address.streetNumber} ${listing.address.streetName}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {listing.bedroomsTotal} bed &middot; {listing.bathroomsFull} bath
                    {listing.livingArea ? ` · ${listing.livingArea.toLocaleString()} sqft` : ''}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Courtesy of {listing.listOfficeName}
                  </p>
                  <a
                    href={`/listing/${listing.slug}?key=${encodeURIComponent(listing.id)}`}
                    className="text-xs text-blue-600 hover:underline mt-1 block"
                  >
                    View Details
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
