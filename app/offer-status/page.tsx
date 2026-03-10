'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Inquiry {
  id: string;
  type: string;
  listingAddress: string;
  listingPrice: number | null;
  listingType: string | null;
  status: string;
  submittedAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  submitted: { label: 'Submitted', color: 'text-blue-700', bg: 'bg-blue-50' },
  received: { label: 'Received', color: 'text-blue-700', bg: 'bg-blue-50' },
  reviewing: { label: 'Under Review', color: 'text-amber-700', bg: 'bg-amber-50' },
  agent_assigned: { label: 'Agent Assigned', color: 'text-purple-700', bg: 'bg-purple-50' },
  showing_scheduled: { label: 'Showing Scheduled', color: 'text-indigo-700', bg: 'bg-indigo-50' },
  offer_submitted: { label: 'Offer Submitted', color: 'text-orange-700', bg: 'bg-orange-50' },
  counter_offer: { label: 'Counter Offer', color: 'text-orange-700', bg: 'bg-orange-50' },
  accepted: { label: 'Accepted', color: 'text-green-700', bg: 'bg-green-50' },
  in_contract: { label: 'In Contract', color: 'text-green-700', bg: 'bg-green-50' },
  closed: { label: 'Closed', color: 'text-green-800', bg: 'bg-green-100' },
  declined: { label: 'Declined', color: 'text-red-700', bg: 'bg-red-50' },
  expired: { label: 'Expired', color: 'text-gray-600', bg: 'bg-gray-100' },
  withdrawn: { label: 'Withdrawn', color: 'text-gray-600', bg: 'bg-gray-100' },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || { label: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), color: 'text-gray-700', bg: 'bg-gray-50' };
}

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) return `$${price.toLocaleString()}/mo`;
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  return `$${(price / 1_000).toFixed(0)}K`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    inquiry: 'Inquiry',
    offer: 'Offer',
    schedule: 'Showing Request',
    open_house: 'Open House RSVP',
  };
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function OfferStatusPage() {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/offer-status?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setInquiries([]);
        setFirstName(null);
      } else {
        setInquiries(data.inquiries || []);
        setFirstName(data.firstName || null);
      }
    } catch {
      setError('Unable to connect. Please try again.');
      setInquiries([]);
      setFirstName(null);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-display font-semibold text-brand-dark mb-2">
            Track Your Inquiries
          </h1>
          <p className="text-brand-dark/60 text-sm mb-8">
            Enter the email you used when contacting us to see the status of your inquiries and offers.
          </p>

          {/* Email lookup form */}
          <form onSubmit={handleLookup} className="flex gap-3 mb-10">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 px-4 py-3 rounded-xl ring-1 ring-black/10 focus:ring-brand-gold/50 focus:outline-none text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-brand-dark text-white rounded-xl text-sm font-medium hover:bg-brand-dark/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Looking up...' : 'Look Up'}
            </button>
          </form>

          {error && (
            <div className="text-red-600 text-sm mb-6 px-4 py-3 bg-red-50 rounded-xl">
              {error}
            </div>
          )}

          {/* Results */}
          {searched && !error && (
            <>
              {firstName && (
                <p className="text-brand-dark/80 text-sm mb-4">
                  Hi <span className="font-medium">{firstName}</span>, here are your inquiries:
                </p>
              )}

              {inquiries.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-14 h-14 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <h2 className="text-lg font-medium text-brand-dark/80 mb-2">No inquiries found</h2>
                  <p className="text-brand-dark/50 text-sm mb-6">
                    We couldn&apos;t find any inquiries for this email address.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Link href="/buy" className="px-5 py-2.5 bg-brand-dark text-white rounded-2xl text-sm font-medium hover:bg-brand-dark/90 transition-colors">
                      Browse Sales
                    </Link>
                    <Link href="/rent" className="px-5 py-2.5 ring-1 ring-black/10 text-brand-dark rounded-2xl text-sm font-medium hover:bg-gray-50 transition-colors">
                      Browse Rentals
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {inquiries.map((inq) => {
                    const sc = getStatusConfig(inq.status);
                    const isRental = inq.listingType === 'rental' || inq.listingType === 'rent';
                    return (
                      <div
                        key={inq.id}
                        className="bg-white rounded-2xl ring-1 ring-black/5 p-5 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-brand-dark truncate">
                              {inq.listingAddress}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className="text-xs text-brand-dark/50">
                                {typeLabel(inq.type)}
                              </span>
                              {inq.listingPrice && (
                                <>
                                  <span className="text-brand-dark/20">&middot;</span>
                                  <span className="text-xs font-medium text-brand-dark/70">
                                    {formatPrice(inq.listingPrice, isRental)}
                                  </span>
                                </>
                              )}
                              {inq.listingType && (
                                <>
                                  <span className="text-brand-dark/20">&middot;</span>
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isRental ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                    {isRental ? 'Rental' : 'Sale'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-lg whitespace-nowrap ${sc.bg} ${sc.color}`}>
                            {sc.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-3 text-[11px] text-brand-dark/40">
                          <span>Submitted {formatDate(inq.submittedAt)}</span>
                          {inq.updatedAt !== inq.submittedAt && (
                            <>
                              <span>&middot;</span>
                              <span>Updated {formatDate(inq.updatedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Help text */}
          {!searched && (
            <div className="text-center mt-12">
              <p className="text-brand-dark/40 text-xs">
                Your privacy is important to us. We only show inquiry statuses — no personal information is displayed.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
