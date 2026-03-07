'use client';

import { useState } from 'react';

interface ListingLocationMapProps {
  latitude: number;
  longitude: number;
  address: string;
  borough?: string;
}

export default function ListingLocationMap({
  latitude,
  longitude,
  address,
  borough,
}: ListingLocationMapProps) {
  const [showDirections, setShowDirections] = useState(false);
  const [origin, setOrigin] = useState('');

  const destination = encodeURIComponent(address + (borough ? `, ${borough}, NY` : ', New York, NY'));
  const mapQ = encodeURIComponent(`${latitude},${longitude}`);

  // Google Maps Embed API (free, no key needed for basic embed)
  const locationMapUrl = `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${mapQ}&zoom=16&maptype=roadmap`;
  const directionsUrl = origin
    ? `https://www.google.com/maps/embed/v1/directions?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&origin=${encodeURIComponent(origin)}&destination=${destination}&mode=transit`
    : null;

  // Fallback: use OpenStreetMap embed (no API key)
  const osmUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-semibold">Location & Transit</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setShowDirections(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              !showDirections ? 'bg-white text-brand-dark shadow-sm' : 'text-brand-dark/60 hover:text-brand-dark'
            }`}
          >
            Map
          </button>
          <button
            onClick={() => setShowDirections(true)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              showDirections ? 'bg-white text-brand-dark shadow-sm' : 'text-brand-dark/60 hover:text-brand-dark'
            }`}
          >
            Directions
          </button>
        </div>
      </div>

      {!showDirections ? (
        /* Location map */
        <div className="rounded-2xl overflow-hidden border border-black/5">
          <iframe
            src={osmUrl}
            width="100%"
            height="350"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map of ${address}`}
          />
        </div>
      ) : (
        /* Directions mode */
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Enter starting address..."
                className="w-full px-4 py-2.5 pr-10 border border-black/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold"
              />
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-dark/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border border-black/5">
            {directionsUrl ? (
              <iframe
                src={directionsUrl}
                width="100%"
                height="400"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`Directions to ${address}`}
              />
            ) : (
              <div className="h-[400px] bg-gray-50 flex flex-col items-center justify-center gap-3 text-brand-dark/50">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <p className="text-sm">Enter a starting address to see transit directions</p>
              </div>
            )}
          </div>

          {/* Quick links to full Google Maps */}
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=transit`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
              </svg>
              Transit
            </a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg hover:bg-green-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Walk
            </a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
              Drive
            </a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=bicycling`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="5.5" cy="17.5" r="3.5" />
                <circle cx="18.5" cy="17.5" r="3.5" />
                <path d="M15 6a1 1 0 100-2 1 1 0 000 2zm-4 11l2-7h4l1 4" />
              </svg>
              Bike
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
