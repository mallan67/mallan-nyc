'use client';

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
  status?: string;
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

interface Comment {
  id: string;
  listing_id: string;
  parent_id: string | null;
  body: string;
  author: { id: string; name: string; isMe: boolean };
  created_at: string;
}

interface FamilyMember {
  id: string;
  relationship: string;
  member: {
    id: string;
    name: string;
    email: string;
    active: boolean;
  };
  created_at: string;
}

interface Offer {
  id: string;
  listing_id: string;
  listing_address: string | null;
  list_price: string | null;
  comment: string | null;
  created_at: string;
  from: { id: string; name: string } | null;
}

interface Preferences {
  property_types: string[];
  neighborhoods: string[];
  boroughs: string[];
  min_beds: number | null;
  max_beds: number | null;
  min_baths: number | null;
  min_price: string | null;
  max_price: string | null;
  min_sqft: number | null;
  must_haves: string[];
  deal_breakers: string[];
  notes: string | null;
}

type Tab = 'dashboard' | 'listings' | 'showings' | 'family' | 'preferences' | 'offers' | 'documents' | 'profile';

interface PortalDocument {
  id: string;
  name: string;
  doc_type: string;
  status: string;
  requires_signature: boolean;
  file_url: string | null;
  created_at: string;
  signatures: { id: string; signer_name: string; signer_role: string; status: string; signed_at: string | null }[];
}

interface SellerFomo {
  momentum: { score: number; tier: string; percentileRank: number } | null;
  activity: { views7d: number; saves: number; demandLevel: string };
  showings: { completed: number; scheduled: number; cancelled: number };
  market: { medianPrice: number | null; avgDOM: number; inventory: number; closedSales: number } | null;
  daysOnMarket: number;
  whatIf: { currentPrice: number; reducedPrice: number; currentBuyerMatch: number; reducedBuyerMatch: number; additionalBuyers: number; reductionPercent: number };
}

interface SellerDemand {
  totalMatchingBuyers: number;
  exactPriceMatch: number;
  recentSearchers: number;
  demandTrend: number;
  neighborhood: string | null;
  priceRange: { min: number; max: number };
}

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('listings');
  // Switch to dashboard tab for sellers once role is known
  useEffect(() => {
    if ((role === 'seller' || role === 'landlord') && activeTab === 'listings') {
      setActiveTab('dashboard');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const [listings, setListings] = useState<PortalListing[]>([]);
  const [showings, setShowings] = useState<PortalShowing[]>([]);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [showingsLoading, setShowingsLoading] = useState(false);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [offersLoading, setOffersLoading] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(false);

  // Documents state
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  // Seller dashboard state
  const [sellerFomo, setSellerFomo] = useState<SellerFomo | null>(null);
  const [sellerDemand, setSellerDemand] = useState<SellerDemand | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [comparables, setComparables] = useState<any>(null);
  const [priceHistory, setPriceHistory] = useState<any>(null);
  const [marketing, setMarketing] = useState<any[]>([]);
  const [attorney, setAttorney] = useState<any>(null);
  const [attorneyEditing, setAttorneyEditing] = useState(false);
  const [attorneyForm, setAttorneyForm] = useState({ name: '', email: '', phone: '', firm: '' });
  const [attorneySaving, setAttorneySaving] = useState(false);
  const [reactLoading, setReactLoading] = useState<string | null>(null);

  // Comments state
  const [expandedListing, setExpandedListing] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  // Listing request state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestUrl, setRequestUrl] = useState('');
  const [requestAddress, setRequestAddress] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');

  // Family invite state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteFirst, setInviteFirst] = useState('');
  const [inviteLast, setInviteLast] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRelationship, setInviteRelationship] = useState('other');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

  // Showing request state
  const [showingListingId, setShowingListingId] = useState<string | null>(null);
  const [showingDate, setShowingDate] = useState('');
  const [showingTime, setShowingTime] = useState('');
  const [showingNotes, setShowingNotes] = useState('');
  const [showingSubmitting, setShowingSubmitting] = useState(false);
  const [showingMessage, setShowingMessage] = useState('');

  // Preferences edit state
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [prefForm, setPrefForm] = useState<Preferences>({
    property_types: [], neighborhoods: [], boroughs: [],
    min_beds: null, max_beds: null, min_baths: null,
    min_price: null, max_price: null, min_sqft: null,
    must_haves: [], deal_breakers: [], notes: null,
  });
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated || data.principalType !== 'lead') {
          router.replace('/sign-in');
          return;
        }
        // Redirect to complete-profile if missing phone or role
        if (!data.user?.phone || !data.portalRole) {
          router.replace('/portal/complete-profile');
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

  const fetchFamily = useCallback(() => {
    setFamilyLoading(true);
    fetch('/api/portal/family')
      .then((r) => r.json())
      .then((data) => setFamily(data.family || []))
      .catch(() => {})
      .finally(() => setFamilyLoading(false));
  }, []);

  const fetchOffers = useCallback(() => {
    setOffersLoading(true);
    fetch('/api/portal/offers')
      .then((r) => r.json())
      .then((data) => setOffers(data.offers || []))
      .catch(() => {})
      .finally(() => setOffersLoading(false));
  }, []);

  const fetchDocuments = useCallback(() => {
    setDocumentsLoading(true);
    fetch('/api/portal/documents')
      .then((r) => r.json())
      .then((data) => setDocuments(data.documents || []))
      .catch(() => {})
      .finally(() => setDocumentsLoading(false));
  }, []);

  const fetchDashboard = useCallback((listingId: string) => {
    setDashboardLoading(true);
    const lid = encodeURIComponent(listingId);
    Promise.all([
      fetch(`/api/portal/seller/fomo?listingId=${lid}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/portal/seller/demand?listingId=${lid}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/portal/comparables?listingId=${lid}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/portal/price-history?listingId=${lid}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/portal/marketing?listingId=${lid}`).then((r) => r.json()).catch(() => null),
      fetch('/api/portal/attorney').then((r) => r.json()).catch(() => null),
    ])
      .then(([fomo, demand, comps, prices, mktg, atty]) => {
        if (fomo && !fomo.error) setSellerFomo(fomo);
        if (demand?.demand) setSellerDemand(demand.demand);
        if (comps && !comps.error) setComparables(comps);
        if (prices && !prices.error) setPriceHistory(prices);
        if (mktg?.activities) setMarketing(mktg.activities);
        if (atty?.attorney) {
          setAttorney(atty.attorney);
          setAttorneyForm(atty.attorney);
        }
      })
      .finally(() => setDashboardLoading(false));
  }, []);

  const fetchPreferences = useCallback(() => {
    setPrefsLoading(true);
    fetch('/api/portal/preferences')
      .then((r) => r.json())
      .then((data) => {
        setPreferences(data.preferences || null);
        if (data.preferences) setPrefForm(data.preferences);
      })
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && user) {
      fetchListings();
      fetchShowings();
      fetchFamily();
      if (role === 'seller' || role === 'landlord') { fetchOffers(); fetchDocuments(); }
      if (role === 'buyer' || role === 'tenant') fetchPreferences();
    }
  }, [loading, user, role, fetchListings, fetchShowings, fetchFamily, fetchOffers, fetchPreferences]);

  // Fetch seller dashboard data once listings are loaded
  useEffect(() => {
    if ((role === 'seller' || role === 'landlord') && listings.length > 0 && !sellerFomo) {
      fetchDashboard(listings[0].listing_id);
    }
  }, [role, listings, sellerFomo, fetchDashboard]);

  async function fetchComments(listingId: string) {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/portal/listings/${listingId}/comments`);
      const data = await res.json();
      setComments(data.comments || []);
    } catch {}
    setCommentsLoading(false);
  }

  function toggleComments(listingId: string) {
    if (expandedListing === listingId) {
      setExpandedListing(null);
      setComments([]);
      setReplyTo(null);
    } else {
      setExpandedListing(listingId);
      fetchComments(listingId);
      setReplyTo(null);
    }
    setNewComment('');
  }

  async function submitComment(listingId: string) {
    if (!newComment.trim()) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/portal/listings/${listingId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment.trim(), parent_id: replyTo }),
      });
      if (res.ok) {
        setNewComment('');
        setReplyTo(null);
        fetchComments(listingId);
      }
    } catch {}
    setCommentSubmitting(false);
  }

  async function handleReaction(listingId: string, action: string) {
    setReactLoading(`${listingId}-${action}`);
    try {
      const res = await fetch(`/api/portal/listings/${listingId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) fetchListings();
    } catch {}
    setReactLoading(null);
  }

  async function handleListingRequest(e: React.FormEvent) {
    e.preventDefault();
    setRequestSubmitting(true);
    setRequestMessage('');
    try {
      const res = await fetch('/api/portal/listings/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: requestUrl || undefined,
          address: requestAddress || undefined,
          notes: requestNotes || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequestMessage('Request sent to your agent!');
        setRequestUrl('');
        setRequestAddress('');
        setRequestNotes('');
        setTimeout(() => { setShowRequestForm(false); setRequestMessage(''); }, 2000);
      } else {
        setRequestMessage(data.error || 'Failed to send request.');
      }
    } catch {
      setRequestMessage('Network error. Please try again.');
    }
    setRequestSubmitting(false);
  }

  async function handleFamilyInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteSubmitting(true);
    setInviteMessage('');
    try {
      const res = await fetch('/api/portal/family/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: inviteFirst, last_name: inviteLast,
          email: inviteEmail, relationship: inviteRelationship,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteMessage(`${data.member.name} has been invited!`);
        setInviteFirst(''); setInviteLast(''); setInviteEmail(''); setInviteRelationship('other');
        fetchFamily();
        setTimeout(() => { setShowInviteForm(false); setInviteMessage(''); }, 2000);
      } else {
        setInviteMessage(data.error || 'Failed to send invite.');
      }
    } catch {
      setInviteMessage('Network error. Please try again.');
    }
    setInviteSubmitting(false);
  }

  async function handleShowingRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!showingListingId || !showingDate) return;
    setShowingSubmitting(true);
    setShowingMessage('');
    try {
      const res = await fetch('/api/portal/showings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: showingListingId,
          date: showingDate,
          time: showingTime || undefined,
          notes: showingNotes || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowingMessage('Showing requested! Your agent will confirm.');
        setShowingDate(''); setShowingTime(''); setShowingNotes('');
        fetchShowings();
        setTimeout(() => { setShowingListingId(null); setShowingMessage(''); }, 2000);
      } else {
        setShowingMessage(data.error || 'Failed to request showing.');
      }
    } catch {
      setShowingMessage('Network error. Please try again.');
    }
    setShowingSubmitting(false);
  }

  async function savePreferences(e: React.FormEvent) {
    e.preventDefault();
    setPrefsSaving(true);
    try {
      const res = await fetch('/api/portal/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefForm),
      });
      const data = await res.json();
      if (res.ok) {
        setPreferences(data.preferences);
        setEditingPrefs(false);
      }
    } catch {}
    setPrefsSaving(false);
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/sign-in');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
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
  const isSellerOrLandlord = role === 'seller' || role === 'landlord';

  const tabs: { id: Tab; label: string }[] = [
    ...(isSellerOrLandlord ? [{ id: 'dashboard' as Tab, label: 'Dashboard' }] : []),
    { id: 'listings', label: isBuyerOrTenant ? 'Listings' : 'My Properties' },
    { id: 'showings', label: 'Showings' },
    ...(isSellerOrLandlord ? [{ id: 'offers' as Tab, label: 'Offers' }] : []),
    ...(isSellerOrLandlord ? [{ id: 'documents' as Tab, label: 'Documents' }] : []),
    ...(isBuyerOrTenant ? [{ id: 'preferences' as Tab, label: 'Preferences' }] : []),
    { id: 'family', label: 'Family' },
    { id: 'profile', label: 'Profile' },
  ];

  const reactionConfig = {
    liked: { icon: '\u2764\uFE0F', label: 'Like', activeClass: 'bg-red-50 ring-red-200 text-red-600' },
    disliked: { icon: '\uD83D\uDC4E', label: 'Pass', activeClass: 'bg-gray-100 ring-gray-300 text-gray-600' },
    discuss: { icon: '\uD83D\uDCAC', label: 'Discuss', activeClass: 'bg-blue-50 ring-blue-200 text-blue-600' },
    schedule: { icon: '\uD83D\uDCC5', label: 'Tour', activeClass: 'bg-green-50 ring-green-200 text-green-600' },
  } as const;

  const statusColors: Record<string, string> = {
    requested: 'bg-yellow-50 text-yellow-700',
    confirmed: 'bg-green-50 text-green-700',
    completed: 'bg-blue-50 text-blue-700',
    cancelled: 'bg-red-50 text-red-700',
  };

  const topComments = comments.filter((c) => !c.parent_id);
  const getReplies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  const inputClass = "w-full rounded-xl px-4 py-2.5 bg-gray-50 ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30";

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-display font-semibold">
                Welcome, {user?.name?.split(' ')[0]}
              </h1>
              <p className="text-brand-dark/85 text-sm mt-1">
                {roleLabel} Portal — Mallan Real Estate
              </p>
            </div>
            <button onClick={handleLogout} className="text-sm text-brand-dark/85 hover:text-brand-dark transition-colors">
              Sign Out
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-black/5 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-brand-gold text-brand-dark'
                    : 'border-transparent text-brand-dark/90 hover:text-brand-dark/95'
                }`}
              >
                {tab.label}
                {tab.id === 'family' && family.length > 0 && (
                  <span className="ml-1.5 text-xs bg-brand-gold/10 text-brand-gold px-1.5 py-0.5 rounded-full">{family.length}</span>
                )}
                {tab.id === 'offers' && offers.length > 0 && (
                  <span className="ml-1.5 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">{offers.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── SELLER DASHBOARD TAB ── */}
          {activeTab === 'dashboard' && isSellerOrLandlord && (
            <div>
              {dashboardLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-32" />)}
                </div>
              ) : !sellerFomo && !sellerDemand ? (
                <div className="text-center py-16">
                  <svg className="w-14 h-14 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-brand-dark/90 mb-2">No listing data yet</p>
                  <p className="text-brand-dark/85 text-sm">
                    {listings.length === 0
                      ? 'Your dashboard will come to life once your agent adds your listing. In the meantime, explore the other tabs.'
                      : 'Performance data will appear once your listing receives buyer activity.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* ── Momentum Hero ── */}
                  {sellerFomo?.momentum && (
                    <div className={`rounded-2xl p-6 ${
                      sellerFomo.momentum.tier === 'hot' ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white' :
                      sellerFomo.momentum.tier === 'warm' ? 'bg-gradient-to-br from-amber-400 to-orange-400 text-white' :
                      'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-800'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium opacity-90">Listing Momentum</p>
                          <p className="text-4xl font-extrabold mt-1">{sellerFomo.momentum.score}<span className="text-lg font-medium opacity-75">/100</span></p>
                          <p className="text-sm mt-2 opacity-80">
                            {sellerFomo.momentum.tier === 'hot' ? 'Your listing is generating significant buyer interest' :
                             sellerFomo.momentum.tier === 'warm' ? 'Good activity — buyers are engaging with your listing' :
                             'Activity is slow — consider a price adjustment or fresh photos'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-5xl font-black opacity-20">
                            {sellerFomo.momentum.tier === 'hot' ? '🔥' : sellerFomo.momentum.tier === 'warm' ? '📈' : '📊'}
                          </p>
                          <p className="text-xs opacity-70 mt-2">
                            Top {Math.round(100 - sellerFomo.momentum.percentileRank)}% of listings
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Key Metrics Row ── */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 text-center">
                      <p className="text-[10px] font-semibold text-brand-dark/50 uppercase tracking-widest">Views (7 days)</p>
                      <p className="text-3xl font-extrabold text-brand-dark mt-1">{sellerFomo?.activity.views7d ?? 0}</p>
                    </div>
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 text-center">
                      <p className="text-[10px] font-semibold text-brand-dark/50 uppercase tracking-widest">Saves</p>
                      <p className="text-3xl font-extrabold text-brand-dark mt-1">{sellerFomo?.activity.saves ?? 0}</p>
                    </div>
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 text-center">
                      <p className="text-[10px] font-semibold text-brand-dark/50 uppercase tracking-widest">Showings</p>
                      <p className="text-3xl font-extrabold text-brand-dark mt-1">{sellerFomo?.showings.completed ?? 0}</p>
                      {(sellerFomo?.showings.scheduled ?? 0) > 0 && (
                        <p className="text-[10px] text-green-600 font-medium mt-0.5">+{sellerFomo!.showings.scheduled} scheduled</p>
                      )}
                    </div>
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 p-4 text-center">
                      <p className="text-[10px] font-semibold text-brand-dark/50 uppercase tracking-widest">Days on Market</p>
                      <p className={`text-3xl font-extrabold mt-1 ${
                        (sellerFomo?.daysOnMarket ?? 0) <= 30 ? 'text-green-600' :
                        (sellerFomo?.daysOnMarket ?? 0) <= 60 ? 'text-amber-500' : 'text-red-500'
                      }`}>{sellerFomo?.daysOnMarket ?? 0}</p>
                    </div>
                  </div>

                  {/* ── Buyer Demand Intelligence ── */}
                  {sellerDemand && (
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
                      <div className="px-5 py-4 border-b border-black/5">
                        <h3 className="font-semibold text-sm text-brand-dark">Buyer Demand for Your Property</h3>
                        <p className="text-xs text-brand-dark/50 mt-0.5">
                          Anonymized buyer search activity in {sellerDemand.neighborhood || 'your area'}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-black/5">
                        <div className="p-5 text-center">
                          <p className="text-3xl font-extrabold text-blue-600">{sellerDemand.totalMatchingBuyers}</p>
                          <p className="text-[10px] font-semibold text-brand-dark/50 uppercase mt-1">Active Buyers</p>
                          <p className="text-[10px] text-brand-dark/40 mt-0.5">searching your area & price range</p>
                        </div>
                        <div className="p-5 text-center">
                          <p className="text-3xl font-extrabold text-green-600">{sellerDemand.exactPriceMatch}</p>
                          <p className="text-[10px] font-semibold text-brand-dark/50 uppercase mt-1">Exact Matches</p>
                          <p className="text-[10px] text-brand-dark/40 mt-0.5">budget matches your price</p>
                        </div>
                        <div className="p-5 text-center">
                          <p className="text-3xl font-extrabold text-purple-600">{sellerDemand.recentSearchers}</p>
                          <p className="text-[10px] font-semibold text-brand-dark/50 uppercase mt-1">Recent Searchers</p>
                          <p className="text-[10px] text-brand-dark/40 mt-0.5">active in last 30 days</p>
                        </div>
                      </div>
                      {sellerDemand.demandTrend !== 0 && (
                        <div className={`px-5 py-3 text-xs font-medium ${
                          sellerDemand.demandTrend > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {sellerDemand.demandTrend > 0
                            ? `Demand is up ${sellerDemand.demandTrend}% vs last month — buyer interest is growing`
                            : `Demand is down ${Math.abs(sellerDemand.demandTrend)}% vs last month`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Market Context ── */}
                  {sellerFomo?.market && (
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
                      <div className="px-5 py-4 border-b border-black/5">
                        <h3 className="font-semibold text-sm text-brand-dark">Your Market at a Glance</h3>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-black/5">
                        <div className="p-4 text-center">
                          <p className="text-lg font-bold text-brand-dark">
                            {sellerFomo.market.medianPrice ? `$${(sellerFomo.market.medianPrice / 1000000).toFixed(1)}M` : '—'}
                          </p>
                          <p className="text-[10px] text-brand-dark/50 font-semibold uppercase">Median Price</p>
                        </div>
                        <div className="p-4 text-center">
                          <p className="text-lg font-bold text-brand-dark">{sellerFomo.market.avgDOM}</p>
                          <p className="text-[10px] text-brand-dark/50 font-semibold uppercase">Avg Days to Sell</p>
                        </div>
                        <div className="p-4 text-center">
                          <p className="text-lg font-bold text-brand-dark">{sellerFomo.market.inventory}</p>
                          <p className="text-[10px] text-brand-dark/50 font-semibold uppercase">Competing Listings</p>
                        </div>
                        <div className="p-4 text-center">
                          <p className="text-lg font-bold text-brand-dark">{sellerFomo.market.closedSales}</p>
                          <p className="text-[10px] text-brand-dark/50 font-semibold uppercase">Recent Sales</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── What-If Price Reduction ── */}
                  {sellerFomo?.whatIf && sellerFomo.whatIf.additionalBuyers > 0 && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl ring-1 ring-blue-100 p-5">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm text-blue-900">Price Insight</h4>
                          <p className="text-sm text-blue-800/80 mt-1">
                            A {sellerFomo.whatIf.reductionPercent}% price reduction to <span className="font-semibold">${sellerFomo.whatIf.reducedPrice.toLocaleString()}</span> could unlock <span className="font-bold text-blue-900">{sellerFomo.whatIf.additionalBuyers} additional buyer{sellerFomo.whatIf.additionalBuyers !== 1 ? 's' : ''}</span> currently searching in your area.
                          </p>
                          <p className="text-xs text-blue-600/70 mt-2">
                            Currently {sellerFomo.whatIf.currentBuyerMatch} buyer{sellerFomo.whatIf.currentBuyerMatch !== 1 ? 's' : ''} match your price &rarr; {sellerFomo.whatIf.reducedBuyerMatch} at reduced price
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Demand Level Badge ── */}
                  {sellerFomo?.activity && (
                    <div className={`rounded-2xl p-4 text-center ${
                      sellerFomo.activity.demandLevel === 'high' ? 'bg-green-50 ring-1 ring-green-200' :
                      sellerFomo.activity.demandLevel === 'moderate' ? 'bg-amber-50 ring-1 ring-amber-200' :
                      'bg-gray-50 ring-1 ring-gray-200'
                    }`}>
                      <p className={`text-xs font-bold uppercase tracking-widest ${
                        sellerFomo.activity.demandLevel === 'high' ? 'text-green-700' :
                        sellerFomo.activity.demandLevel === 'moderate' ? 'text-amber-700' :
                        'text-gray-600'
                      }`}>
                        {sellerFomo.activity.demandLevel === 'high' ? 'High Demand' :
                         sellerFomo.activity.demandLevel === 'moderate' ? 'Moderate Demand' : 'Building Interest'}
                      </p>
                      <p className="text-xs text-brand-dark/50 mt-1">
                        Based on buyer search activity, saved listings, and showing requests in your neighborhood
                      </p>
                    </div>
                  )}

                  {/* ── Comparables in Building ── */}
                  {comparables?.building?.listings?.length > 0 && (
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
                      <div className="px-5 py-4 border-b border-black/5">
                        <h3 className="font-semibold text-sm text-brand-dark">In Your Building</h3>
                        <p className="text-xs text-brand-dark/50 mt-0.5">{comparables.building.address} &middot; {comparables.building.count} comparable{comparables.building.count !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="divide-y divide-black/5">
                        {comparables.building.listings.slice(0, 5).map((c: any) => (
                          <div key={c.listing_id} className="px-5 py-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-brand-dark">{c.unit ? `Unit ${c.unit}` : c.address}</p>
                              <p className="text-xs text-brand-dark/50">{c.bedrooms}bd / {c.bathrooms}ba{c.living_area ? ` \u00B7 ${c.living_area.toLocaleString()} sf` : ''}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-brand-dark">${c.price.toLocaleString()}{c.listing_type === 'rent' ? '/mo' : ''}</p>
                              <p className={`text-[10px] font-medium ${c.status === 'Active' ? 'text-green-600' : c.status === 'Closed' || c.status === 'Sold' ? 'text-purple-600' : 'text-gray-500'}`}>
                                {c.status}{c.days_on_market ? ` \u00B7 ${c.days_on_market} DOM` : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Comparables in Area ── */}
                  {comparables?.area?.listings?.length > 0 && (
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
                      <div className="px-5 py-4 border-b border-black/5">
                        <h3 className="font-semibold text-sm text-brand-dark">In {comparables.area.neighborhood}</h3>
                        <p className="text-xs text-brand-dark/50 mt-0.5">{comparables.area.count} comparable listing{comparables.area.count !== 1 ? 's' : ''} in your price range</p>
                      </div>
                      <div className="divide-y divide-black/5">
                        {comparables.area.listings.slice(0, 6).map((c: any) => (
                          <div key={c.listing_id} className="px-5 py-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-brand-dark">{c.address}</p>
                              <p className="text-xs text-brand-dark/50">{c.property_type} &middot; {c.bedrooms}bd / {c.bathrooms}ba{c.living_area ? ` \u00B7 ${c.living_area.toLocaleString()} sf` : ''}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-brand-dark">${c.price.toLocaleString()}</p>
                              <p className={`text-[10px] font-medium ${c.status === 'Active' ? 'text-green-600' : 'text-purple-600'}`}>{c.status}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Price History ── */}
                  {priceHistory?.history?.length > 0 && (
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
                      <div className="px-5 py-4 border-b border-black/5">
                        <h3 className="font-semibold text-sm text-brand-dark">Price History</h3>
                      </div>
                      <div className="divide-y divide-black/5">
                        {priceHistory.history.map((h: any) => {
                          const pctChange = h.previous_price ? Math.round(((h.price - h.previous_price) / h.previous_price) * 100) : null;
                          return (
                            <div key={h.id} className="px-5 py-3 flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-brand-dark">${h.price.toLocaleString()}</p>
                                <p className="text-xs text-brand-dark/50">
                                  {new Date(h.date).toLocaleDateString()} &middot; {h.change_type === 'initial' ? 'Listed' : h.change_type === 'reduction' ? 'Price Reduction' : h.change_type === 'increase' ? 'Price Increase' : 'Correction'}
                                </p>
                              </div>
                              {pctChange !== null && (
                                <span className={`text-xs font-bold ${pctChange < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                  {pctChange > 0 ? '+' : ''}{pctChange}%
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Marketing Activity ── */}
                  {marketing.length > 0 && (
                    <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
                      <div className="px-5 py-4 border-b border-black/5">
                        <h3 className="font-semibold text-sm text-brand-dark">Marketing Activity</h3>
                        <p className="text-xs text-brand-dark/50 mt-0.5">{marketing.length} action{marketing.length !== 1 ? 's' : ''} completed by your agent</p>
                      </div>
                      <div className="divide-y divide-black/5">
                        {marketing.map((m: any) => {
                          const icons: Record<string, string> = {
                            photos: '\uD83D\uDCF7', video: '\uD83C\uDFA5', virtual_tour: '\uD83C\uDF10',
                            streeteasy: '\uD83C\uDFE2', zillow: '\uD83C\uDFE0', social_media: '\uD83D\uDCF1',
                            email_blast: '\u2709\uFE0F', print_ad: '\uD83D\uDCF0', open_house_promo: '\uD83C\uDFE1',
                            broker_tour: '\uD83D\uDC54', price_reduction_notice: '\uD83D\uDCC9',
                          };
                          return (
                            <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                              <span className="text-xl flex-shrink-0">{icons[m.type] || '\u2705'}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-brand-dark">{m.title}</p>
                                {m.description && <p className="text-xs text-brand-dark/50 mt-0.5 truncate">{m.description}</p>}
                              </div>
                              <p className="text-[10px] text-brand-dark/40 flex-shrink-0">{new Date(m.completed_at).toLocaleDateString()}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Attorney Information ── */}
                  <div className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
                    <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-sm text-brand-dark">Attorney Information</h3>
                        <p className="text-xs text-brand-dark/50 mt-0.5">Your real estate attorney for this transaction</p>
                      </div>
                      {!attorneyEditing && (
                        <button onClick={() => setAttorneyEditing(true)} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                          {attorney?.name ? 'Edit' : 'Add Attorney'}
                        </button>
                      )}
                    </div>
                    <div className="p-5">
                      {attorneyEditing ? (
                        <div className="space-y-3">
                          <input value={attorneyForm.name || ''} onChange={(e) => setAttorneyForm({ ...attorneyForm, name: e.target.value })}
                            className="w-full px-3 py-2 text-sm border rounded-xl" placeholder="Attorney Name" />
                          <input value={attorneyForm.firm || ''} onChange={(e) => setAttorneyForm({ ...attorneyForm, firm: e.target.value })}
                            className="w-full px-3 py-2 text-sm border rounded-xl" placeholder="Law Firm" />
                          <input value={attorneyForm.email || ''} onChange={(e) => setAttorneyForm({ ...attorneyForm, email: e.target.value })}
                            className="w-full px-3 py-2 text-sm border rounded-xl" placeholder="Email" type="email" />
                          <input value={attorneyForm.phone || ''} onChange={(e) => setAttorneyForm({ ...attorneyForm, phone: e.target.value })}
                            className="w-full px-3 py-2 text-sm border rounded-xl" placeholder="Phone" type="tel" />
                          <div className="flex gap-2">
                            <button disabled={attorneySaving} onClick={async () => {
                              setAttorneySaving(true);
                              try {
                                await fetch('/api/portal/attorney', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attorneyForm) });
                                setAttorney(attorneyForm);
                                setAttorneyEditing(false);
                              } catch { /* noop */ }
                              setAttorneySaving(false);
                            }} className="px-4 py-2 text-sm font-medium bg-brand-dark text-white rounded-xl disabled:opacity-50">
                              {attorneySaving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={() => { setAttorneyEditing(false); if (attorney) setAttorneyForm(attorney); }}
                              className="px-4 py-2 text-sm text-brand-dark/70 rounded-xl">Cancel</button>
                          </div>
                        </div>
                      ) : attorney?.name ? (
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-brand-dark">{attorney.name}</p>
                          {attorney.firm && <p className="text-xs text-brand-dark/60">{attorney.firm}</p>}
                          {attorney.email && <p className="text-xs text-brand-dark/60">{attorney.email}</p>}
                          {attorney.phone && <p className="text-xs text-brand-dark/60">{attorney.phone}</p>}
                        </div>
                      ) : (
                        <p className="text-xs text-brand-dark/40 text-center py-4">No attorney information added. Click &ldquo;Add Attorney&rdquo; above.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── LISTINGS TAB ── */}
          {activeTab === 'listings' && (
            <div>
              {isBuyerOrTenant && (
                <div className="mb-4 flex gap-2">
                  <button onClick={() => setShowRequestForm(!showRequestForm)}
                    className="px-4 py-2 text-sm font-medium bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors">
                    Send Listing to Agent
                  </button>
                </div>
              )}

              {showRequestForm && (
                <div className="mb-4 bg-white rounded-2xl ring-1 ring-black/5 p-5">
                  <p className="text-sm font-medium mb-3">Send a listing to your agent for review</p>
                  <form onSubmit={handleListingRequest} className="space-y-3">
                    <input type="url" value={requestUrl} onChange={(e) => setRequestUrl(e.target.value)}
                      className={inputClass} placeholder="Listing URL (StreetEasy, Zillow, etc.)" />
                    <input type="text" value={requestAddress} onChange={(e) => setRequestAddress(e.target.value)}
                      className={inputClass} placeholder="Or property address" />
                    <textarea value={requestNotes} onChange={(e) => setRequestNotes(e.target.value)} rows={2}
                      className={`${inputClass} resize-none`} placeholder="Any notes for your agent (optional)" />
                    {requestMessage && (
                      <p className={`text-sm ${requestMessage.includes('sent') ? 'text-green-600' : 'text-red-600'}`}>{requestMessage}</p>
                    )}
                    <div className="flex gap-2">
                      <button type="submit" disabled={requestSubmitting || (!requestUrl && !requestAddress)}
                        className="px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-xl hover:bg-brand-gold/90 transition-colors disabled:opacity-50">
                        {requestSubmitting ? 'Sending...' : 'Send Request'}
                      </button>
                      <button type="button" onClick={() => { setShowRequestForm(false); setRequestMessage(''); }}
                        className="px-4 py-2 text-sm text-brand-dark/90 hover:text-brand-dark rounded-xl">Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              {listingsLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-24" />)}</div>
              ) : listings.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-12 h-12 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <p className="text-brand-dark/90 mb-2">No listings yet</p>
                  <p className="text-brand-dark/85 text-sm">
                    {isBuyerOrTenant ? 'Your agent will share listings with you here.' : 'Your property details will appear here once your agent adds them.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {listings.map((listing) => (
                    <div key={listing.id} className="bg-white rounded-2xl ring-1 ring-black/5 overflow-hidden">
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{listing.address || 'Address Undisclosed'}</p>
                          <p className="text-brand-dark/85 text-xs mt-1">
                            ${Number(listing.list_price).toLocaleString()}{listing.listing_type === 'rent' ? '/mo' : ''} — {listing.listing_type === 'rent' ? 'Rental' : 'Sale'}
                            {listing.status && listing.status !== 'Active' && <span className="ml-2 text-brand-dark/90">({listing.status})</span>}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 flex-wrap">
                          {isBuyerOrTenant && (Object.keys(reactionConfig) as Array<keyof typeof reactionConfig>).map((action) => {
                            const active = listing.reactions[action];
                            const isLoading = reactLoading === `${listing.id}-${action}`;
                            const cfg = reactionConfig[action];
                            return (
                              <button key={action} onClick={() => handleReaction(listing.id, action)} disabled={isLoading}
                                className={`px-3 py-1.5 text-xs rounded-xl ring-1 transition-colors ${active ? cfg.activeClass : 'bg-white ring-black/10 text-brand-dark/90 hover:bg-gray-50'} ${isLoading ? 'opacity-50' : ''}`}
                                title={active ? `Remove ${cfg.label}` : cfg.label}>
                                {cfg.icon} {cfg.label}
                              </button>
                            );
                          })}
                          {isBuyerOrTenant && (
                            <button onClick={() => setShowingListingId(showingListingId === listing.id ? null : listing.id)}
                              className={`px-3 py-1.5 text-xs rounded-xl ring-1 transition-colors ${showingListingId === listing.id ? 'bg-purple-50 ring-purple-200 text-purple-600' : 'bg-white ring-black/10 text-brand-dark/90 hover:bg-gray-50'}`}>
                              Schedule
                            </button>
                          )}
                          <button onClick={() => toggleComments(listing.id)}
                            className={`px-3 py-1.5 text-xs rounded-xl ring-1 transition-colors ${expandedListing === listing.id ? 'bg-blue-50 ring-blue-200 text-blue-600' : 'bg-white ring-black/10 text-brand-dark/90 hover:bg-gray-50'}`}>
                            Comments
                          </button>
                        </div>
                      </div>

                      {/* Showing Request Form */}
                      {showingListingId === listing.id && (
                        <div className="border-t border-black/5 bg-purple-50/30 p-4">
                          <p className="text-sm font-medium mb-3">Request a Showing</p>
                          <form onSubmit={handleShowingRequest} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <input type="date" required value={showingDate} onChange={(e) => setShowingDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className={inputClass} />
                              <input type="text" value={showingTime} onChange={(e) => setShowingTime(e.target.value)}
                                className={inputClass} placeholder="Preferred time (e.g. 2:00 PM)" />
                            </div>
                            <input type="text" value={showingNotes} onChange={(e) => setShowingNotes(e.target.value)}
                              className={inputClass} placeholder="Any notes (optional)" />
                            {showingMessage && (
                              <p className={`text-sm ${showingMessage.includes('requested') ? 'text-green-600' : 'text-red-600'}`}>{showingMessage}</p>
                            )}
                            <div className="flex gap-2">
                              <button type="submit" disabled={showingSubmitting || !showingDate}
                                className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50">
                                {showingSubmitting ? 'Requesting...' : 'Request Showing'}
                              </button>
                              <button type="button" onClick={() => { setShowingListingId(null); setShowingMessage(''); }}
                                className="px-4 py-2 text-sm text-brand-dark/90 hover:text-brand-dark rounded-xl">Cancel</button>
                            </div>
                          </form>
                        </div>
                      )}

                      {/* Comments Section */}
                      {expandedListing === listing.id && (
                        <div className="border-t border-black/5 bg-gray-50/50 p-4">
                          {commentsLoading ? (
                            <div className="animate-pulse space-y-2">
                              <div className="h-4 bg-gray-200 rounded w-3/4" />
                              <div className="h-4 bg-gray-200 rounded w-1/2" />
                            </div>
                          ) : (
                            <>
                              {topComments.length === 0 && (
                                <p className="text-brand-dark/85 text-xs mb-3">No comments yet. Be the first to share your thoughts!</p>
                              )}
                              <div className="space-y-3 max-h-64 overflow-y-auto mb-3">
                                {topComments.map((comment) => (
                                  <div key={comment.id}>
                                    <div className="flex gap-2">
                                      <div className="w-7 h-7 rounded-full bg-brand-gold/10 flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-medium text-brand-gold">{comment.author.name.charAt(0)}</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-xs font-medium">{comment.author.isMe ? 'You' : comment.author.name}</span>
                                          <span className="text-[10px] text-brand-dark/85">{new Date(comment.created_at).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-sm text-brand-dark/95 mt-0.5">{comment.body}</p>
                                        <button onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                                          className="text-[10px] text-brand-gold hover:underline mt-1">Reply</button>
                                      </div>
                                    </div>
                                    {getReplies(comment.id).map((reply) => (
                                      <div key={reply.id} className="ml-9 mt-2 flex gap-2">
                                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                          <span className="text-[10px] font-medium text-brand-dark/90">{reply.author.name.charAt(0)}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-baseline gap-2">
                                            <span className="text-xs font-medium">{reply.author.isMe ? 'You' : reply.author.name}</span>
                                            <span className="text-[10px] text-brand-dark/85">{new Date(reply.created_at).toLocaleDateString()}</span>
                                          </div>
                                          <p className="text-xs text-brand-dark/90 mt-0.5">{reply.body}</p>
                                        </div>
                                      </div>
                                    ))}
                                    {replyTo === comment.id && (
                                      <div className="ml-9 mt-2 flex gap-2">
                                        <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)}
                                          placeholder={`Reply to ${comment.author.name}...`}
                                          className="flex-1 rounded-lg px-3 py-1.5 bg-white ring-1 ring-black/5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(listing.id); } }} />
                                        <button onClick={() => submitComment(listing.id)} disabled={commentSubmitting || !newComment.trim()}
                                          className="px-3 py-1.5 text-xs bg-brand-gold text-white rounded-lg hover:bg-brand-gold/90 disabled:opacity-50">Send</button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {!replyTo && (
                                <div className="flex gap-2">
                                  <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add a comment..."
                                    className="flex-1 rounded-xl px-3 py-2 bg-white ring-1 ring-black/5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(listing.id); } }} />
                                  <button onClick={() => submitComment(listing.id)} disabled={commentSubmitting || !newComment.trim()}
                                    className="px-4 py-2 text-sm bg-brand-gold text-white rounded-xl hover:bg-brand-gold/90 disabled:opacity-50">
                                    {commentSubmitting ? '...' : 'Send'}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SHOWINGS TAB ── */}
          {activeTab === 'showings' && (
            <div>
              {showingsLoading ? (
                <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-20" />)}</div>
              ) : showings.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-12 h-12 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-brand-dark/90 mb-2">No showings scheduled</p>
                  <p className="text-brand-dark/85 text-sm">
                    {isBuyerOrTenant ? 'Click "Schedule" on a listing to request a showing.' : 'Upcoming showings for your property will appear here.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Open Houses section for sellers */}
                  {isSellerOrLandlord && showings.some((s: any) => s.type === 'openhouse') && (
                    <div>
                      <h3 className="text-xs font-bold text-brand-dark/50 uppercase tracking-widest mb-2">Open Houses</h3>
                      <div className="space-y-2">
                        {showings.filter((s: any) => s.type === 'openhouse').map((showing: any) => (
                          <div key={showing.id} className="bg-amber-50 rounded-2xl ring-1 ring-amber-200 p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-sm text-amber-900">
                                  {new Date(showing.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                  {showing.time ? ` at ${showing.time}` : ''}
                                </p>
                                <p className="text-xs text-amber-700 mt-0.5">{showing.listing?.address || 'Your Property'}</p>
                              </div>
                              <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${statusColors[showing.status] || 'bg-gray-50 text-gray-700'}`}>
                                {showing.status.charAt(0).toUpperCase() + showing.status.slice(1)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Private Showings */}
                  <div>
                    {isSellerOrLandlord && showings.some((s: any) => s.type === 'openhouse') && (
                      <h3 className="text-xs font-bold text-brand-dark/50 uppercase tracking-widest mb-2">Private Showings</h3>
                    )}
                    <div className="space-y-2">
                      {showings.filter((s: any) => !isSellerOrLandlord || s.type !== 'openhouse').map((showing: any) => (
                        <div key={showing.id} className="bg-white rounded-2xl ring-1 ring-black/5 p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{showing.listing?.address || 'Address Undisclosed'}</p>
                              <p className="text-brand-dark/85 text-xs mt-1">
                                {new Date(showing.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                {showing.time ? ` at ${showing.time}` : ''}{' — '}
                                {showing.type === 'openhouse' ? 'Open House' : showing.type === 'virtual' ? 'Virtual Tour' : 'Private Showing'}
                              </p>
                              {/* Seller sees showing count, not agent/buyer names */}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Seller-specific: interest level badge */}
                              {isSellerOrLandlord && showing.feedback?.interest_level && (
                                <span className={`inline-flex px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wide ${
                                  showing.feedback.interest_level === 'very_interested' ? 'bg-green-100 text-green-700' :
                                  showing.feedback.interest_level === 'interested' ? 'bg-blue-100 text-blue-700' :
                                  showing.feedback.interest_level === 'neutral' ? 'bg-gray-100 text-gray-600' :
                                  'bg-red-100 text-red-600'
                                }`}>
                                  {showing.feedback.interest_level.replace('_', ' ')}
                                </span>
                              )}
                              <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${statusColors[showing.status] || 'bg-gray-50 text-gray-700'}`}>
                                {showing.status.charAt(0).toUpperCase() + showing.status.slice(1)}
                              </span>
                            </div>
                          </div>
                          {/* Seller-specific: feedback notes */}
                          {isSellerOrLandlord && showing.feedback?.notes && (
                            <div className="mt-3 bg-gray-50 rounded-xl px-3 py-2">
                              <p className="text-[10px] font-semibold text-brand-dark/50 uppercase mb-1">Buyer Feedback</p>
                              <p className="text-xs text-brand-dark/80">{showing.feedback.notes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── OFFERS TAB (Seller/Landlord only) ── */}
          {activeTab === 'offers' && isSellerOrLandlord && (
            <div>
              {offersLoading ? (
                <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-20" />)}</div>
              ) : offers.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-12 h-12 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-brand-dark/90 mb-2">No offers yet</p>
                  <p className="text-brand-dark/85 text-sm">
                    When buyers express interest or submit offers on your property, they will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {offers.map((offer) => (
                    <div key={offer.id} className="bg-white rounded-2xl ring-1 ring-black/5 p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{offer.listing_address || 'Address Undisclosed'}</p>
                          {offer.list_price && (
                            <p className="text-brand-dark/85 text-xs mt-0.5">List Price: ${Number(offer.list_price).toLocaleString()}</p>
                          )}
                          {offer.from && (
                            <p className="text-brand-dark/90 text-xs mt-0.5">From: {offer.from.name}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-orange-50 text-orange-700">Offer</span>
                          <p className="text-[10px] text-brand-dark/85 mt-1">
                            {new Date(offer.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {offer.comment && (
                        <p className="mt-2 text-sm text-brand-dark/90 bg-gray-50 rounded-xl px-3 py-2">{offer.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── DOCUMENTS TAB (Seller/Landlord only) ── */}
          {activeTab === 'documents' && isSellerOrLandlord && (
            <div>
              {documentsLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-20" />)}</div>
              ) : documents.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-12 h-12 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-brand-dark/90 mb-2">No documents yet</p>
                  <p className="text-brand-dark/85 text-sm">
                    Your agent will share agreements, disclosures, and other documents here for your review and signature.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Group by type */}
                  {['contract', 'disclosure', 'co_broke', 'rider', 'amendment', 'other'].map((docType) => {
                    const docsOfType = documents.filter((d) => d.doc_type === docType);
                    if (docsOfType.length === 0) return null;
                    const typeLabels: Record<string, string> = {
                      contract: 'Agreements & Contracts',
                      disclosure: 'Disclosures',
                      co_broke: 'Co-Brokerage Agreements',
                      rider: 'Riders',
                      amendment: 'Amendments',
                      other: 'Other Documents',
                    };
                    return (
                      <div key={docType}>
                        <h3 className="text-xs font-bold text-brand-dark/50 uppercase tracking-widest mb-2">{typeLabels[docType] || docType}</h3>
                        <div className="space-y-2">
                          {docsOfType.map((doc) => {
                            const statusColors: Record<string, string> = {
                              uploaded: 'bg-gray-100 text-gray-600',
                              sent: 'bg-blue-50 text-blue-700',
                              viewed: 'bg-amber-50 text-amber-700',
                              signed: 'bg-green-50 text-green-700',
                              countersigned: 'bg-purple-50 text-purple-700',
                              expired: 'bg-red-50 text-red-600',
                            };
                            const needsAction = doc.requires_signature && doc.status !== 'signed' && doc.status !== 'countersigned';
                            return (
                              <div key={doc.id} className={`bg-white rounded-2xl ring-1 ${needsAction ? 'ring-amber-300 bg-amber-50/30' : 'ring-black/5'} p-4`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium text-sm truncate">{doc.name}</p>
                                      {needsAction && (
                                        <span className="inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-400 text-white uppercase">Action Required</span>
                                      )}
                                    </div>
                                    <p className="text-brand-dark/50 text-xs mt-0.5">
                                      {new Date(doc.created_at).toLocaleDateString()}
                                      {doc.signatures.length > 0 && ` \u00B7 ${doc.signatures.filter((s) => s.status === 'signed').length}/${doc.signatures.length} signed`}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`inline-flex px-2.5 py-1 text-[10px] font-medium rounded-full ${statusColors[doc.status] || 'bg-gray-50 text-gray-700'}`}>
                                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                                    </span>
                                    {doc.file_url && (
                                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                                        className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 rounded-full">
                                        View
                                      </a>
                                    )}
                                  </div>
                                </div>
                                {/* Signature tracking */}
                                {doc.signatures.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-black/5">
                                    <p className="text-[10px] font-semibold text-brand-dark/40 uppercase mb-1.5">Signers</p>
                                    <div className="flex flex-wrap gap-2">
                                      {doc.signatures.map((sig) => (
                                        <span key={sig.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] rounded-full ${
                                          sig.status === 'signed' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                          {sig.status === 'signed' ? '\u2713' : '\u25CB'} {sig.signer_name} ({sig.signer_role})
                                          {sig.signed_at && <span className="text-[9px] opacity-60">{new Date(sig.signed_at).toLocaleDateString()}</span>}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-brand-dark/40 mt-4">
                    Documents are uploaded by your agent. Contact your agent for questions about any disclosure or agreement.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── PREFERENCES TAB (Buyer/Tenant only) ── */}
          {activeTab === 'preferences' && isBuyerOrTenant && (
            <div className="max-w-lg">
              {prefsLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-8 bg-gray-100 rounded w-48" />
                  <div className="h-32 bg-gray-100 rounded-2xl" />
                </div>
              ) : !editingPrefs ? (
                <div className="bg-white rounded-2xl ring-1 ring-black/5 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">Your Search Preferences</h3>
                    <button onClick={() => { setEditingPrefs(true); if (preferences) setPrefForm(preferences); }}
                      className="text-sm text-brand-gold hover:underline">Edit</button>
                  </div>
                  {!preferences ? (
                    <p className="text-brand-dark/90 text-sm">
                      No preferences set yet. Click Edit to tell your agent what you are looking for.
                    </p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      {preferences.boroughs.length > 0 && (
                        <div><span className="text-brand-dark/90 text-xs">Boroughs:</span> <span>{preferences.boroughs.join(', ')}</span></div>
                      )}
                      {preferences.neighborhoods.length > 0 && (
                        <div><span className="text-brand-dark/90 text-xs">Neighborhoods:</span> <span>{preferences.neighborhoods.join(', ')}</span></div>
                      )}
                      {preferences.property_types.length > 0 && (
                        <div><span className="text-brand-dark/90 text-xs">Property Types:</span> <span>{preferences.property_types.join(', ')}</span></div>
                      )}
                      {(preferences.min_price || preferences.max_price) && (
                        <div><span className="text-brand-dark/90 text-xs">Price:</span>{' '}
                          <span>
                            {preferences.min_price ? `$${Number(preferences.min_price).toLocaleString()}` : 'Any'}
                            {' — '}
                            {preferences.max_price ? `$${Number(preferences.max_price).toLocaleString()}` : 'Any'}
                          </span>
                        </div>
                      )}
                      {(preferences.min_beds || preferences.max_beds) && (
                        <div><span className="text-brand-dark/90 text-xs">Bedrooms:</span>{' '}
                          <span>{preferences.min_beds ?? 'Any'} — {preferences.max_beds ?? 'Any'}</span>
                        </div>
                      )}
                      {preferences.min_baths && (
                        <div><span className="text-brand-dark/90 text-xs">Min Bathrooms:</span> <span>{preferences.min_baths}+</span></div>
                      )}
                      {preferences.must_haves.length > 0 && (
                        <div><span className="text-brand-dark/90 text-xs">Must Haves:</span> <span>{preferences.must_haves.join(', ')}</span></div>
                      )}
                      {preferences.deal_breakers.length > 0 && (
                        <div><span className="text-brand-dark/90 text-xs">Deal Breakers:</span> <span className="text-red-600">{preferences.deal_breakers.join(', ')}</span></div>
                      )}
                      {preferences.notes && (
                        <div><span className="text-brand-dark/90 text-xs">Notes:</span> <p className="text-brand-dark/90 mt-0.5">{preferences.notes}</p></div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl ring-1 ring-black/5 p-6">
                  <h3 className="text-sm font-semibold mb-4">Edit Preferences</h3>
                  <form onSubmit={savePreferences} className="space-y-4">
                    <div>
                      <label className="text-xs text-brand-dark/85 font-medium">Boroughs (comma-separated)</label>
                      <input value={prefForm.boroughs.join(', ')}
                        onChange={(e) => setPrefForm({ ...prefForm, boroughs: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        className={inputClass} placeholder="Manhattan, Brooklyn, Queens" />
                    </div>
                    <div>
                      <label className="text-xs text-brand-dark/85 font-medium">Neighborhoods (comma-separated)</label>
                      <input value={prefForm.neighborhoods.join(', ')}
                        onChange={(e) => setPrefForm({ ...prefForm, neighborhoods: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        className={inputClass} placeholder="Upper East Side, Williamsburg" />
                    </div>
                    <div>
                      <label className="text-xs text-brand-dark/85 font-medium">Property Types (comma-separated)</label>
                      <input value={prefForm.property_types.join(', ')}
                        onChange={(e) => setPrefForm({ ...prefForm, property_types: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        className={inputClass} placeholder="Condo, Co-op, Townhouse" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-brand-dark/85 font-medium">Min Price</label>
                        <input type="number" value={prefForm.min_price ?? ''}
                          onChange={(e) => setPrefForm({ ...prefForm, min_price: e.target.value || null })}
                          className={inputClass} placeholder="500000" />
                      </div>
                      <div>
                        <label className="text-xs text-brand-dark/85 font-medium">Max Price</label>
                        <input type="number" value={prefForm.max_price ?? ''}
                          onChange={(e) => setPrefForm({ ...prefForm, max_price: e.target.value || null })}
                          className={inputClass} placeholder="1500000" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-brand-dark/85 font-medium">Min Beds</label>
                        <input type="number" value={prefForm.min_beds ?? ''}
                          onChange={(e) => setPrefForm({ ...prefForm, min_beds: e.target.value ? Number(e.target.value) : null })}
                          className={inputClass} placeholder="1" />
                      </div>
                      <div>
                        <label className="text-xs text-brand-dark/85 font-medium">Max Beds</label>
                        <input type="number" value={prefForm.max_beds ?? ''}
                          onChange={(e) => setPrefForm({ ...prefForm, max_beds: e.target.value ? Number(e.target.value) : null })}
                          className={inputClass} placeholder="3" />
                      </div>
                      <div>
                        <label className="text-xs text-brand-dark/85 font-medium">Min Baths</label>
                        <input type="number" value={prefForm.min_baths ?? ''}
                          onChange={(e) => setPrefForm({ ...prefForm, min_baths: e.target.value ? Number(e.target.value) : null })}
                          className={inputClass} placeholder="1" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-brand-dark/85 font-medium">Must Haves (comma-separated)</label>
                      <input value={prefForm.must_haves.join(', ')}
                        onChange={(e) => setPrefForm({ ...prefForm, must_haves: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        className={inputClass} placeholder="Doorman, Laundry in unit, Outdoor space" />
                    </div>
                    <div>
                      <label className="text-xs text-brand-dark/85 font-medium">Deal Breakers (comma-separated)</label>
                      <input value={prefForm.deal_breakers.join(', ')}
                        onChange={(e) => setPrefForm({ ...prefForm, deal_breakers: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        className={inputClass} placeholder="Walk-up, No pets" />
                    </div>
                    <div>
                      <label className="text-xs text-brand-dark/85 font-medium">Notes</label>
                      <textarea value={prefForm.notes ?? ''} rows={3}
                        onChange={(e) => setPrefForm({ ...prefForm, notes: e.target.value || null })}
                        className={`${inputClass} resize-none`} placeholder="Anything else your agent should know..." />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={prefsSaving}
                        className="px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-xl hover:bg-brand-gold/90 transition-colors disabled:opacity-50">
                        {prefsSaving ? 'Saving...' : 'Save Preferences'}
                      </button>
                      <button type="button" onClick={() => setEditingPrefs(false)}
                        className="px-4 py-2 text-sm text-brand-dark/90 hover:text-brand-dark rounded-xl">Cancel</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ── FAMILY TAB ── */}
          {activeTab === 'family' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-brand-dark/85">Invite family members to view listings and comment together.</p>
                {family.length < 5 && (
                  <button onClick={() => setShowInviteForm(!showInviteForm)}
                    className="px-4 py-2 text-sm font-medium bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors">Invite</button>
                )}
              </div>

              {showInviteForm && (
                <div className="mb-4 bg-white rounded-2xl ring-1 ring-black/5 p-5">
                  <p className="text-sm font-medium mb-3">Invite a family member</p>
                  <form onSubmit={handleFamilyInvite} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text" required value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)}
                        className={inputClass} placeholder="First name" />
                      <input type="text" required value={inviteLast} onChange={(e) => setInviteLast(e.target.value)}
                        className={inputClass} placeholder="Last name" />
                    </div>
                    <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                      className={inputClass} placeholder="Email address" />
                    <select value={inviteRelationship} onChange={(e) => setInviteRelationship(e.target.value)} className={inputClass}>
                      <option value="spouse">Spouse / Partner</option>
                      <option value="parent">Parent</option>
                      <option value="sibling">Sibling</option>
                      <option value="other">Other</option>
                    </select>
                    {inviteMessage && (
                      <p className={`text-sm ${inviteMessage.includes('invited') ? 'text-green-600' : 'text-red-600'}`}>{inviteMessage}</p>
                    )}
                    <div className="flex gap-2">
                      <button type="submit" disabled={inviteSubmitting}
                        className="px-4 py-2 text-sm font-medium bg-brand-gold text-white rounded-xl hover:bg-brand-gold/90 transition-colors disabled:opacity-50">
                        {inviteSubmitting ? 'Sending...' : 'Send Invite'}
                      </button>
                      <button type="button" onClick={() => { setShowInviteForm(false); setInviteMessage(''); }}
                        className="px-4 py-2 text-sm text-brand-dark/90 hover:text-brand-dark rounded-xl">Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              {familyLoading ? (
                <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-16" />)}</div>
              ) : family.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-12 h-12 text-brand-dark/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-brand-dark/90 mb-2">No family members yet</p>
                  <p className="text-brand-dark/85 text-sm">Invite your spouse, parents, or family to view and comment on listings together.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {family.map((fm) => (
                    <div key={fm.id} className="bg-white rounded-2xl ring-1 ring-black/5 p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-brand-gold">{fm.member.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{fm.member.name}</p>
                        <p className="text-brand-dark/90 text-xs">{fm.member.email}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-brand-dark/90 capitalize">{fm.relationship || 'Family'}</span>
                        <span className={`w-2 h-2 rounded-full ${fm.member.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                      </div>
                    </div>
                  ))}
                  {family.length >= 5 && <p className="text-xs text-brand-dark/85 text-center mt-2">Maximum of 5 family members reached.</p>}
                </div>
              )}
            </div>
          )}

          {/* ── PROFILE TAB ── */}
          {activeTab === 'profile' && user && (
            <div className="max-w-lg">
              <div className="bg-white rounded-2xl ring-1 ring-black/5 p-6 space-y-4">
                <div>
                  <label className="text-xs text-brand-dark/90 font-medium">Name</label>
                  <p className="text-sm font-medium mt-0.5">{user.name}</p>
                </div>
                <div>
                  <label className="text-xs text-brand-dark/90 font-medium">Email</label>
                  <p className="text-sm mt-0.5">{user.email}</p>
                </div>
                {user.phone && (
                  <div>
                    <label className="text-xs text-brand-dark/90 font-medium">Phone</label>
                    <p className="text-sm mt-0.5">{user.phone}</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-brand-dark/90 font-medium">Portal Type</label>
                  <p className="text-sm mt-0.5">{roleLabel}</p>
                </div>
                <div className="pt-4 border-t border-black/5">
                  <Link href="/reset-password" className="text-sm text-brand-gold hover:underline">Change Password</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
