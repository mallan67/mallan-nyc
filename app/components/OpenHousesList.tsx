'use client';

import { useState, useEffect } from 'react';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';
import OpenHouseRSVP from '@/app/components/OpenHouseRSVP';

interface OpenHouse {
  id: string;
  address: string;
  neighborhood: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  type: string;
  agentName: string;
  agentPhone: string;
  description: string;
  image: string;
  featured: boolean;
  mallanExclusive?: boolean;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function isUpcoming(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(dateStr + 'T00:00:00');
  return eventDate >= today;
}

export default function OpenHousesList() {
  const [openHouses, setOpenHouses] = useState<OpenHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const gridRef = useGsapReveal<HTMLDivElement>({ children: true, y: 50, scale: 0.97 });

  useEffect(() => {
    fetch('/api/open-houses')
      .then(res => res.json())
      .then(data => {
        setOpenHouses(data.openHouses || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 rounded w-1/3 mx-auto mb-8"></div>
            <div className="grid md:grid-cols-2 gap-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="glass-card rounded-3xl overflow-hidden">
                  <div className="aspect-video bg-gray-200"></div>
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Filter to only show upcoming open houses, sorted by date
  const upcomingOpenHouses = openHouses
    .filter(oh => isUpcoming(oh.date))
    .sort((a, b) => {
      // Featured first, then by date
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

  // Group by date
  const groupedByDate: { [date: string]: OpenHouse[] } = {};
  upcomingOpenHouses.forEach(oh => {
    if (!groupedByDate[oh.date]) {
      groupedByDate[oh.date] = [];
    }
    groupedByDate[oh.date].push(oh);
  });

  const dates = Object.keys(groupedByDate).sort();

  return (
    <>
      {/* Hero Section */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-2xl md:text-3xl font-display font-semibold mb-4">Open Houses</h1>
          <p className="text-lg text-brand-dark/90 max-w-2xl mx-auto">
            Visit our upcoming open houses to explore available properties in person.
            No appointment needed—just stop by during the scheduled times.
          </p>
        </div>
      </section>

      {/* Open Houses List */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          {upcomingOpenHouses.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-brand-dark/85 text-lg mb-4">No upcoming open houses scheduled.</p>
              <p className="text-brand-dark/90">
                Check back soon or contact us for private showings.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {dates.map(date => (
                <div key={date}>
                  <h2 className="text-xl font-display font-semibold mb-6 pb-2 border-b border-black/5">
                    {formatDate(date)}
                  </h2>
                  <div ref={gridRef} className="grid md:grid-cols-2 gap-6">
                    {groupedByDate[date].map(oh => (
                      <div
                        key={oh.id}
                        className="glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300"
                      >
                        {/* Image — native <img> (NOT next/image): the photo is a same-origin proxy
                            URL (/api/media/proxy?url=…cotality…) and next/image's optimizer rejects
                            that nested-query URL with HTTP 400, leaving the card blank. This mirrors
                            IDXImage, which uses a native <img> so listing photos load directly. */}
                        <div className="relative aspect-video bg-gray-100 overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={oh.image || '/images/listing-placeholder.svg'}
                            alt={oh.address}
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                          {oh.mallanExclusive && (
                            <span
                              className="absolute top-3 left-3 z-10 px-3 py-1 bg-brand-gold text-white text-xs font-semibold uppercase tracking-wide rounded-xl shadow-sm"
                              title="Exclusive listing by Mallan Real Estate Inc."
                            >
                              Mallan Exclusive
                            </span>
                          )}
                          {/* Open-house time, Eastern (API formats in America/New_York). */}
                          <div className="absolute bottom-3 right-3 px-3 py-1 bg-black/60 backdrop-blur-sm text-white text-sm rounded-xl">
                            <span className="font-semibold mr-1">Open House</span>
                            {oh.startTime}{oh.endTime ? ` - ${oh.endTime}` : ''}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-5">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="text-xl font-display font-semibold">{formatPrice(oh.price)}</h3>
                              <p className="text-brand-dark/90">{oh.address}</p>
                              <p className="text-brand-dark/85 text-sm">{oh.neighborhood}</p>
                            </div>
                            <span className="px-3 py-1 bg-brand-gold/10 text-brand-gold-deep text-xs rounded-full">
                              {oh.type}
                            </span>
                          </div>

                          {/* Details */}
                          <div className="flex gap-4 text-sm text-brand-dark/90 my-3">
                            <span>{oh.beds} bed{oh.beds !== 1 ? 's' : ''}</span>
                            <span>{oh.baths} bath{oh.baths !== 1 ? 's' : ''}</span>
                            {oh.sqft > 0 && <span>{oh.sqft.toLocaleString()} sqft</span>}
                          </div>

                          {oh.description && (
                            <p className="text-brand-dark/90 text-sm line-clamp-2 mb-3">
                              {oh.description}
                            </p>
                          )}

                          {/* Agent Contact + RSVP */}
                          <div className="pt-3 border-t border-black/5 flex justify-between items-center">
                            <div className="text-sm">
                              <p className="font-medium">{oh.agentName}</p>
                              {oh.agentPhone && (
                                <a
                                  href={`tel:${oh.agentPhone.replace(/[^0-9]/g, '')}`}
                                  className="text-brand-gold hover:underline"
                                >
                                  {oh.agentPhone}
                                </a>
                              )}
                            </div>
                            <OpenHouseRSVP
                              openHouseId={oh.id}
                              listingAddress={oh.address}
                              openHouseDate={oh.date}
                              openHouseTime={`${oh.startTime} - ${oh.endTime}`}
                              variant="button"
                            />
                          </div>
                          {/* REBNY RLS Attribution — UCBA Art. III §2(C): font not smaller than median — median of
                              always-rendered text elements in this card = 14px (tristle gate 2026-06-10); size pinned, lightened to /70. */}
                          <p className="text-sm text-brand-dark/70 mt-2">
                            RLS · Listing Courtesy of {oh.agentName || 'REBNY RLS'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gray-50/50 border-t border-black/5">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-xl md:text-2xl font-display font-semibold mb-4">
            Can&apos;t Make It to an Open House?
          </h2>
          <p className="text-brand-dark/90 mb-8">
            Contact us to schedule a private showing at your convenience.
          </p>
          <a
            href="tel:+16462584460"
            className="inline-block px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors"
          >
            Schedule a Showing
          </a>
        </div>
      </section>
    </>
  );
}
