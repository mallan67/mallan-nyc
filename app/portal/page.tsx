'use client';

import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

interface PortalUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface PortalListing {
  id: string;
  listing_id: string;
  address: string;
  list_price: string;
  listing_type: string;
  reactions: Record<string, boolean>;
}

interface PortalShowing {
  id: string;
  listing_id: string;
  date: string;
  time: string | null;
  type: string;
  status: string;
  listing: {
    address: string;
    list_price: string;
  };
}

type Tab = 'listings' | 'showings' | 'profile';

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('listings');

  const [listings, setListings] = useState<PortalListing[]>([]);
  const [showings, setShowings] = useState<PortalShowing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [showingsLoading, setShowingsLoading] = useState(false);
  const [reactLoading, setReactLoading] = useState<string | null>(null);

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated || data.principalType !== 'lead') {
          router.replace('/sign-in');
          return;
        }
        setUser(data.user);
        setRole(data.portalRole || data.role);
        setLoading(false);
      })
      .catch(() => router.replace('/sign-in'));
  }, [router]);

  const fetchListings = useCallback(() => {
    setListingsLoading(true);
    fetch('/api/portal/listings')
      .then((r) => r.json())
      .then((data) => setListings(data.listings || []))
      .catch(() => {})
      .finally(() => setListingsLoading(false));
  }, []);

  const fetchShowings = useCallback(() => {
    setShowingsLoading(true);
    fetch('/api/portal/showings')
      .then((r) => r.json())
      .then((data) => setShowings(data.showings || []))
      .catch(() => {})
      .finally(() => setShowingsLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && user) {
      fetchListings();
      fetchShowings();
    }
  }, [loading, user, fetchListings, fetchShowings]);

  async function handleReaction(listingId: string, action: string) {
    setReactLoading(`${listingId}-${action}`);
    try {
      const res = await fetch(`/api/portal/listings/${listingId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        fetchListings();
      }
    } catch {}
    setReactLoading(null);
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/sign-in');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <Header dark />
        <main className="pt-32 pb-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-64 mx-auto" />
              <div className="h-4 bg-gray-100 rounded w-96 mx-auto" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  const roleLabel =
    role === 'buyer' ? 'Buyer' :
    role === 'tenant' ? 'Renter' :
    role === 'seller' ? 'Seller' :
    role === 'landlord' ? 'Landlord' : 'Client';

  const isBuyerOrTenant = role === 'buyer' || role === 'tenant';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'listings', label: isBuyerOrTenant ? 'My Listings' : 'My Properties' },
    { id: 'showings', label: 'Showings' },
    { id: 'profile', label: 'Profile' },
  ];

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-display font-semibold">
                Welcome, {user?.name?.split(' ')[0]}
              </h1>
              <p className="text-brand-dark/50 text-sm mt-1">
                {roleLabel} Portal — Mallan Real Estate
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-brand-dark/50 hover:text-brand-dark transition-colors"
            >
              Sign Out
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-black/5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
                  activeTab === tab.id
                    ? 'border-brand-gold text-brand-dark'
                    : 'border-transparent text-brand-dark/40 hover:text-brand-dark/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Listings Tab */}
          {activeTab === 'listings' && (
            <div>
              {listingsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-24" />
                  ))}
                </div>
              ) : listings.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-12 h-12 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <p className="text-brand-dark/40 mb-2">No listings yet</p>
                  <p className="text-brand-dark/30 text-sm">
                    Your agent will share listings with you here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {listings.map((listing) => (
                    <div
                      key={listing.id}
                      className="bg-white rounded-2xl ring-1 ring-black/5 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {listing.address || 'Address Undisclosed'}
                        </p>
                        <p className="text-brand-dark/50 text-xs mt-1">
                          ${Number(listing.list_price).toLocaleString()}
                          {listing.listing_type === 'rent' ? '/mo' : ''} — {listing.listing_type === 'rent' ? 'Rental' : 'Sale'}
                        </p>
                      </div>

                      {isBuyerOrTenant && (
                        <div className="flex gap-2 flex-shrink-0">
                          {(['liked', 'disliked', 'discuss', 'schedule'] as const).map((action) => {
                            const active = listing.reactions[action];
                            const isLoading = reactLoading === `${listing.id}-${action}`;
                            const labels: Record<string, { icon: string; label: string; activeClass: string }> = {
                              liked: { icon: '❤️', label: 'Like', activeClass: 'bg-red-50 ring-red-200 text-red-600' },
                              disliked: { icon: '👎', label: 'Pass', activeClass: 'bg-gray-100 ring-gray-300 text-gray-600' },
                              discuss: { icon: '💬', label: 'Discuss', activeClass: 'bg-blue-50 ring-blue-200 text-blue-600' },
                              schedule: { icon: '📅', label: 'Tour', activeClass: 'bg-green-50 ring-green-200 text-green-600' },
                            };
                            const cfg = labels[action];
                            return (
                              <button
                                key={action}
                                onClick={() => handleReaction(listing.id, action)}
                                disabled={isLoading}
                                className={`px-3 py-1.5 text-xs rounded-xl ring-1 transition-colors ${
                                  active ? cfg.activeClass : 'bg-white ring-black/10 text-brand-dark/60 hover:bg-gray-50'
                                } ${isLoading ? 'opacity-50' : ''}`}
                                title={active ? `Remove ${cfg.label}` : cfg.label}
                              >
                                {cfg.icon} {cfg.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Showings Tab */}
          {activeTab === 'showings' && (
            <div>
              {showingsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-20" />
                  ))}
                </div>
              ) : showings.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-12 h-12 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-brand-dark/40 mb-2">No showings scheduled</p>
                  <p className="text-brand-dark/30 text-sm">
                    {isBuyerOrTenant
                      ? 'Click "Tour" on a listing to request a showing.'
                      : 'Upcoming showings for your property will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {showings.map((showing) => {
                    const statusColors: Record<string, string> = {
                      requested: 'bg-yellow-50 text-yellow-700',
                      confirmed: 'bg-green-50 text-green-700',
                      completed: 'bg-blue-50 text-blue-700',
                      cancelled: 'bg-red-50 text-red-700',
                    };
                    return (
                      <div
                        key={showing.id}
                        className="bg-white rounded-2xl ring-1 ring-black/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {showing.listing?.address || 'Address Undisclosed'}
                          </p>
                          <p className="text-brand-dark/50 text-xs mt-1">
                            {new Date(showing.date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {showing.time ? ` at ${showing.time}` : ''}
                            {' — '}
                            {showing.type === 'openhouse' ? 'Open House' :
                             showing.type === 'virtual' ? 'Virtual' : 'Private'}
                          </p>
                        </div>
                        <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${statusColors[showing.status] || 'bg-gray-50 text-gray-700'}`}>
                          {showing.status.charAt(0).toUpperCase() + showing.status.slice(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && user && (
            <div className="max-w-lg">
              <div className="bg-white rounded-2xl ring-1 ring-black/5 p-6 space-y-4">
                <div>
                  <label className="text-xs text-brand-dark/40 font-medium">Name</label>
                  <p className="text-sm font-medium mt-0.5">{user.name}</p>
                </div>
                <div>
                  <label className="text-xs text-brand-dark/40 font-medium">Email</label>
                  <p className="text-sm mt-0.5">{user.email}</p>
                </div>
                {user.phone && (
                  <div>
                    <label className="text-xs text-brand-dark/40 font-medium">Phone</label>
                    <p className="text-sm mt-0.5">{user.phone}</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-brand-dark/40 font-medium">Portal Type</label>
                  <p className="text-sm mt-0.5">{roleLabel}</p>
                </div>

                <div className="pt-4 border-t border-black/5">
                  <Link
                    href="/reset-password"
                    className="text-sm text-brand-gold hover:underline"
                  >
                    Change Password
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
