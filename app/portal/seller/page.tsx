'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useAsyncResource } from '@/lib/hooks/useAsyncResource';

/* ───────────── Interfaces ───────────── */

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
  notes?: string;
  listing: {
    address: string;
    list_price: string;
  };
  feedback?: {
    rating: number | null;
    interest_level: string | null;
    notes: string | null;
  } | null;
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
  from: { id: string; name: string; email?: string; phone?: string } | null;
}

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

type Tab = 'dashboard' | 'properties' | 'showings' | 'offers' | 'documents' | 'family' | 'profile';

/* ───────────── Helpers ───────────── */

function fmt$(n: number | string | null | undefined): string {
  if (n == null) return '--';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '--';
  return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  return t;
}

function statusColor(s: string): string {
  switch (s?.toLowerCase()) {
    case 'active': return 'bg-blue-100 text-blue-800';
    case 'pending': case 'offer': return 'bg-orange-100 text-orange-800';
    case 'contract': return 'bg-purple-100 text-purple-800';
    case 'sold': case 'closed': case 'leased': return 'bg-green-100 text-green-800';
    case 'coming soon': case 'comingsoon': return 'bg-yellow-100 text-yellow-800';
    case 'scheduled': case 'confirmed': return 'bg-blue-100 text-blue-800';
    case 'completed': return 'bg-green-100 text-green-800';
    case 'requested': return 'bg-yellow-100 text-yellow-800';
    case 'cancelled': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-700';
  }
}

function demandColor(level: string): string {
  switch (level) {
    case 'high': return 'text-green-600';
    case 'moderate': return 'text-yellow-600';
    case 'low': return 'text-red-600';
    default: return 'text-gray-600';
  }
}

function momentumGaugeColor(tier: string): string {
  switch (tier) {
    case 'hot': return '#ef4444';
    case 'warm': return '#f59e0b';
    case 'moderate': return '#3b82f6';
    case 'cool': return '#6b7280';
    default: return '#9ca3af';
  }
}

/* ───────────── Component ───────────── */

export default function SellerPortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [enabledWorkspaces, setEnabledWorkspaces] = useState<string[]>([]);

  // Each portal data slice is owned by useAsyncResource (typed
  // useReducer state machine — same precedent as AuthProvider). The
  // `userId` key gates the fetch on auth; `null` keeps it idle until
  // the user is loaded. `refetch()` is exposed for handlers that need
  // to force a refresh after a mutation.
  const userId = user?.id ?? null;

  const fetchListingsResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<PortalListing[]> => {
    const res = await fetch('/api/portal/listings', { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.listings || [];
  }, []);
  const listingsRes = useAsyncResource(userId, fetchListingsResource);
  const listings: PortalListing[] = listingsRes.data ?? [];
  const listingsLoading = listingsRes.loading;

  const fetchShowingsResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<PortalShowing[]> => {
    const res = await fetch('/api/portal/showings', { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.showings || [];
  }, []);
  const showingsRes = useAsyncResource(userId, fetchShowingsResource);
  const showings: PortalShowing[] = showingsRes.data ?? [];
  const showingsLoading = showingsRes.loading;

  const fetchOffersResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<Offer[]> => {
    const res = await fetch('/api/portal/offers', { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.offers || [];
  }, []);
  const offersRes = useAsyncResource(userId, fetchOffersResource);
  const offers: Offer[] = offersRes.data ?? [];
  const offersLoading = offersRes.loading;

  const fetchDocumentsResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<PortalDocument[]> => {
    const res = await fetch('/api/portal/documents', { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.documents || [];
  }, []);
  const documentsRes = useAsyncResource(userId, fetchDocumentsResource);
  const documents: PortalDocument[] = documentsRes.data ?? [];
  const documentsLoading = documentsRes.loading;

  const fetchFamilyResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<FamilyMember[]> => {
    const res = await fetch('/api/portal/family', { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.family || [];
  }, []);
  const familyRes = useAsyncResource(userId, fetchFamilyResource);
  const family: FamilyMember[] = familyRes.data ?? [];
  const familyLoading = familyRes.loading;
  const refetchFamily = familyRes.refetch;

  // Dashboard data is fetched per selected listing. Defaults to the
  // first listing once they load; user can switch via the dropdown.
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const dashboardListingId =
    selectedListingId ?? listings[0]?.listing_id ?? null;
  const fetchDashboardResource = useCallback(
    async (key: string | number, signal: AbortSignal) => {
      const listingId = String(key);
      const [fomoRes, demandRes, compsRes, priceRes, mktRes, attRes] = await Promise.allSettled([
        fetch(`/api/portal/seller/fomo?listingId=${listingId}`, { signal }),
        fetch(`/api/portal/seller/demand?listingId=${listingId}`, { signal }),
        fetch(`/api/portal/comparables?listingId=${listingId}`, { signal }),
        fetch(`/api/portal/price-history?listingId=${listingId}`, { signal }),
        fetch(`/api/portal/marketing?listingId=${listingId}`, { signal }),
        fetch('/api/portal/attorney', { signal }),
      ]);
      const out: {
        fomo: SellerFomo | null;
        demand: SellerDemand | null;
        comparables: any;
        priceHistory: any;
        marketing: any[];
        attorney: any;
      } = {
        fomo: null,
        demand: null,
        comparables: null,
        priceHistory: null,
        marketing: [],
        attorney: null,
      };
      if (fomoRes.status === 'fulfilled' && fomoRes.value.ok) out.fomo = await fomoRes.value.json();
      if (demandRes.status === 'fulfilled' && demandRes.value.ok) {
        const d = await demandRes.value.json();
        out.demand = d.demand || d;
      }
      if (compsRes.status === 'fulfilled' && compsRes.value.ok) out.comparables = await compsRes.value.json();
      if (priceRes.status === 'fulfilled' && priceRes.value.ok) out.priceHistory = await priceRes.value.json();
      if (mktRes.status === 'fulfilled' && mktRes.value.ok) {
        const d = await mktRes.value.json();
        out.marketing = d.activities || [];
      }
      if (attRes.status === 'fulfilled' && attRes.value.ok) {
        const d = await attRes.value.json();
        out.attorney = d.attorney || null;
      }
      return out;
    },
    [],
  );
  const dashboardRes = useAsyncResource(dashboardListingId, fetchDashboardResource);
  const sellerFomo: SellerFomo | null = dashboardRes.data?.fomo ?? null;
  const sellerDemand: SellerDemand | null = dashboardRes.data?.demand ?? null;
  const comparables = dashboardRes.data?.comparables ?? null;
  const priceHistory = dashboardRes.data?.priceHistory ?? null;
  const marketing: any[] = dashboardRes.data?.marketing ?? [];
  const attorney = dashboardRes.data?.attorney ?? null;
  const dashboardLoading = dashboardRes.loading;

  // Attorney form mirrors the loaded attorney record. Sync via
  // set-state-during-render with a previous-value guard (React docs
  // canonical pattern, no useEffect needed).
  const [attorneyEditing, setAttorneyEditing] = useState(false);
  const [attorneyForm, setAttorneyForm] = useState({ name: '', email: '', phone: '', firm: '' });
  const [attorneySaving, setAttorneySaving] = useState(false);
  const [prevAttorneyKey, setPrevAttorneyKey] = useState<string | null>(null);
  const attorneyKey = attorney ? JSON.stringify(attorney) : null;
  if (attorneyKey !== prevAttorneyKey) {
    setPrevAttorneyKey(attorneyKey);
    if (attorney) {
      setAttorneyForm({
        name: attorney.name || '',
        email: attorney.email || '',
        phone: attorney.phone || '',
        firm: attorney.firm || '',
      });
    }
  }

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
  const [inviteCouple, setInviteCouple] = useState(false);
  const [inviteFirst, setInviteFirst] = useState('');
  const [inviteLast, setInviteLast] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRelationship, setInviteRelationship] = useState('other');
  const [invite2First, setInvite2First] = useState('');
  const [invite2Last, setInvite2Last] = useState('');
  const [invite2Email, setInvite2Email] = useState('');
  const [invite2Relationship, setInvite2Relationship] = useState('spouse');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

  // What-if calculator local state
  const [whatIfPercent, setWhatIfPercent] = useState(5);

  /* ───────────── Fetch functions ─────────────
     Mount-time fetches (listings/showings/offers/documents/family) and
     the dashboard fetch are owned by useAsyncResource above. The only
     fetch function still living here is `fetchComments`, which is
     parameterised by listing ID and triggered from event handlers
     (not from a useEffect), so it doesn't trigger the React Compiler's
     set-state-in-effect rule. */

  const fetchComments = useCallback(async (listingDbId: string) => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/portal/listings/${listingDbId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch { /* ignore */ }
    setCommentsLoading(false);
  }, []);

  /* ───────────── Auth check on mount ───────────── */

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (!data.authenticated || data.principalType !== 'lead') {
          router.replace('/sign-in');
          return;
        }

        const enabled: string[] = data.enabledWorkspaces || [data.primaryPortalRole || data.portalRole];
        setEnabledWorkspaces(enabled);

        // Check seller workspace access
        if (!enabled.includes('seller') && data.portalRole !== 'seller') {
          router.replace('/portal');
          return;
        }

        setUser({
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          phone: data.user.phone,
        });
        setLoading(false);
      })
      .catch(() => router.replace('/sign-in'));
  }, [router]);

  /* ───────────── Handlers ─────────────
     Listings/showings/offers/documents/family/dashboard data are all
     loaded automatically via useAsyncResource hooks above, keyed off
     `userId` (post-auth) and `dashboardListingId`. No useEffect here. */

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.replace('/sign-in'));
  };

  const handleComment = async (listingDbId: string) => {
    if (!newComment.trim()) return;
    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/portal/listings/${listingDbId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment, parent_id: replyTo }),
      });
      if (res.ok) {
        setNewComment('');
        setReplyTo(null);
        fetchComments(listingDbId);
      }
    } catch { /* ignore */ }
    setCommentSubmitting(false);
  };

  const handleRequestListing = async () => {
    if (!requestUrl && !requestAddress) return;
    setRequestSubmitting(true);
    setRequestMessage('');
    try {
      const res = await fetch('/api/portal/listings/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: requestUrl, address: requestAddress, notes: requestNotes }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequestMessage('Request sent to your agent.');
        setRequestUrl('');
        setRequestAddress('');
        setRequestNotes('');
        setTimeout(() => setShowRequestForm(false), 2000);
      } else {
        setRequestMessage(data.error || 'Failed to send request.');
      }
    } catch {
      setRequestMessage('Network error.');
    }
    setRequestSubmitting(false);
  };

  const handleInviteFamily = async () => {
    if (!inviteFirst || !inviteLast || !inviteEmail) return;
    setInviteSubmitting(true);
    setInviteMessage('');
    try {
      const res = await fetch('/api/portal/family/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: inviteFirst,
          last_name: inviteLast,
          email: inviteEmail,
          relationship: inviteRelationship,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteMessage('Invite sent!');
        setInviteFirst(''); setInviteLast(''); setInviteEmail('');

        // If couple mode, send second invite
        if (inviteCouple && invite2First && invite2Last && invite2Email) {
          await fetch('/api/portal/family/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              first_name: invite2First,
              last_name: invite2Last,
              email: invite2Email,
              relationship: invite2Relationship,
            }),
          });
          setInvite2First(''); setInvite2Last(''); setInvite2Email('');
        }

        refetchFamily();
        setTimeout(() => { setShowInviteForm(false); setInviteMessage(''); }, 2000);
      } else {
        setInviteMessage(data.error || 'Failed to send invite.');
      }
    } catch {
      setInviteMessage('Network error.');
    }
    setInviteSubmitting(false);
  };

  const handleSaveAttorney = async () => {
    setAttorneySaving(true);
    try {
      const res = await fetch('/api/portal/attorney', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attorneyForm),
      });
      if (res.ok) {
        // Persist + refetch — server is the source of truth for the
        // attorney record. The form already holds the new values, but
        // the dashboard resource needs to be re-loaded so the rest of
        // the page sees the update.
        dashboardRes.refetch();
        setAttorneyEditing(false);
      }
    } catch { /* ignore */ }
    setAttorneySaving(false);
  };

  /* ───────────── Loading state ───────────── */

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading your seller portal...</div>
      </div>
    );
  }

  /* ───────────── Tab definitions ───────────── */

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'properties', label: 'My Properties' },
    { key: 'showings', label: 'Showings' },
    { key: 'offers', label: 'Offers' },
    { key: 'documents', label: 'Documents' },
    { key: 'family', label: 'Family' },
    { key: 'profile', label: 'Profile' },
  ];

  // Primary listing for dashboard data
  const primaryListing = listings.length > 0 ? listings[0] : null;

  /* ───────────── Render ───────────── */

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between mb-1">
          <div>
            {enabledWorkspaces.length > 1 && (
              <Link href="/portal" className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-1 inline-block">
                &larr; Back to Portal
              </Link>
            )}
            <h1 className="text-2xl font-bold text-gray-900">
              Seller Portal
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
        <p className="text-gray-500 text-sm mb-8">Manage your listing, view showings, track offers</p>

        {/* ─── Tab bar ─── */}
        <div className="flex gap-1 border-b border-gray-200 mb-8 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === t.key
                  ? 'border-[#B8860B] text-[#B8860B]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
              {t.key === 'offers' && offers.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-700">{offers.length}</span>
              )}
              {t.key === 'showings' && showings.filter(s => s.status === 'scheduled' || s.status === 'confirmed').length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                  {showings.filter(s => s.status === 'scheduled' || s.status === 'confirmed').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════ */}
        {/* ─── DASHBOARD TAB ─── */}
        {/* ═══════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {listings.length === 0 && !listingsLoading && (
              <div className="rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                <p className="text-lg font-medium mb-2">No active listings</p>
                <p className="text-sm">Your agent will add your listing here once it is ready.</p>
              </div>
            )}

            {dashboardLoading && listings.length > 0 && (
              <div className="text-center text-gray-400 text-sm py-8">Loading dashboard data...</div>
            )}

            {primaryListing && !dashboardLoading && (
              <>
                {/* Listing selector if multiple listings */}
                {listings.length > 1 && (
                  <div className="rounded-2xl border border-gray-200 p-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Viewing data for</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={primaryListing.listing_id}
                      onChange={e => {
                        const l = listings.find(x => x.listing_id === e.target.value);
                        if (l) setSelectedListingId(l.listing_id);
                      }}
                    >
                      {listings.map(l => (
                        <option key={l.listing_id} value={l.listing_id}>{l.address} - {fmt$(l.list_price)}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* ─── FOMO Cards ─── */}
                {sellerFomo && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-2xl border border-gray-200 p-4 text-center">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Views (7d)</div>
                      <div className="text-2xl font-bold text-gray-900">{sellerFomo.activity.views7d}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 p-4 text-center">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Saves</div>
                      <div className="text-2xl font-bold text-gray-900">{sellerFomo.activity.saves}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 p-4 text-center">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Days on Market</div>
                      <div className="text-2xl font-bold text-gray-900">{sellerFomo.daysOnMarket}</div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 p-4 text-center">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Demand</div>
                      <div className={`text-2xl font-bold capitalize ${demandColor(sellerFomo.activity.demandLevel)}`}>
                        {sellerFomo.activity.demandLevel}
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── Momentum Gauge ─── */}
                {sellerFomo?.momentum && (
                  <div className="rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">Listing Momentum</h3>
                    <div className="flex items-center gap-6">
                      <div className="relative w-24 h-24 flex-shrink-0">
                        <svg viewBox="0 0 100 100" className="w-full h-full">
                          <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                          <circle
                            cx="50" cy="50" r="42"
                            fill="none"
                            stroke={momentumGaugeColor(sellerFomo.momentum.tier)}
                            strokeWidth="8"
                            strokeDasharray={`${(sellerFomo.momentum.score / 100) * 264} 264`}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                          />
                          <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="text-lg font-bold" fill="#111">
                            {sellerFomo.momentum.score}
                          </text>
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm text-gray-700">
                          Your listing is <span className="font-semibold capitalize" style={{ color: momentumGaugeColor(sellerFomo.momentum.tier) }}>{sellerFomo.momentum.tier}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Top {100 - (sellerFomo.momentum.percentileRank || 0)}% of listings in your area
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── Showings Summary ─── */}
                {sellerFomo && (
                  <div className="rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">Showings Summary</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-green-600">{sellerFomo.showings.completed}</div>
                        <div className="text-xs text-gray-500">Completed</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-600">{sellerFomo.showings.scheduled}</div>
                        <div className="text-xs text-gray-500">Scheduled</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-500">{sellerFomo.showings.cancelled}</div>
                        <div className="text-xs text-gray-500">Cancelled</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── Demand Panel ─── */}
                {sellerDemand && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                    <h3 className="text-sm font-bold text-amber-800 mb-4">Buyer Demand</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-amber-900">{sellerDemand.totalMatchingBuyers}</div>
                        <div className="text-xs text-amber-700">Matching Buyers</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-amber-900">{sellerDemand.exactPriceMatch}</div>
                        <div className="text-xs text-amber-700">Exact Price Match</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-amber-900">{sellerDemand.recentSearchers}</div>
                        <div className="text-xs text-amber-700">Recent Searchers</div>
                      </div>
                      <div>
                        <div className={`text-2xl font-bold ${sellerDemand.demandTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {sellerDemand.demandTrend >= 0 ? '+' : ''}{sellerDemand.demandTrend}%
                        </div>
                        <div className="text-xs text-amber-700">30-Day Trend</div>
                      </div>
                    </div>
                    {sellerDemand.neighborhood && (
                      <div className="mt-3 text-xs text-amber-700">
                        Based on buyer activity in {sellerDemand.neighborhood} ({fmt$(sellerDemand.priceRange.min)} &ndash; {fmt$(sellerDemand.priceRange.max)})
                      </div>
                    )}
                  </div>
                )}

                {/* ─── What-If Price Calculator ─── */}
                {sellerFomo?.whatIf && (
                  <div className="rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">What-If Price Calculator</h3>
                    <div className="text-sm text-gray-600 mb-4">
                      See how a price adjustment could affect buyer interest.
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <label className="text-sm text-gray-600">Reduction:</label>
                      <input
                        type="range"
                        min={1}
                        max={15}
                        value={whatIfPercent}
                        onChange={e => setWhatIfPercent(Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm font-semibold text-gray-800 w-10 text-right">{whatIfPercent}%</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-center">
                        <div className="text-xs text-gray-500 mb-1">Current Price</div>
                        <div className="text-lg font-bold text-gray-900">{fmt$(sellerFomo.whatIf.currentPrice)}</div>
                        <div className="text-sm text-gray-500 mt-1">{sellerFomo.whatIf.currentBuyerMatch} matching buyers</div>
                      </div>
                      <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-center">
                        <div className="text-xs text-green-700 mb-1">At {whatIfPercent}% reduction</div>
                        <div className="text-lg font-bold text-green-800">
                          {fmt$(Math.round(sellerFomo.whatIf.currentPrice * (1 - whatIfPercent / 100)))}
                        </div>
                        <div className="text-sm text-green-600 mt-1">
                          {whatIfPercent === sellerFomo.whatIf.reductionPercent
                            ? `${sellerFomo.whatIf.reducedBuyerMatch} matching buyers (+${sellerFomo.whatIf.additionalBuyers})`
                            : 'Adjust for estimate'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── Market Data ─── */}
                {sellerFomo?.market && (
                  <div className="rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">Local Market Snapshot</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                      <div>
                        <div className="text-lg font-bold text-gray-900">{sellerFomo.market.medianPrice ? fmt$(sellerFomo.market.medianPrice) : '--'}</div>
                        <div className="text-xs text-gray-500">Median Price</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-gray-900">{sellerFomo.market.avgDOM}</div>
                        <div className="text-xs text-gray-500">Avg Days on Market</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-gray-900">{sellerFomo.market.inventory}</div>
                        <div className="text-xs text-gray-500">Inventory</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-gray-900">{sellerFomo.market.closedSales}</div>
                        <div className="text-xs text-gray-500">Closed Sales</div>
                      </div>
                    </div>
                    {/* REBNY UCBA Art. VIII §4 — required statistical disclaimer */}
                    <p className="text-[11px] text-gray-500 mt-4 leading-snug">
                      Based on information from the REBNY Listing Service for the period currently available. Data deemed reliable but not guaranteed.
                    </p>
                  </div>
                )}

                {/* ─── Comparables ─── */}
                {comparables && (
                  <div className="rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">Comparables</h3>

                    {comparables.building?.count > 0 && (
                      <div className="mb-6">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          In Your Building ({comparables.building.address})
                        </h4>
                        <div className="space-y-2">
                          {comparables.building.listings.map((c: any) => (
                            <div key={c.listing_id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                              <div>
                                <div className="text-sm font-medium text-gray-900">{c.address}{c.unit ? ` #${c.unit}` : ''}</div>
                                <div className="text-xs text-gray-500">
                                  {c.bedrooms}BR &middot; {c.bathrooms}BA
                                  {c.living_area ? ` \u00B7 ${c.living_area.toLocaleString()} sqft` : ''}
                                  {c.days_on_market != null ? ` \u00B7 ${c.days_on_market} DOM` : ''}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-gray-900">{fmt$(c.price)}</div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>{c.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {comparables.area?.count > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Nearby in {comparables.area.neighborhood} ({comparables.area.count})
                        </h4>
                        <div className="space-y-2">
                          {comparables.area.listings.map((c: any) => (
                            <div key={c.listing_id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                              <div>
                                <div className="text-sm font-medium text-gray-900">{c.address}{c.unit ? ` #${c.unit}` : ''}</div>
                                <div className="text-xs text-gray-500">
                                  {c.bedrooms}BR &middot; {c.bathrooms}BA
                                  {c.living_area ? ` \u00B7 ${c.living_area.toLocaleString()} sqft` : ''}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-gray-900">{fmt$(c.price)}</div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>{c.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!comparables.building?.count && !comparables.area?.count && (
                      <div className="text-sm text-gray-500 text-center py-4">No comparable listings found yet.</div>
                    )}
                  </div>
                )}

                {/* ─── Price History ─── */}
                {priceHistory && (
                  <div className="rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-4">Price History</h3>
                    <div className="text-sm text-gray-700 mb-3">Current Price: <span className="font-bold">{fmt$(priceHistory.current_price)}</span></div>
                    {priceHistory.history?.length > 0 ? (
                      <div className="space-y-2">
                        {priceHistory.history.map((h: any) => (
                          <div key={h.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {h.change_type === 'increase' ? 'Price Increase' : h.change_type === 'decrease' ? 'Price Decrease' : 'Price Change'}
                              </div>
                              <div className="text-xs text-gray-500">{fmtDate(h.date)}</div>
                              {h.notes && <div className="text-xs text-gray-400 mt-0.5">{h.notes}</div>}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-gray-900">{fmt$(h.price)}</div>
                              {h.previous_price && (
                                <div className={`text-xs ${h.price > h.previous_price ? 'text-green-600' : 'text-red-600'}`}>
                                  from {fmt$(h.previous_price)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 text-center py-2">No price changes recorded.</div>
                    )}
                  </div>
                )}

                {/* ─── Marketing Activities ─── */}
                <div className="rounded-2xl border border-gray-200 p-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-4">Marketing Activities</h3>
                  {marketing.length > 0 ? (
                    <div className="space-y-3">
                      {marketing.map((m: any) => (
                        <div key={m.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                          <div className="w-8 h-8 rounded-full bg-[#B8860B]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs text-[#B8860B] font-bold">
                              {m.type?.charAt(0)?.toUpperCase() || 'M'}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">{m.title || m.type}</div>
                            {m.description && <div className="text-xs text-gray-500 mt-0.5">{m.description}</div>}
                            <div className="text-xs text-gray-400 mt-0.5">
                              {fmtDate(m.completed_at)}{m.agent ? ` \u00B7 ${m.agent}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-4">No marketing activities recorded yet.</div>
                  )}
                </div>

                {/* ─── Attorney Info ─── */}
                <div className="rounded-2xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-700">Attorney Information</h3>
                    {!attorneyEditing && (
                      <button
                        onClick={() => setAttorneyEditing(true)}
                        className="text-xs text-[#B8860B] hover:text-[#8B6914] font-medium"
                      >
                        {attorney ? 'Edit' : 'Add Attorney'}
                      </button>
                    )}
                  </div>

                  {attorneyEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Name</label>
                          <input
                            type="text"
                            value={attorneyForm.name}
                            onChange={e => setAttorneyForm(f => ({ ...f, name: e.target.value }))}
                            className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="Attorney name"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Firm</label>
                          <input
                            type="text"
                            value={attorneyForm.firm}
                            onChange={e => setAttorneyForm(f => ({ ...f, firm: e.target.value }))}
                            className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="Firm name"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Email</label>
                          <input
                            type="email"
                            value={attorneyForm.email}
                            onChange={e => setAttorneyForm(f => ({ ...f, email: e.target.value }))}
                            className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="attorney@firm.com"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Phone</label>
                          <input
                            type="tel"
                            value={attorneyForm.phone}
                            onChange={e => setAttorneyForm(f => ({ ...f, phone: e.target.value }))}
                            className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="(212) 555-0100"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setAttorneyEditing(false)}
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveAttorney}
                          disabled={attorneySaving}
                          className="px-4 py-2 text-sm bg-[#B8860B] text-white rounded-lg hover:bg-[#8B6914] disabled:opacity-50"
                        >
                          {attorneySaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : attorney ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500">Name</div>
                        <div className="text-gray-900">{attorney.name || '--'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Firm</div>
                        <div className="text-gray-900">{attorney.firm || '--'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Email</div>
                        <div className="text-gray-900">{attorney.email || '--'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Phone</div>
                        <div className="text-gray-900">{attorney.phone || '--'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-4">
                      No attorney information on file. Click &ldquo;Add Attorney&rdquo; to add your attorney&apos;s contact details.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ─── MY PROPERTIES TAB ─── */}
        {/* ═══════════════════════════════════════════════════ */}
        {activeTab === 'properties' && (
          <div className="space-y-4">
            {listingsLoading && (
              <div className="text-center text-gray-400 text-sm py-8">Loading listings...</div>
            )}

            {!listingsLoading && listings.length === 0 && (
              <div className="rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                <p className="text-lg font-medium mb-2">No properties yet</p>
                <p className="text-sm">Your agent will share your listing details here.</p>
              </div>
            )}

            {listings.map(listing => (
              <div key={listing.id} className="rounded-2xl border border-gray-200 overflow-hidden">
                {/* Listing card */}
                <div className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-base font-semibold text-gray-900">{listing.address}</div>
                      <div className="text-sm text-gray-500 mt-0.5">{listing.listing_type}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">{fmt$(listing.list_price)}</div>
                      {listing.status && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(listing.status)}`}>
                          {listing.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comments toggle */}
                  <button
                    onClick={() => {
                      if (expandedListing === listing.id) {
                        setExpandedListing(null);
                        setComments([]);
                      } else {
                        setExpandedListing(listing.id);
                        fetchComments(listing.id);
                      }
                    }}
                    className="mt-3 text-xs text-[#B8860B] hover:text-[#8B6914] font-medium"
                  >
                    {expandedListing === listing.id ? 'Hide Comments' : 'View Comments'}
                  </button>
                </div>

                {/* Comments thread (expanded) */}
                {expandedListing === listing.id && (
                  <div className="border-t border-gray-200 bg-gray-50 p-5">
                    {commentsLoading ? (
                      <div className="text-xs text-gray-400 text-center py-3">Loading comments...</div>
                    ) : comments.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center py-3">No comments yet. Start the conversation.</div>
                    ) : (
                      <div className="space-y-3 mb-4">
                        {comments
                          .filter(c => !c.parent_id)
                          .map(c => (
                            <div key={c.id}>
                              <div className={`rounded-xl p-3 ${c.author.isMe ? 'bg-[#B8860B]/5 border border-[#B8860B]/20' : 'bg-white border border-gray-200'}`}>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs font-semibold text-gray-700">{c.author.name}</span>
                                  <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                                </div>
                                <div className="text-sm text-gray-800">{c.body}</div>
                                <button
                                  onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                                  className="text-xs text-[#B8860B] hover:text-[#8B6914] mt-1"
                                >
                                  Reply
                                </button>
                              </div>

                              {/* Replies */}
                              {comments
                                .filter(r => r.parent_id === c.id)
                                .map(r => (
                                  <div key={r.id} className={`ml-6 mt-2 rounded-xl p-3 ${r.author.isMe ? 'bg-[#B8860B]/5 border border-[#B8860B]/20' : 'bg-white border border-gray-200'}`}>
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-xs font-semibold text-gray-700">{r.author.name}</span>
                                      <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>
                                    </div>
                                    <div className="text-sm text-gray-800">{r.body}</div>
                                  </div>
                                ))}

                              {/* Reply input */}
                              {replyTo === c.id && (
                                <div className="ml-6 mt-2 flex gap-2">
                                  <input
                                    type="text"
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleComment(listing.id); }}
                                    placeholder="Write a reply..."
                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                  />
                                  <button
                                    onClick={() => handleComment(listing.id)}
                                    disabled={commentSubmitting || !newComment.trim()}
                                    className="px-3 py-2 text-sm bg-[#B8860B] text-white rounded-lg hover:bg-[#8B6914] disabled:opacity-50"
                                  >
                                    {commentSubmitting ? '...' : 'Send'}
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    {/* New comment input (not a reply) */}
                    {!replyTo && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newComment}
                          onChange={e => setNewComment(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleComment(listing.id); }}
                          placeholder="Add a comment..."
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <button
                          onClick={() => handleComment(listing.id)}
                          disabled={commentSubmitting || !newComment.trim()}
                          className="px-3 py-2 text-sm bg-[#B8860B] text-white rounded-lg hover:bg-[#8B6914] disabled:opacity-50"
                        >
                          {commentSubmitting ? '...' : 'Send'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Listing request form */}
            <div className="mt-6">
              {!showRequestForm ? (
                <button
                  onClick={() => setShowRequestForm(true)}
                  className="w-full py-3 text-sm font-medium text-[#B8860B] border border-[#B8860B] rounded-2xl hover:bg-[#B8860B]/5 transition-colors"
                >
                  Request a Listing Update
                </button>
              ) : (
                <div className="rounded-2xl border border-gray-200 p-5 space-y-3">
                  <h3 className="text-sm font-bold text-gray-700">Request Listing Update</h3>
                  <p className="text-xs text-gray-500">Send a note to your agent about your listing.</p>
                  <div>
                    <label className="text-xs text-gray-500">Listing URL (optional)</label>
                    <input
                      type="url"
                      value={requestUrl}
                      onChange={e => setRequestUrl(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Property Address</label>
                    <input
                      type="text"
                      value={requestAddress}
                      onChange={e => setRequestAddress(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="123 Main St, Apt 4B"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Notes</label>
                    <textarea
                      value={requestNotes}
                      onChange={e => setRequestNotes(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      rows={3}
                      placeholder="What would you like updated?"
                    />
                  </div>
                  {requestMessage && (
                    <div className={`text-xs ${requestMessage.includes('error') || requestMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                      {requestMessage}
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowRequestForm(false); setRequestMessage(''); }}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRequestListing}
                      disabled={requestSubmitting || (!requestUrl && !requestAddress)}
                      className="px-4 py-2 text-sm bg-[#B8860B] text-white rounded-lg hover:bg-[#8B6914] disabled:opacity-50"
                    >
                      {requestSubmitting ? 'Sending...' : 'Send Request'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ─── SHOWINGS TAB ─── */}
        {/* ═══════════════════════════════════════════════════ */}
        {activeTab === 'showings' && (
          <div className="space-y-4">
            {showingsLoading && (
              <div className="text-center text-gray-400 text-sm py-8">Loading showings...</div>
            )}

            {!showingsLoading && showings.length === 0 && (
              <div className="rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                <p className="text-lg font-medium mb-2">No showings yet</p>
                <p className="text-sm">Showings for your property will appear here.</p>
              </div>
            )}

            {showings.map(s => (
              <div key={s.id} className="rounded-2xl border border-gray-200 p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{s.listing.address}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.listing.list_price ? fmt$(s.listing.list_price) : ''}</div>
                    <div className="text-sm text-gray-700 mt-2">
                      {fmtDate(s.date)}{fmtTime(s.time) ? ` at ${fmtTime(s.time)}` : ''}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 capitalize">{s.type} showing</div>
                    {s.notes && <div className="text-xs text-gray-400 mt-1">{s.notes}</div>}
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor(s.status)}`}>
                    {s.status}
                  </span>
                </div>

                {/* Feedback (seller sees feedback after showing) */}
                {s.feedback && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-500 mb-1">Showing Feedback</div>
                    {s.feedback.rating != null && (
                      <div className="text-xs text-gray-600">Rating: {s.feedback.rating}/5</div>
                    )}
                    {s.feedback.interest_level && (
                      <div className="text-xs text-gray-600">Interest: <span className="capitalize">{s.feedback.interest_level}</span></div>
                    )}
                    {s.feedback.notes && (
                      <div className="text-xs text-gray-500 mt-1">{s.feedback.notes}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ─── OFFERS TAB ─── */}
        {/* ═══════════════════════════════════════════════════ */}
        {activeTab === 'offers' && (
          <div className="space-y-4">
            {offersLoading && (
              <div className="text-center text-gray-400 text-sm py-8">Loading offers...</div>
            )}

            {!offersLoading && offers.length === 0 && (
              <div className="rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                <p className="text-lg font-medium mb-2">No offers yet</p>
                <p className="text-sm">When buyers submit offers, they will appear here.</p>
              </div>
            )}

            {offers.map(o => (
              <div key={o.id} className="rounded-2xl border border-gray-200 p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {o.from?.name || 'Anonymous Buyer'}
                    </div>
                    {o.from?.email && <div className="text-xs text-gray-500">{o.from.email}</div>}
                    {o.from?.phone && <div className="text-xs text-gray-500">{o.from.phone}</div>}
                    {o.listing_address && (
                      <div className="text-xs text-gray-500 mt-1">
                        Property: {o.listing_address}
                        {o.list_price ? ` (${fmt$(o.list_price)})` : ''}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">{fmtDate(o.created_at)}</div>
                  </div>
                </div>
                {o.comment && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-700">
                    {o.comment}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ─── DOCUMENTS TAB ─── */}
        {/* ═══════════════════════════════════════════════════ */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            {documentsLoading && (
              <div className="text-center text-gray-400 text-sm py-8">Loading documents...</div>
            )}

            {!documentsLoading && documents.length === 0 && (
              <div className="rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                <p className="text-lg font-medium mb-2">No documents yet</p>
                <p className="text-sm">Documents shared by your agent will appear here.</p>
              </div>
            )}

            {documents.map(doc => (
              <div key={doc.id} className="rounded-2xl border border-gray-200 p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{doc.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{doc.doc_type}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{fmtDate(doc.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(doc.status)}`}>
                      {doc.status}
                    </span>
                    {doc.requires_signature && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                        Signature Required
                      </span>
                    )}
                  </div>
                </div>

                {/* Signature tracking */}
                {doc.signatures.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-500 mb-2">Signatures</div>
                    <div className="space-y-1.5">
                      {doc.signatures.map(sig => (
                        <div key={sig.id} className="flex justify-between items-center text-xs">
                          <div>
                            <span className="font-medium text-gray-700">{sig.signer_name}</span>
                            <span className="text-gray-400 ml-1">({sig.signer_role})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {sig.status === 'signed' ? (
                              <>
                                <span className="text-green-600 font-medium">Signed</span>
                                {sig.signed_at && <span className="text-gray-400">{fmtDate(sig.signed_at)}</span>}
                              </>
                            ) : sig.status === 'pending' ? (
                              <span className="text-yellow-600 font-medium">Pending</span>
                            ) : (
                              <span className="text-gray-500">{sig.status}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Download link */}
                {doc.file_url && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#B8860B] hover:text-[#8B6914] font-medium"
                    >
                      Download Document
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ─── FAMILY TAB ─── */}
        {/* ═══════════════════════════════════════════════════ */}
        {activeTab === 'family' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-700">Family Members</h2>
              {!showInviteForm && (
                <button
                  onClick={() => setShowInviteForm(true)}
                  className="text-xs text-[#B8860B] hover:text-[#8B6914] font-medium"
                >
                  + Invite Family Member
                </button>
              )}
            </div>

            {familyLoading && (
              <div className="text-center text-gray-400 text-sm py-8">Loading family members...</div>
            )}

            {!familyLoading && family.length === 0 && !showInviteForm && (
              <div className="rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
                <p className="text-lg font-medium mb-2">No family members yet</p>
                <p className="text-sm">Invite your spouse, partner, or family to follow along.</p>
              </div>
            )}

            {/* Family member list */}
            {family.map(fm => (
              <div key={fm.id} className="rounded-2xl border border-gray-200 p-4 flex justify-between items-center">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{fm.member.name}</div>
                  <div className="text-xs text-gray-500">{fm.member.email}</div>
                  <div className="text-xs text-gray-400 capitalize mt-0.5">{fm.relationship}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${fm.member.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {fm.member.active ? 'Active' : 'Invited'}
                  </span>
                </div>
              </div>
            ))}

            {/* Invite form */}
            {showInviteForm && (
              <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
                <h3 className="text-sm font-bold text-gray-700">Invite Family Member</h3>

                {/* Single / Couple toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setInviteCouple(false)}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${!inviteCouple ? 'bg-[#B8860B] text-white border-[#B8860B]' : 'text-gray-600 border-gray-300 hover:border-gray-400'}`}
                  >
                    Single Person
                  </button>
                  <button
                    onClick={() => setInviteCouple(true)}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${inviteCouple ? 'bg-[#B8860B] text-white border-[#B8860B]' : 'text-gray-600 border-gray-300 hover:border-gray-400'}`}
                  >
                    Couple
                  </button>
                </div>

                {/* Person 1 */}
                <div className="space-y-3">
                  {inviteCouple && <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Person 1</div>}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">First Name</label>
                      <input
                        type="text"
                        value={inviteFirst}
                        onChange={e => setInviteFirst(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Last Name</label>
                      <input
                        type="text"
                        value={inviteLast}
                        onChange={e => setInviteLast(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Email</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Relationship</label>
                    <select
                      value={inviteRelationship}
                      onChange={e => setInviteRelationship(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="spouse">Spouse</option>
                      <option value="partner">Partner</option>
                      <option value="parent">Parent</option>
                      <option value="child">Child</option>
                      <option value="sibling">Sibling</option>
                      <option value="co-owner">Co-Owner</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Person 2 (couple mode) */}
                {inviteCouple && (
                  <div className="space-y-3 pt-3 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Person 2</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">First Name</label>
                        <input
                          type="text"
                          value={invite2First}
                          onChange={e => setInvite2First(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Last Name</label>
                        <input
                          type="text"
                          value={invite2Last}
                          onChange={e => setInvite2Last(e.target.value)}
                          className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Email</label>
                      <input
                        type="email"
                        value={invite2Email}
                        onChange={e => setInvite2Email(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Relationship</label>
                      <select
                        value={invite2Relationship}
                        onChange={e => setInvite2Relationship(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="spouse">Spouse</option>
                        <option value="partner">Partner</option>
                        <option value="parent">Parent</option>
                        <option value="child">Child</option>
                        <option value="sibling">Sibling</option>
                        <option value="co-owner">Co-Owner</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                )}

                {inviteMessage && (
                  <div className={`text-xs ${inviteMessage.includes('error') || inviteMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                    {inviteMessage}
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowInviteForm(false); setInviteMessage(''); }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInviteFamily}
                    disabled={inviteSubmitting || !inviteFirst || !inviteLast || !inviteEmail}
                    className="px-4 py-2 text-sm bg-[#B8860B] text-white rounded-lg hover:bg-[#8B6914] disabled:opacity-50"
                  >
                    {inviteSubmitting ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* ─── PROFILE TAB ─── */}
        {/* ═══════════════════════════════════════════════════ */}
        {activeTab === 'profile' && user && (
          <div className="rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-700 mb-4">Your Profile</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">Name</div>
                <div className="text-sm font-medium text-gray-900">{user.name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Email</div>
                <div className="text-sm font-medium text-gray-900">{user.email}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Phone</div>
                <div className="text-sm font-medium text-gray-900">{user.phone || '--'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Portal</div>
                <div className="text-sm font-medium text-gray-900">Seller</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Footer ─── */}
        <div className="mt-12 text-center text-xs text-gray-400">
          Mallan Real Estate Inc. &middot; 400 East 90th Street, Suite 17C, New York, NY 10128
        </div>
      </div>
    </div>
  );
}
