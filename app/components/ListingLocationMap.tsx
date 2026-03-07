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

  const destination = encodeURIComponent(address + (borough ? `, ${borough}, NY` : ', New York, NY'));
  const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-semibold">Location</h2>
      </div>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden border border-black/5">
        <iframe
          src={mapUrl}
          width="100%"
          height="300"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Map of ${address}`}
        />
      </div>

      {/* Direction buttons */}
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=transit`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-xl hover:bg-blue-100 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 17l-2 4m10-4l2 4M12 2v2m-4 0h8a3 3 0 013 3v8a3 3 0 01-3 3H8a3 3 0 01-3-3V7a3 3 0 013-3z" />
          </svg>
          Transit Directions
        </a>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 text-xs font-medium rounded-xl hover:bg-green-100 transition-colors"
        >
          Walk
        </a>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 text-xs font-medium rounded-xl hover:bg-gray-200 transition-colors"
        >
          Drive
        </a>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=bicycling`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-50 text-orange-700 text-xs font-medium rounded-xl hover:bg-orange-100 transition-colors"
        >
          Bike
        </a>
      </div>
    </section>
  );
}
