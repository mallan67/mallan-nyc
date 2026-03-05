'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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

interface SearchMapProps {
  listings: DisplayListing[];
}

export default function SearchMap({ listings }: SearchMapProps) {
  // Filter to listings with valid coordinates
  const mappable = useMemo(
    () => listings.filter((l) => l.address.latitude && l.address.longitude),
    [listings]
  );

  // NYC center default
  const center: [number, number] = useMemo(() => {
    if (mappable.length === 0) return [40.7484, -73.9857]; // Midtown
    const avgLat = mappable.reduce((s, l) => s + (l.address.latitude || 0), 0) / mappable.length;
    const avgLng = mappable.reduce((s, l) => s + (l.address.longitude || 0), 0) / mappable.length;
    return [avgLat, avgLng];
  }, [mappable]);

  if (mappable.length === 0) {
    return (
      <div className="rounded-2xl bg-gray-100 flex items-center justify-center h-[500px]">
        <p className="text-brand-dark/50">No listings with location data to display on map</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-black/5 h-[500px]">
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
        {mappable.map((listing) => (
          <Marker
            key={listing.id}
            position={[listing.address.latitude!, listing.address.longitude!]}
          >
            <Popup>
              <div className="min-w-[200px]">
                <p className="font-semibold text-sm">
                  {formatPrice(listing.listPrice, listing.listingType === 'rent')}
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
                  href={`/listing/${listing.slug}`}
                  className="text-xs text-blue-600 hover:underline mt-1 block"
                >
                  View Details
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
