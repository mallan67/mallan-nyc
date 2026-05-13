'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePortalSession } from '@/lib/portal/use-portal-session';
import { PortalSessionExpiredError } from '@/lib/portal/portal-fetch';

/* ──────────────────────────────────────────────────────────────────────── *
 *  Types                                                                  *
 * ──────────────────────────────────────────────────────────────────────── */

interface PortalUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  portal_role: string;
  preferences: Record<string, unknown> | null;
}

interface RentalListing {
  id: string;
  listing_id: string;
  address: string | Record<string, string> | null;
  list_price: string | null;
  status: string;
  property_type: string | null;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  listing_type: string | null;
  days_on_market: number | null;
  reactions?: Record<string, boolean>;
  photos?: string[];
}

interface Showing {
  id: string;
  listing_id: string;
  date: string;
  time: string | null;
  type: string;
  status: string;
  notes: string | null;
  listing: {
    id: string;
    listing_id: string;
    address: string | null;
    list_price: string;
    listing_type: string | null;
  };
  feedback?: {
    rating: number | null;
    interest_level: string | null;
    notes: string | null;
  } | null;
}

interface Application {
  id: string;
  listing_id: string;
  listing_address: string | null;
  list_price: string | null;
  comment: string | null;
  created_at: string;
  from: {
    name: string;
    email?: string;
    phone?: string;
  } | null;
}

interface Document {
  id: string;
  name: string;
  doc_type: string;
  status: string;
  requires_signature: boolean;
  file_url: string | null;
  created_at: string;
  signatures: {
    id: string;
    signer_name: string;
    signer_role: string;
    status: string;
    signed_at: string | null;
  }[];
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

interface FomoData {
  listingId: string;
  momentum: { score: number; tier: string; percentileRank: number | null } | null;
  activity: { views7d: number; saves: number; demandLevel: string };
  showings: { completed: number; scheduled: number; cancelled: number };
  market: { medianPrice: number | null; avgDOM: number | null; inventory: number | null; closedSales: number | null } | null;
  daysOnMarket: number;
  whatIf: {
    currentPrice: number;
    reducedPrice: number;
    currentBuyerMatch: number;
    reducedBuyerMatch: number;
    additionalBuyers: number;
    reductionPercent: number;
  };
}

interface DemandData {
  listingId: string;
  demand: {
    totalMatchingBuyers: number;
    exactPriceMatch: number;
    recentSearchers: number;
    demandTrend: number;
    neighborhood: string | null;
    priceRange: { min: number; max: number };
  };
}

interface PriceHistoryEntry {
  id: string;
  price: number;
  previous_price: number | null;
  change_type: string;
  notes: string | null;
  date: string;
}

interface MarketingActivity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  completed_at: string | null;
  agent: string | null;
}

interface ComparableData {
  building: { address: string; count: number; listings: ComparableListing[] };
  area: { neighborhood: string; count: number; listings: ComparableListing[] };
  subject: { listing_id: string; price: number; property_type: string; bedrooms: number };
}

interface ComparableListing {
  listing_id: string;
  address: string | null;
  unit: string | null;
  price: number;
  status: string;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  living_area: number | null;
  days_on_market: number | null;
  listing_type: string | null;
}

interface Comment {
  id: string;
  listing_id: string;
  parent_id: string | null;
  body: string;
  author: { id: string; name: string; isMe: boolean };
  created_at: string;
}

interface Attorney {
  name: string | null;
  email: string | null;
  phone: string | null;
  firm: string | null;
}

/* ──────────────────────────────────────────────────────────────────────── *
 *  Helpers                                                                *
 * ──────────────────────────────────────────────────────────────────────── */

const TAB_LIST = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { id: 'rentals', label: 'My Rentals', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { id: 'showings', label: 'Showings', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'applications', label: 'Applications', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'documents', label: 'Documents', icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { id: 'family', label: 'Family', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
] as const;

function formatAddress(addr: string | Record<string, string> | null): string {
  if (!addr) return 'Address Suppressed';
  if (typeof addr === 'string') return addr;
  const parts = [addr.streetNumber, addr.streetName].filter(Boolean).join(' ');
  const unit = addr.unitNumber ? `, Unit ${addr.unitNumber}` : '';
  const city = addr.city ? `, ${addr.city}` : '';
  return `${parts}${unit}${city}` || 'Address Suppressed';
}

function formatPrice(price: string | number | null): string {
  if (!price) return '--';
  const n = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(n)) return '--';
  return `$${n.toLocaleString('en-US')}`;
}

function formatDate(d: string | null): string {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d: string | null): string {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function rentalStatusColor(status: string): string {
  const s = status?.toLowerCase() || '';
  if (s === 'active') return 'bg-blue-100 text-blue-800';
  if (s === 'pending' || s === 'under contract') return 'bg-orange-100 text-orange-800';
  if (s === 'leased' || s === 'closed') return 'bg-green-100 text-green-800';
  if (s === 'comingsoon') return 'bg-purple-100 text-purple-800';
  if (s === 'withdrawn' || s === 'expired' || s === 'cancelled') return 'bg-gray-100 text-gray-600';
  return 'bg-gray-100 text-gray-700';
}

function showingStatusColor(status: string): string {
  const s = status?.toLowerCase() || '';
  if (s === 'completed') return 'bg-green-100 text-green-800';
  if (s === 'confirmed' || s === 'scheduled') return 'bg-blue-100 text-blue-800';
  if (s === 'requested') return 'bg-yellow-100 text-yellow-800';
  if (s === 'cancelled') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-700';
}

function docStatusColor(status: string): string {
  const s = status?.toLowerCase() || '';
  if (s === 'signed' || s === 'approved' || s === 'completed') return 'bg-green-100 text-green-800';
  if (s === 'pending' || s === 'pending_signature') return 'bg-yellow-100 text-yellow-800';
  if (s === 'draft') return 'bg-gray-100 text-gray-600';
  if (s === 'rejected') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-700';
}

function momentumColor(tier: string): string {
  if (tier === 'hot') return 'text-red-600';
  if (tier === 'warm') return 'text-orange-500';
  if (tier === 'moderate') return 'text-yellow-600';
  return 'text-blue-500';
}

function demandLevelColor(level: string): string {
  if (level === 'high') return 'text-red-600';
  if (level === 'moderate') return 'text-orange-500';
  return 'text-blue-500';
}

/* ──────────────────────────────────────────────────────────────────────── *
 *  SVG Icon helper                                                        *
 * ──────────────────────────────────────────────────────────────────────── */

function TabIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className || 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────── *
 *  Main Component                                                         *
 * ──────────────────────────────────────────────────────────────────────── */

export default function LandlordPortalPage() {
  const router = useRouter();
  // Hotfix 2: portalFetch auto-redirects to /sign-in on 401 instead of
  // letting `.then(r => r.json())` swallow the auth error into the
  // default empty state. Audit B2.
  const { portalFetch } = usePortalSession();

  // ── Auth & profile ──
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMultipleWorkspaces, setHasMultipleWorkspaces] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // ── Data ──
  const [listings, setListings] = useState<RentalListing[]>([]);
  const [showings, setShowings] = useState<Showing[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [attorney, setAttorney] = useState<Attorney | null>(null);
  const [fomo, setFomo] = useState<FomoData | null>(null);
  const [demand, setDemand] = useState<DemandData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [marketing, setMarketing] = useState<MarketingActivity[]>([]);
  const [comparables, setComparables] = useState<ComparableData | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});

  // ── UI state ──
  const [selectedListing, setSelectedListing] = useState<RentalListing | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ first_name: '', last_name: '', email: '', phone: '', relationship: 'spouse' });
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [attorneyEditing, setAttorneyEditing] = useState(false);
  const [attorneyForm, setAttorneyForm] = useState({ name: '', email: '', phone: '', firm: '' });
  const [savingAttorney, setSavingAttorney] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expectedVacancyDays, setExpectedVacancyDays] = useState('');
  const [monthlyCarryingCost, setMonthlyCarryingCost] = useState('');
  const [relistTiming, setRelistTiming] = useState('60_days');
  const [tenantRenewalIntent, setTenantRenewalIntent] = useState('unknown');
  const [ownerDocumentReadiness, setOwnerDocumentReadiness] = useState('not_started');
  const [showingReadiness, setShowingReadiness] = useState('needs_prep');
  const [vacantNow, setVacantNow] = useState(false);
  const [ownerSignalNotes, setOwnerSignalNotes] = useState('');
  const [savingLandlordSignals, setSavingLandlordSignals] = useState(false);

  // ── Show toast ──
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Auth check ── */
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated || data.principalType !== 'lead') {
          router.replace('/sign-in');
          return;
        }

        const enabled: string[] = data.enabledWorkspaces || [data.primaryPortalRole || data.portalRole];
        const portalRole = data.primaryPortalRole || data.portalRole;

        if (!enabled.includes('landlord') && portalRole !== 'landlord') {
          router.replace('/portal');
          return;
        }

        setHasMultipleWorkspaces(enabled.length > 1);
        setLoading(false);
      })
      .catch(() => router.replace('/sign-in'));
  }, [router]);

  /* ── Fetch profile ── */
  // Hotfix 2: every landlord data fetch now routes through portalFetch,
  // which throws PortalSessionExpiredError on 401 and triggers the
  // /sign-in redirect via the hook. The local `catch (err)` keeps the
  // empty-state on transient API errors (4xx/5xx other than 401) so
  // the dashboard degrades gracefully when one endpoint flakes.
  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        const data = await portalFetch<PortalUser>('/api/portal/me');
        if (data.id) setUser(data);
      } catch (err) {
        if (err instanceof PortalSessionExpiredError) return;
        // non-401 errors keep the default profile state
      }
    })();
  }, [loading, portalFetch]);

  /* ── Fetch listings ── */
  const fetchListings = useCallback(async () => {
    try {
      const data = await portalFetch<{ listings?: RentalListing[] }>('/api/portal/listings');
      if (data.listings) {
        // Filter to rental listings
        const rentals = data.listings.filter((l: RentalListing) =>
          l.listing_type?.toLowerCase() === 'rental' || l.listing_type?.toLowerCase() === 'lease'
        );
        setListings(rentals.length > 0 ? rentals : data.listings);
      }
    } catch (err) {
      if (err instanceof PortalSessionExpiredError) return;
    }
  }, [portalFetch]);

  /* ── Fetch showings ── */
  const fetchShowings = useCallback(async () => {
    try {
      const data = await portalFetch<{ showings?: unknown[] }>('/api/portal/showings');
      if (data.showings) setShowings(data.showings as Parameters<typeof setShowings>[0]);
    } catch (err) {
      if (err instanceof PortalSessionExpiredError) return;
    }
  }, [portalFetch]);

  /* ── Fetch applications (offers endpoint) ── */
  const fetchApplications = useCallback(async () => {
    try {
      const data = await portalFetch<{ offers?: unknown[] }>('/api/portal/offers');
      if (data.offers) setApplications(data.offers as Parameters<typeof setApplications>[0]);
    } catch (err) {
      if (err instanceof PortalSessionExpiredError) return;
    }
  }, [portalFetch]);

  /* ── Fetch documents ── */
  const fetchDocuments = useCallback(async () => {
    try {
      const data = await portalFetch<{ documents?: unknown[] }>('/api/portal/documents');
      if (data.documents) setDocuments(data.documents as Parameters<typeof setDocuments>[0]);
    } catch (err) {
      if (err instanceof PortalSessionExpiredError) return;
    }
  }, [portalFetch]);

  /* ── Fetch family ── */
  const fetchFamily = useCallback(async () => {
    try {
      const data = await portalFetch<{ family?: unknown[] }>('/api/portal/family');
      if (data.family) setFamily(data.family as Parameters<typeof setFamily>[0]);
    } catch (err) {
      if (err instanceof PortalSessionExpiredError) return;
    }
  }, [portalFetch]);

  /* ── Fetch attorney ── */
  const fetchAttorney = useCallback(async () => {
    try {
      const data = await portalFetch<{ attorney?: { name?: string; email?: string; phone?: string; firm?: string } }>('/api/portal/attorney');
      if (data.attorney) {
        setAttorney(data.attorney as Parameters<typeof setAttorney>[0]);
        setAttorneyForm({
          name: data.attorney.name || '',
          email: data.attorney.email || '',
          phone: data.attorney.phone || '',
          firm: data.attorney.firm || '',
        });
      }
    } catch (err) {
      if (err instanceof PortalSessionExpiredError) return;
    }
  }, [portalFetch]);

  /* ── Fetch FOMO dashboard for a listing ── */
  const fetchFomo = useCallback((listingId: string) => {
    fetch(`/api/portal/seller/fomo?listingId=${listingId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.listingId) setFomo(data);
      })
      .catch(() => {});
  }, []);

  /* ── Fetch demand ── */
  const fetchDemand = useCallback((listingId: string) => {
    fetch(`/api/portal/seller/demand?listingId=${listingId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.demand) setDemand(data);
      })
      .catch(() => {});
  }, []);

  /* ── Fetch price history ── */
  const fetchPriceHistory = useCallback((listingId: string) => {
    fetch(`/api/portal/price-history?listingId=${listingId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.history) setPriceHistory(data.history);
      })
      .catch(() => {});
  }, []);

  /* ── Fetch marketing ── */
  const fetchMarketing = useCallback((listingId: string) => {
    fetch(`/api/portal/marketing?listingId=${listingId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.activities) setMarketing(data.activities);
      })
      .catch(() => {});
  }, []);

  /* ── Fetch comparables ── */
  const fetchComparables = useCallback((listingId: string) => {
    fetch(`/api/portal/comparables?listingId=${listingId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.building) setComparables(data);
      })
      .catch(() => {});
  }, []);

  /* ── Fetch comments for a listing ── */
  const fetchComments = useCallback((listingDbId: string) => {
    fetch(`/api/portal/listings/${listingDbId}/comments`)
      .then((r) => r.json())
      .then((data) => {
        if (data.comments) {
          setComments((prev) => ({ ...prev, [listingDbId]: data.comments }));
        }
      })
      .catch(() => {});
  }, []);

  /* ── Load data on mount ── */
  useEffect(() => {
    if (loading) return;
    fetchListings();
    fetchShowings();
    fetchApplications();
    fetchDocuments();
    fetchFamily();
    fetchAttorney();
  }, [loading, fetchListings, fetchShowings, fetchApplications, fetchDocuments, fetchFamily, fetchAttorney]);

  /* ── Load dashboard data when a listing is selected ── */
  useEffect(() => {
    if (!selectedListing) return;
    const lid = selectedListing.listing_id;
    fetchFomo(lid);
    fetchDemand(lid);
    fetchPriceHistory(lid);
    fetchMarketing(lid);
    fetchComparables(lid);
    fetchComments(selectedListing.id);
  }, [selectedListing, fetchFomo, fetchDemand, fetchPriceHistory, fetchMarketing, fetchComparables, fetchComments]);

  /* ── Auto-select first listing for dashboard ── */
  useEffect(() => {
    if (listings.length > 0 && !selectedListing) {
      setSelectedListing(listings[0]);
    }
  }, [listings, selectedListing]);

  /* ── Post comment ── */
  const handlePostComment = async () => {
    if (!commentText.trim() || !selectedListing) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/portal/listings/${selectedListing.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentText.trim() }),
      });
      if (res.ok) {
        setCommentText('');
        fetchComments(selectedListing.id);
        showToast('Comment posted');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to post comment');
      }
    } catch {
      showToast('Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  /* ── Invite family member ── */
  const handleInvite = async () => {
    if (!inviteForm.first_name || !inviteForm.last_name || !inviteForm.email) {
      showToast('First name, last name, and email are required');
      return;
    }
    setInviteSubmitting(true);
    try {
      const res = await fetch('/api/portal/family/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });
      if (res.ok) {
        setInviteOpen(false);
        setInviteForm({ first_name: '', last_name: '', email: '', phone: '', relationship: 'spouse' });
        fetchFamily();
        showToast('Invitation sent');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to send invitation');
      }
    } catch {
      showToast('Failed to send invitation');
    } finally {
      setInviteSubmitting(false);
    }
  };

  /* ── Save attorney ── */
  const handleSaveAttorney = async () => {
    setSavingAttorney(true);
    try {
      const res = await fetch('/api/portal/attorney', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attorneyForm),
      });
      if (res.ok) {
        setAttorneyEditing(false);
        fetchAttorney();
        showToast('Attorney info saved');
      } else {
        showToast('Failed to save attorney info');
      }
    } catch {
      showToast('Failed to save attorney info');
    } finally {
      setSavingAttorney(false);
    }
  };

  const handleSaveLandlordSignals = async () => {
    setSavingLandlordSignals(true);
    try {
      const res = await fetch('/api/portal/landlord/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: selectedListing?.listing_id,
          monthly_rent: selectedListing?.list_price,
          expected_vacancy_days: expectedVacancyDays,
          monthly_carrying_cost: monthlyCarryingCost,
          lease_end_date: null,
          relist_timing: relistTiming,
          tenant_renewal_intent: tenantRenewalIntent,
          document_readiness: ownerDocumentReadiness,
          showing_readiness: showingReadiness,
          vacant_now: vacantNow,
          owner_notes: ownerSignalNotes,
        }),
      });
      if (res.ok) {
        showToast('Owner workflow saved');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to save owner workflow');
      }
    } catch {
      showToast('Failed to save owner workflow');
    } finally {
      setSavingLandlordSignals(false);
    }
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-500 text-sm">Loading your portal...</span>
        </div>
      </div>
    );
  }

  /* ──────────────────────────────────────────────────────────────────── *
   *  Render                                                             *
   * ──────────────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm animate-fade-in">
          {toast}
        </div>
      )}

      {/* ── Top header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              {hasMultipleWorkspaces && (
                <button
                  onClick={() => router.push('/portal')}
                  className="text-gray-400 hover:text-gray-600 transition-colors mr-1"
                  title="Back to Portal"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-green-700">Landlord Portal</span>
                {user && (
                  <span className="text-sm text-gray-500 hidden sm:inline">
                    &mdash; {user.first_name} {user.last_name}
                  </span>
                )}
              </div>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {TAB_LIST.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <TabIcon d={tab.icon} className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={mobileMenuOpen ? 'M6 18L18 6M6 6l12 12' : 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5'} />
              </svg>
            </button>

            <button
              onClick={() => {
                fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.replace('/sign-in'));
              }}
              className="hidden md:block text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white px-4 py-2 space-y-1">
            {TAB_LIST.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <TabIcon d={tab.icon} className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => {
                fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.replace('/sign-in'));
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              Sign Out
            </button>
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* ════════════════════════════════════════════════════════════ *
         *  DASHBOARD TAB                                               *
         * ════════════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              Welcome{user ? `, ${user.first_name}` : ''}
            </h2>
            <p className="text-sm text-gray-500 mb-6">Your rental property performance at a glance</p>

            {/* Listing selector */}
            {listings.length > 1 && (
              <div className="mb-6">
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Select Property</label>
                <select
                  value={selectedListing?.listing_id || ''}
                  onChange={(e) => {
                    const l = listings.find((l) => l.listing_id === e.target.value);
                    if (l) setSelectedListing(l);
                  }}
                  className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  {listings.map((l) => (
                    <option key={l.listing_id} value={l.listing_id}>
                      {formatAddress(l.address)} &mdash; {formatPrice(l.list_price)}/mo
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!selectedListing && listings.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No rental listings found. Your agent will add your properties here.</p>
              </div>
            )}

            {selectedListing && (
              <div className="space-y-6">
                {/* Current listing header */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{formatAddress(selectedListing.address)}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-lg font-bold text-green-700">{formatPrice(selectedListing.list_price)}/mo</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rentalStatusColor(selectedListing.status)}`}>
                          {selectedListing.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {selectedListing.bedrooms_total != null && <span>{selectedListing.bedrooms_total} bed</span>}
                        {selectedListing.bathrooms_full != null && <span> &middot; {selectedListing.bathrooms_full} bath</span>}
                        {selectedListing.property_type && <span> &middot; {selectedListing.property_type}</span>}
                      </div>
                    </div>
                    {fomo && (
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Days on Market</div>
                        <div className="text-2xl font-bold text-gray-900">{fomo.daysOnMarket}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* FOMO Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Momentum */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs font-semibold text-gray-500 mb-1">Momentum</div>
                    {fomo?.momentum ? (
                      <>
                        <div className={`text-2xl font-bold ${momentumColor(fomo.momentum.tier)}`}>
                          {fomo.momentum.score}
                        </div>
                        <div className="text-xs text-gray-500 capitalize">{fomo.momentum.tier}</div>
                      </>
                    ) : (
                      <div className="text-gray-400 text-sm">--</div>
                    )}
                  </div>

                  {/* Activity */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs font-semibold text-gray-500 mb-1">Activity (7d)</div>
                    {fomo ? (
                      <>
                        <div className="text-2xl font-bold text-gray-900">{fomo.activity.views7d}</div>
                        <div className="text-xs text-gray-500">
                          {fomo.activity.saves} saves &middot;{' '}
                          <span className={demandLevelColor(fomo.activity.demandLevel)}>{fomo.activity.demandLevel}</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-gray-400 text-sm">--</div>
                    )}
                  </div>

                  {/* Showings */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs font-semibold text-gray-500 mb-1">Showings</div>
                    {fomo ? (
                      <>
                        <div className="text-2xl font-bold text-gray-900">{fomo.showings.completed}</div>
                        <div className="text-xs text-gray-500">
                          {fomo.showings.scheduled} upcoming &middot; {fomo.showings.cancelled} cancelled
                        </div>
                      </>
                    ) : (
                      <div className="text-gray-400 text-sm">--</div>
                    )}
                  </div>

                  {/* Market */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="text-xs font-semibold text-gray-500 mb-1">Market</div>
                    {fomo?.market ? (
                      <>
                        <div className="text-2xl font-bold text-gray-900">
                          {fomo.market.medianPrice ? formatPrice(fomo.market.medianPrice) : '--'}
                        </div>
                        <div className="text-xs text-gray-500">
                          Avg {fomo.market.avgDOM || '--'} DOM &middot; {fomo.market.inventory ?? '--'} active
                        </div>
                      </>
                    ) : (
                      <div className="text-gray-400 text-sm">--</div>
                    )}
                  </div>
                </div>
                {/* REBNY UCBA Art. VIII §4 — required statistical disclaimer for the Market card */}
                {fomo?.market && (
                  <p className="text-[11px] text-gray-500 leading-snug">
                    Based on information from the REBNY Listing Service for the period currently available. Data deemed reliable but not guaranteed.
                  </p>
                )}

                {/* Demand & What-If row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Demand */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">Renter Demand</h4>
                    {demand ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Matching Renters</span>
                          <span className="font-semibold text-gray-900">{demand.demand.totalMatchingBuyers}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Exact Rent Match</span>
                          <span className="font-semibold text-gray-900">{demand.demand.exactPriceMatch}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Active Searchers (30d)</span>
                          <span className="font-semibold text-gray-900">{demand.demand.recentSearchers}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Demand Trend</span>
                          <span className={`font-semibold ${demand.demand.demandTrend > 0 ? 'text-green-600' : demand.demand.demandTrend < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                            {demand.demand.demandTrend > 0 ? '+' : ''}{demand.demand.demandTrend}%
                          </span>
                        </div>
                        {demand.demand.neighborhood && (
                          <div className="text-xs text-gray-400 pt-1 border-t">
                            Data for {demand.demand.neighborhood} &middot; {formatPrice(demand.demand.priceRange.min)} - {formatPrice(demand.demand.priceRange.max)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm">No demand data available yet.</p>
                    )}
                  </div>

                  {/* What-If */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">What If...?</h4>
                    {fomo?.whatIf && fomo.whatIf.currentPrice > 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                          If you reduced your monthly rent by {fomo.whatIf.reductionPercent}%
                          (from {formatPrice(fomo.whatIf.currentPrice)}/mo to {formatPrice(fomo.whatIf.reducedPrice)}/mo):
                        </p>
                        <div className="bg-green-50 rounded-lg p-3">
                          <div className="text-sm text-green-800">
                            <strong>{fomo.whatIf.additionalBuyers}</strong> additional matching renters
                          </div>
                          <div className="text-xs text-green-600 mt-1">
                            {fomo.whatIf.currentBuyerMatch} current &rarr; {fomo.whatIf.reducedBuyerMatch} after reduction
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm">Rent price scenario not available.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-gray-700">Owner Workflow</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Share vacancy, renewal, document, and showing readiness signals with your agent.</p>
                    </div>
                    <button
                      onClick={handleSaveLandlordSignals}
                      disabled={savingLandlordSignals}
                      className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {savingLandlordSignals ? 'Saving...' : 'Save Workflow'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Expected Vacancy Days</label>
                      <input
                        type="number"
                        value={expectedVacancyDays}
                        onChange={(e) => setExpectedVacancyDays(e.target.value)}
                        placeholder="0"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Monthly Carrying Cost</label>
                      <input
                        type="number"
                        value={monthlyCarryingCost}
                        onChange={(e) => setMonthlyCarryingCost(e.target.value)}
                        placeholder="$0"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Relist Timing</label>
                      <select
                        value={relistTiming}
                        onChange={(e) => setRelistTiming(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="now">Now</option>
                        <option value="30_days">30 Days</option>
                        <option value="60_days">60 Days</option>
                        <option value="90_days">90 Days</option>
                        <option value="after_renewal_decision">After Renewal Decision</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Tenant Renewal</label>
                      <select
                        value={tenantRenewalIntent}
                        onChange={(e) => setTenantRenewalIntent(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="renewing">Renewing</option>
                        <option value="not_renewing">Not Renewing</option>
                        <option value="negotiating">Negotiating</option>
                        <option value="month_to_month">Month to Month</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Document Readiness</label>
                      <select
                        value={ownerDocumentReadiness}
                        onChange={(e) => setOwnerDocumentReadiness(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="not_started">Not Started</option>
                        <option value="collecting">Collecting</option>
                        <option value="mostly_ready">Mostly Ready</option>
                        <option value="ready">Ready</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Showing Readiness</label>
                      <select
                        value={showingReadiness}
                        onChange={(e) => setShowingReadiness(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="needs_prep">Needs Prep</option>
                        <option value="tenant_coordination">Tenant Coordination</option>
                        <option value="ready">Ready</option>
                        <option value="restricted">Restricted Access</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={vacantNow}
                        onChange={(e) => setVacantNow(e.target.checked)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      Vacant now
                    </label>
                    <div className="bg-green-50 rounded-lg px-3 py-2">
                      <div className="text-xs text-green-700 font-semibold">Estimated Vacancy Cost</div>
                      <div className="text-sm font-bold text-green-900">
                        {(() => {
                          const rent = Number(selectedListing.list_price) || Number(monthlyCarryingCost) || 0;
                          const days = Number(expectedVacancyDays) || 0;
                          return days > 0 ? formatPrice((rent / 30) * days) : '--';
                        })()}
                      </div>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Owner Notes</label>
                      <input
                        type="text"
                        value={ownerSignalNotes}
                        onChange={(e) => setOwnerSignalNotes(e.target.value)}
                        placeholder="Tenant access, turnover plan, pricing concerns..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Comparables */}
                {comparables && (comparables.building.count > 0 || comparables.area.count > 0) && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">Comparable Rentals</h4>
                    <div className="space-y-4">
                      {comparables.building.count > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2">In Building ({comparables.building.count})</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-gray-500 border-b">
                                  <th className="pb-1 pr-4">Address</th>
                                  <th className="pb-1 pr-4">Rent</th>
                                  <th className="pb-1 pr-4">Bed/Bath</th>
                                  <th className="pb-1 pr-4">Status</th>
                                  <th className="pb-1">DOM</th>
                                </tr>
                              </thead>
                              <tbody>
                                {comparables.building.listings.map((c) => (
                                  <tr key={c.listing_id} className="border-b border-gray-100">
                                    <td className="py-1.5 pr-4 text-gray-900">{c.address || c.unit || '--'}</td>
                                    <td className="py-1.5 pr-4 font-medium">{formatPrice(c.price)}/mo</td>
                                    <td className="py-1.5 pr-4 text-gray-600">{c.bedrooms ?? '--'}/{c.bathrooms ?? '--'}</td>
                                    <td className="py-1.5 pr-4">
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${rentalStatusColor(c.status)}`}>{c.status}</span>
                                    </td>
                                    <td className="py-1.5 text-gray-600">{c.days_on_market ?? '--'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {comparables.area.count > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2">
                            In {comparables.area.neighborhood} ({comparables.area.count})
                          </p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-gray-500 border-b">
                                  <th className="pb-1 pr-4">Address</th>
                                  <th className="pb-1 pr-4">Rent</th>
                                  <th className="pb-1 pr-4">Bed/Bath</th>
                                  <th className="pb-1 pr-4">Status</th>
                                  <th className="pb-1">DOM</th>
                                </tr>
                              </thead>
                              <tbody>
                                {comparables.area.listings.map((c) => (
                                  <tr key={c.listing_id} className="border-b border-gray-100">
                                    <td className="py-1.5 pr-4 text-gray-900">{c.address || '--'}</td>
                                    <td className="py-1.5 pr-4 font-medium">{formatPrice(c.price)}/mo</td>
                                    <td className="py-1.5 pr-4 text-gray-600">{c.bedrooms ?? '--'}/{c.bathrooms ?? '--'}</td>
                                    <td className="py-1.5 pr-4">
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${rentalStatusColor(c.status)}`}>{c.status}</span>
                                    </td>
                                    <td className="py-1.5 text-gray-600">{c.days_on_market ?? '--'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Price History */}
                {priceHistory.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">Rent History</h4>
                    <div className="space-y-2">
                      {priceHistory.map((ph) => (
                        <div key={ph.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                          <div>
                            <span className="font-medium text-gray-900">{formatPrice(ph.price)}/mo</span>
                            {ph.previous_price && (
                              <span className="text-xs text-gray-500 ml-2">
                                from {formatPrice(ph.previous_price)}/mo
                              </span>
                            )}
                            {ph.change_type && (
                              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                ph.change_type === 'increase' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                              }`}>
                                {ph.change_type}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">{formatDate(ph.date)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Marketing */}
                {marketing.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h4 className="text-sm font-bold text-gray-700 mb-3">Marketing Activity</h4>
                    <div className="space-y-2">
                      {marketing.map((m) => (
                        <div key={m.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-sm">{m.title}</div>
                            {m.description && <div className="text-xs text-gray-500 mt-0.5">{m.description}</div>}
                            <div className="text-xs text-gray-400 mt-0.5">
                              {m.type} &middot; {formatDate(m.completed_at)} {m.agent && <span>&middot; {m.agent}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Attorney */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-gray-700">Attorney</h4>
                    <button
                      onClick={() => setAttorneyEditing(!attorneyEditing)}
                      className="text-xs text-green-600 hover:text-green-800 font-medium"
                    >
                      {attorneyEditing ? 'Cancel' : 'Edit'}
                    </button>
                  </div>
                  {attorneyEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-700 block mb-1">Name</label>
                          <input
                            type="text"
                            value={attorneyForm.name}
                            onChange={(e) => setAttorneyForm({ ...attorneyForm, name: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-700 block mb-1">Firm</label>
                          <input
                            type="text"
                            value={attorneyForm.firm}
                            onChange={(e) => setAttorneyForm({ ...attorneyForm, firm: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-700 block mb-1">Email</label>
                          <input
                            type="email"
                            value={attorneyForm.email}
                            onChange={(e) => setAttorneyForm({ ...attorneyForm, email: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-700 block mb-1">Phone</label>
                          <input
                            type="tel"
                            value={attorneyForm.phone}
                            onChange={(e) => setAttorneyForm({ ...attorneyForm, phone: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleSaveAttorney}
                        disabled={savingAttorney}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {savingAttorney ? 'Saving...' : 'Save Attorney Info'}
                      </button>
                    </div>
                  ) : (
                    <div>
                      {attorney && (attorney.name || attorney.firm) ? (
                        <div className="space-y-1 text-sm">
                          {attorney.name && <div className="font-medium text-gray-900">{attorney.name}</div>}
                          {attorney.firm && <div className="text-gray-600">{attorney.firm}</div>}
                          {attorney.email && <div className="text-gray-600">{attorney.email}</div>}
                          {attorney.phone && <div className="text-gray-600">{attorney.phone}</div>}
                        </div>
                      ) : (
                        <p className="text-gray-400 text-sm">No attorney information on file. Click Edit to add.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════ *
         *  MY RENTALS TAB                                              *
         * ════════════════════════════════════════════════════════════ */}
        {activeTab === 'rentals' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">My Rentals</h2>
            <p className="text-sm text-gray-500 mb-6">Your rental properties and their current status</p>

            {listings.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500 mb-2">No rental listings yet.</p>
                <p className="text-gray-400 text-sm">Your agent will add your rental properties here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {listings.map((listing) => (
                  <div key={listing.listing_id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-green-300 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{formatAddress(listing.address)}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-lg font-bold text-green-700">{formatPrice(listing.list_price)}/mo</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rentalStatusColor(listing.status)}`}>
                            {listing.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {listing.bedrooms_total != null && <span>{listing.bedrooms_total} bed</span>}
                          {listing.bathrooms_full != null && <span> &middot; {listing.bathrooms_full} bath</span>}
                          {listing.property_type && <span> &middot; {listing.property_type}</span>}
                          {listing.days_on_market != null && <span> &middot; {listing.days_on_market} DOM</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedListing(listing); setActiveTab('dashboard'); }}
                        className="text-sm text-green-600 hover:text-green-800 font-medium whitespace-nowrap"
                      >
                        View Dashboard &rarr;
                      </button>
                    </div>

                    {/* Comments section */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-500">
                          Comments ({comments[listing.id]?.length || 0})
                        </span>
                        <button
                          onClick={() => fetchComments(listing.id)}
                          className="text-xs text-green-600 hover:text-green-800"
                        >
                          Refresh
                        </button>
                      </div>
                      {comments[listing.id]?.length ? (
                        <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                          {comments[listing.id].map((c) => (
                            <div key={c.id} className={`text-sm p-2 rounded-lg ${c.author.isMe ? 'bg-green-50' : 'bg-gray-50'}`}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-medium text-gray-900 text-xs">{c.author.name}</span>
                                <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
                              </div>
                              <p className="text-gray-700 text-sm">{c.body}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={selectedListing?.id === listing.id ? commentText : ''}
                          onFocus={() => setSelectedListing(listing)}
                          onChange={(e) => { setSelectedListing(listing); setCommentText(e.target.value); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedListing(listing); handlePostComment(); } }}
                          placeholder="Add a comment..."
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                        <button
                          onClick={() => { setSelectedListing(listing); handlePostComment(); }}
                          disabled={submittingComment}
                          className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          Post
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════ *
         *  SHOWINGS TAB                                                *
         * ════════════════════════════════════════════════════════════ */}
        {activeTab === 'showings' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Showings</h2>
            <p className="text-sm text-gray-500 mb-6">Upcoming and recent showings for your rental properties</p>

            {showings.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No showings scheduled yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {showings.map((s) => (
                  <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${showingStatusColor(s.status)}`}>
                            {s.status}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">{s.type}</span>
                        </div>
                        <h3 className="font-medium text-gray-900 mt-1">{s.listing.address || 'Address Suppressed'}</h3>
                        <div className="text-sm text-gray-600">
                          {formatDate(s.date)} {s.time && <span>at {s.time}</span>}
                        </div>
                        {s.listing.list_price && (
                          <div className="text-sm font-medium text-green-700 mt-0.5">
                            {formatPrice(s.listing.list_price)}/mo
                          </div>
                        )}
                      </div>
                      {s.feedback && (
                        <div className="bg-gray-50 rounded-lg p-3 text-sm min-w-0 sm:max-w-xs">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Feedback</div>
                          {s.feedback.rating && (
                            <div className="text-gray-700">Rating: {s.feedback.rating}/5</div>
                          )}
                          {s.feedback.interest_level && (
                            <div className="text-gray-700 capitalize">Interest: {s.feedback.interest_level}</div>
                          )}
                          {s.feedback.notes && (
                            <div className="text-gray-600 text-xs mt-1">{s.feedback.notes}</div>
                          )}
                        </div>
                      )}
                    </div>
                    {s.notes && (
                      <div className="mt-2 text-xs text-gray-500">{s.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════ *
         *  APPLICATIONS TAB                                            *
         * ════════════════════════════════════════════════════════════ */}
        {activeTab === 'applications' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Applications</h2>
            <p className="text-sm text-gray-500 mb-6">Incoming rental applications on your properties</p>

            {applications.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No applications received yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <div key={app.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-gray-900">{app.listing_address || 'Address Suppressed'}</h3>
                        {app.list_price && (
                          <div className="text-sm font-medium text-green-700">{formatPrice(app.list_price)}/mo</div>
                        )}
                        {app.comment && (
                          <p className="text-sm text-gray-600 mt-2">{app.comment}</p>
                        )}
                        <div className="text-xs text-gray-400 mt-2">{formatDateTime(app.created_at)}</div>
                      </div>
                      {app.from && (
                        <div className="bg-gray-50 rounded-lg p-3 text-sm sm:min-w-[200px]">
                          <div className="text-xs font-semibold text-gray-500 mb-1">Applicant</div>
                          <div className="font-medium text-gray-900">{app.from.name}</div>
                          <div className="text-gray-600 text-xs">{app.from.email}</div>
                          {app.from.phone && <div className="text-gray-600 text-xs">{app.from.phone}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════ *
         *  DOCUMENTS TAB                                               *
         * ════════════════════════════════════════════════════════════ */}
        {activeTab === 'documents' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Documents</h2>
            <p className="text-sm text-gray-500 mb-6">Lease agreements, disclosures, and other documents</p>

            {documents.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No documents shared yet.</p>
                <p className="text-gray-400 text-sm mt-1">Your agent will share documents here for your review.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-green-300 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 text-sm">{doc.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${docStatusColor(doc.status)}`}>
                              {doc.status.replace(/_/g, ' ')}
                            </span>
                            {doc.doc_type && <span className="text-xs text-gray-500">{doc.doc_type}</span>}
                            {doc.requires_signature && (
                              <span className="text-xs text-orange-600 font-medium">Signature Required</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">Uploaded {formatDate(doc.created_at)}</div>
                        </div>
                      </div>
                      {doc.file_url && (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-green-600 hover:text-green-800 font-medium whitespace-nowrap"
                        >
                          Download
                        </a>
                      )}
                    </div>
                    {doc.signatures.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <span className="text-xs font-semibold text-gray-500">Signatures</span>
                        <div className="mt-1 space-y-1">
                          {doc.signatures.map((sig) => (
                            <div key={sig.id} className="flex items-center justify-between text-xs">
                              <span className="text-gray-700">
                                {sig.signer_name} <span className="text-gray-400">({sig.signer_role})</span>
                              </span>
                              <span className={`font-medium ${sig.status === 'signed' ? 'text-green-600' : 'text-yellow-600'}`}>
                                {sig.status === 'signed' ? `Signed ${formatDate(sig.signed_at)}` : 'Pending'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════ *
         *  FAMILY TAB                                                  *
         * ════════════════════════════════════════════════════════════ */}
        {activeTab === 'family' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-gray-900">Family</h2>
              <button
                onClick={() => setInviteOpen(!inviteOpen)}
                className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
              >
                + Invite
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-6">Share portal access with your spouse, partner, or co-owner</p>

            {/* Invite form */}
            {inviteOpen && (
              <div className="bg-white rounded-xl border border-green-200 p-5 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Invite Family Member</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">First Name *</label>
                    <input
                      type="text"
                      value={inviteForm.first_name}
                      onChange={(e) => setInviteForm({ ...inviteForm, first_name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Last Name *</label>
                    <input
                      type="text"
                      value={inviteForm.last_name}
                      onChange={(e) => setInviteForm({ ...inviteForm, last_name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Email *</label>
                    <input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Phone</label>
                    <input
                      type="tel"
                      value={inviteForm.phone}
                      onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Relationship</label>
                    <select
                      value={inviteForm.relationship}
                      onChange={(e) => setInviteForm({ ...inviteForm, relationship: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    >
                      <option value="spouse">Spouse</option>
                      <option value="partner">Partner</option>
                      <option value="co-owner">Co-Owner</option>
                      <option value="parent">Parent</option>
                      <option value="child">Child</option>
                      <option value="sibling">Sibling</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleInvite}
                    disabled={inviteSubmitting}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {inviteSubmitting ? 'Sending...' : 'Send Invitation'}
                  </button>
                  <button
                    onClick={() => setInviteOpen(false)}
                    className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {family.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500">No family members added yet.</p>
                <p className="text-gray-400 text-sm mt-1">Invite your spouse, partner, or co-owner to share portal access.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {family.map((fm) => (
                  <div key={fm.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-green-700 font-semibold text-sm">
                          {fm.member.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{fm.member.name}</div>
                        <div className="text-sm text-gray-600">{fm.member.email}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500 capitalize">{fm.relationship}</span>
                          <span className={`text-xs font-medium ${fm.member.active ? 'text-green-600' : 'text-yellow-600'}`}>
                            {fm.member.active ? 'Active' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════ *
         *  PROFILE TAB                                                 *
         * ════════════════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Profile</h2>
            <p className="text-sm text-gray-500 mb-6">Your account details</p>

            {user ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="text-green-700 font-bold text-xl">
                      {user.first_name?.[0]}{user.last_name?.[0]}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {user.first_name} {user.last_name}
                    </h3>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 capitalize">
                      {user.portal_role}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Email</label>
                    <div className="text-sm text-gray-900">{user.email}</div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Phone</label>
                    <div className="text-sm text-gray-900">{user.phone || '--'}</div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-bold text-gray-700 mb-3">Quick Links</h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setActiveTab('rentals')}
                      className="text-sm text-green-600 hover:text-green-800 font-medium"
                    >
                      My Rentals ({listings.length})
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => setActiveTab('showings')}
                      className="text-sm text-green-600 hover:text-green-800 font-medium"
                    >
                      Showings ({showings.length})
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => setActiveTab('applications')}
                      className="text-sm text-green-600 hover:text-green-800 font-medium"
                    >
                      Applications ({applications.length})
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => setActiveTab('documents')}
                      className="text-sm text-green-600 hover:text-green-800 font-medium"
                    >
                      Documents ({documents.length})
                    </button>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <button
                    onClick={() => {
                      fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.replace('/sign-in'));
                    }}
                    className="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-400">Loading profile...</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-gray-400 text-center">
            Mallan Real Estate Inc. &middot; 400 East 90th Street, Suite 17C, New York, NY 10128 &middot; 646-258-4460
          </p>
        </div>
      </footer>
    </div>
  );
}
