'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePortalSession } from '@/lib/portal/use-portal-session';
import { useAsyncResource } from '@/lib/hooks/useAsyncResource';

/* ────────────────────────────────────────────────────────────────────────────
   TYPES
   ──────────────────────────────────────────────────────────────────────────── */

interface Listing {
  id: string;
  listing_id?: string;
  address: string;
  list_price: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  listing_type?: string;
  status?: string;
  photos?: string[];
  reactions: Record<string, boolean>;
}

interface Comment {
  id: string;
  listing_id: string;
  parent_id: string | null;
  body: string;
  author: { id: string; name: string; isMe: boolean };
  created_at: string;
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
    listing_id?: string;
    address: string;
    list_price: string;
    listing_type?: string;
  };
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
  move_in_date?: string | null;
  notes: string | null;
}

interface FamilyMember {
  id: string;
  relationship: string;
  member: { id: string; name: string; email: string; active: boolean };
  created_at: string;
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  portal_role: string;
}

/* ────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ──────────────────────────────────────────────────────────────────────────── */

const TABS = [
  { key: 'listings',    label: 'Listings',    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { key: 'lease',       label: 'My Lease',    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'showings',    label: 'Showings',    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { key: 'preferences', label: 'Preferences', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
  { key: 'family',      label: 'Family',      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { key: 'profile',     label: 'Profile',     icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
] as const;

type TabKey = typeof TABS[number]['key'];

const NYC_NEIGHBORHOODS = [
  'Upper East Side', 'Upper West Side', 'Midtown', 'Midtown East', 'Midtown West',
  'Chelsea', 'Flatiron', 'Gramercy', 'Greenwich Village', 'West Village',
  'East Village', 'NoHo', 'SoHo', 'TriBeCa', 'Lower East Side',
  'Financial District', 'Battery Park City', 'Hell\'s Kitchen', 'Murray Hill',
  'Kips Bay', 'Yorkville', 'Carnegie Hill', 'Lenox Hill', 'Sutton Place',
  'Harlem', 'East Harlem', 'Washington Heights', 'Inwood',
  'Williamsburg', 'DUMBO', 'Brooklyn Heights', 'Park Slope', 'Cobble Hill',
  'Boerum Hill', 'Fort Greene', 'Clinton Hill', 'Prospect Heights', 'Greenpoint',
  'Bushwick', 'Bed-Stuy', 'Crown Heights', 'Windsor Terrace', 'Sunset Park',
  'Long Island City', 'Astoria', 'Jackson Heights', 'Forest Hills', 'Flushing',
];

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

const RENTAL_MUST_HAVES = [
  'No-Fee', 'Pets Allowed', 'In-Unit Laundry', 'Dishwasher', 'Doorman',
  'Elevator', 'Gym', 'Rooftop', 'Outdoor Space', 'Storage',
  'Bike Room', 'Parking', 'Live-In Super', 'Package Room',
  'Furnished', 'Flex Wall OK', 'Short Lease OK', 'Guarantor Accepted',
];

const RENTAL_DEAL_BREAKERS = [
  'Walk-Up (5+ floors)', 'Basement', 'No Natural Light', 'Street Noise',
  'No Laundry In Building', 'No Pets', 'Broker Fee Required', 'No Guarantor',
  'First Floor', 'Shared Bathroom', 'No Dishwasher', 'Above 6th Floor',
];

const RENTAL_PROPERTY_TYPES = [
  'Apartment', 'Studio', 'Loft', 'Alcove Studio', 'Convertible',
  'Townhouse', 'House', 'Duplex', 'Garden Apartment',
];

/* ────────────────────────────────────────────────────────────────────────────
   HELPERS
   ──────────────────────────────────────────────────────────────────────────── */

function formatRent(price: string | number | null | undefined): string {
  if (!price) return '--';
  const n = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(n)) return '--';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '/mo';
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t: string | null | undefined): string {
  if (!t) return '';
  return t;
}

function statusBadge(status: string): { bg: string; text: string; label: string } {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    Active:       { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Active' },
    Pending:      { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Offer Pending' },
    Contract:     { bg: 'bg-purple-100', text: 'text-purple-800', label: 'In Contract' },
    Rented:       { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Rented' },
    ComingSoon:   { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Coming Soon — No Showings Until Listed' },
    Closed:       { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Off Market' },
    Withdrawn:    { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Withdrawn' },
    Expired:      { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Expired' },
  };
  return map[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
}

function showingStatusBadge(status: string): { bg: string; text: string; label: string } {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    requested:  { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Requested' },
    confirmed:  { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Confirmed' },
    completed:  { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Completed' },
    cancelled:  { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Cancelled' },
    rescheduled:{ bg: 'bg-orange-100', text: 'text-orange-800', label: 'Rescheduled' },
  };
  return map[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
}

/* ────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ──────────────────────────────────────────────────────────────────────────── */

export default function TenantPortalPage() {
  const router = useRouter();
  // Hotfix 2: portalFetch auto-redirects to /sign-in on 401 instead of
  // letting tenant fetchers swallow the response into `[]`. Audit B2.
  const { portalFetch } = usePortalSession();

  /* ── Auth state ────────────────────────────────────────────────── */
  const [user, setUser] = useState<UserProfile | null>(null);
  const [multiWorkspace, setMultiWorkspace] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabKey>('listings');

  /* ── Data state ──────────────────────────────────────────────────
     Each tab's data is owned by useAsyncResource — typed useReducer
     state machine keyed off `ready ? tab : null` so the resource is
     idle until auth completes AND the user is on that tab. */
  type LeaseData = {
    lease_start_date: string | null;
    lease_end_date: string | null;
    rent_per_month: number | null;
    property_address: string | null;
    unit_number: string | null;
    renewal_status: string | null;
    days_remaining: number | null;
  };

  // Hotfix 2: each fetcher routes through `portalFetch` so a 401
  // throws PortalSessionExpiredError and triggers the redirect. The
  // useAsyncResource wrapper catches the error into state.error, and
  // the redirect lands via the hook before the user sees the error UI.
  // Genuine 4xx/5xx errors still surface through resource.error so
  // the page can render error state separately from empty state.
  const fetchListingsResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<Listing[]> => {
    const d = await portalFetch<{ listings: Listing[] }>('/api/portal/listings', { signal });
    return d.listings || [];
  }, [portalFetch]);
  const listingsRes = useAsyncResource(ready && tab === 'listings' ? 'listings' : null, fetchListingsResource);
  const listings: Listing[] = listingsRes.data ?? [];

  const fetchShowingsResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<Showing[]> => {
    const d = await portalFetch<{ showings: Showing[] }>('/api/portal/showings', { signal });
    return d.showings || [];
  }, [portalFetch]);
  const showingsRes = useAsyncResource(ready && tab === 'showings' ? 'showings' : null, fetchShowingsResource);
  const showings: Showing[] = showingsRes.data ?? [];

  const fetchPreferencesResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<Preferences | null> => {
    const d = await portalFetch<{ preferences: Preferences | null }>('/api/portal/preferences', { signal });
    return d.preferences ?? null;
  }, [portalFetch]);
  const preferencesRes = useAsyncResource(ready && tab === 'preferences' ? 'preferences' : null, fetchPreferencesResource);
  const preferences: Preferences | null = preferencesRes.data ?? null;

  const fetchFamilyResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<FamilyMember[]> => {
    const d = await portalFetch<{ family: FamilyMember[] }>('/api/portal/family', { signal });
    return d.family || [];
  }, [portalFetch]);
  const familyRes = useAsyncResource(ready && tab === 'family' ? 'family' : null, fetchFamilyResource);
  const family: FamilyMember[] = familyRes.data ?? [];

  const fetchLeaseResource = useCallback(async (_: string | number, signal: AbortSignal): Promise<LeaseData | null> => {
    const d = await portalFetch<LeaseData>('/api/portal/tenant/lease', { signal });
    return d;
  }, [portalFetch]);
  const leaseRes = useAsyncResource(ready && tab === 'lease' ? 'lease' : null, fetchLeaseResource);
  const leaseData = leaseRes.data;

  // Aggregate loading state — true while any active tab's resource is
  // mid-fetch.
  const loading =
    listingsRes.loading || showingsRes.loading || preferencesRes.loading ||
    familyRes.loading || leaseRes.loading;

  // Comments are keyed per-listing and triggered on expand — not a
  // tab-level resource, so they stay as scoped state.
  const [comments, setComments] = useState<Record<string, Comment[]>>({});

  /* ── UI state ──────────────────────────────────────────────────── */
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [expandedListing, setExpandedListing] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showShowingModal, setShowShowingModal] = useState<string | null>(null);
  const [showFamilyInvite, setShowFamilyInvite] = useState(false);
  const [prefEditing, setPrefEditing] = useState(false);
  const [outsideRentalUrl, setOutsideRentalUrl] = useState('');
  const [outsideRentalAddress, setOutsideRentalAddress] = useState('');
  const [targetPurchasePrice, setTargetPurchasePrice] = useState('');
  const [monthlyOwnershipBudget, setMonthlyOwnershipBudget] = useState('');
  const [leaseIntent, setLeaseIntent] = useState('undecided');
  const [moveTiming, setMoveTiming] = useState('');
  const [documentReadiness, setDocumentReadiness] = useState('not_started');
  const [tenantSignalNotes, setTenantSignalNotes] = useState('');
  const [savingTenantSignals, setSavingTenantSignals] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Toast helper ──────────────────────────────────────────────── */
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  /* ── Auth check ────────────────────────────────────────────────── */
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated || data.principalType !== 'lead') {
          router.replace('/sign-in');
          return;
        }

        const enabled: string[] = data.enabledWorkspaces
          || [data.primaryPortalRole || data.portalRole];

        // Normalize: accept 'tenant' or 'renter'
        const isTenant = enabled.includes('tenant') || enabled.includes('renter')
          || data.portalRole === 'tenant' || data.portalRole === 'renter'
          || data.primaryPortalRole === 'tenant' || data.primaryPortalRole === 'renter';

        if (!isTenant) {
          router.replace('/portal');
          return;
        }

        setMultiWorkspace(enabled.length > 1);
        setUser({
          id: data.user?.id?.toString() ?? '',
          first_name: data.user?.first_name ?? '',
          last_name: data.user?.last_name ?? '',
          email: data.user?.email ?? '',
          phone: data.user?.phone ?? '',
          portal_role: 'tenant',
        });
        setReady(true);
      })
      .catch(() => router.replace('/sign-in'));
  }, [router]);

  /* ── Data loaders ──────────────────────────────────────────────── */
  // The tab data loaders (listings/showings/preferences/family/lease)
  // are owned by the useAsyncResource hooks declared above — keyed off
  // the active tab. The only loader still here is `loadComments`,
  // triggered from expand-row event handlers (not from useEffect), so
  // it doesn't trip the React Compiler set-state-in-effect rule.
  const loadComments = useCallback(async (listingId: string) => {
    try {
      const r = await fetch(`/api/portal/listings/${listingId}/comments`);
      const d = await r.json();
      if (d.comments) {
        setComments((prev) => ({ ...prev, [listingId]: d.comments }));
      }
    } catch { /* silent */ }
  }, []);

  // Imperative refetch helpers for use inside event handlers (e.g.
  // after a mutation). The reducer-based dispatch is stable identity,
  // so this doesn't cause cascade-render concerns. Lease has no
  // mutation handler today so its refetch isn't surfaced.
  const refetchListings = listingsRes.refetch;
  const refetchShowings = showingsRes.refetch;
  const refetchPreferences = preferencesRes.refetch;
  const refetchFamily = familyRes.refetch;

  /* ── Reaction handler ──────────────────────────────────────────── */
  const handleReaction = useCallback(async (listingId: string, action: string) => {
    try {
      const r = await fetch(`/api/portal/listings/${listingId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (r.ok) {
        // The reaction state lives server-side; refetch the listings
        // so the updated reaction counts appear (no optimistic merge —
        // listings is owned by useAsyncResource).
        refetchListings();
      }
    } catch { /* silent */ }
  }, [refetchListings]);

  /* ── Comment handler ───────────────────────────────────────────── */
  const handleComment = useCallback(async (listingId: string, body: string, parentId?: string) => {
    try {
      const r = await fetch(`/api/portal/listings/${listingId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, parent_id: parentId }),
      });
      if (r.ok) {
        await loadComments(listingId);
        showToast('Comment added');
      }
    } catch { /* silent */ }
  }, [loadComments, showToast]);

  /* ── Listing request handler ───────────────────────────────────── */
  const handleListingRequest = useCallback(async (url: string, address: string, notes: string) => {
    try {
      const r = await fetch('/api/portal/listings/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url || undefined, address: address || undefined, notes }),
      });
      if (r.ok) {
        showToast('Request sent to your agent');
        setShowRequestForm(false);
      } else {
        const d = await r.json();
        showToast(d.error || 'Failed to send request', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  }, [showToast]);

  /* ── Showing request handler ───────────────────────────────────── */
  const handleShowingRequest = useCallback(async (listingId: string, date: string, time: string, notes: string) => {
    try {
      const r = await fetch('/api/portal/showings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, date, time: time || undefined, notes: notes || undefined }),
      });
      if (r.ok) {
        showToast('Showing request sent');
        setShowShowingModal(null);
        refetchShowings();
      } else {
        const d = await r.json();
        showToast(d.error || 'Failed to request showing', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  }, [showToast, refetchShowings]);

  /* ── Preferences save handler ──────────────────────────────────── */
  const handleSavePreferences = useCallback(async (prefs: Preferences) => {
    try {
      const r = await fetch('/api/portal/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (r.ok) {
        // Server is the source of truth for preferences. Refetch the
        // resource so the saved view reflects what was persisted.
        refetchPreferences();
        setPrefEditing(false);
        showToast('Preferences saved');
      } else {
        const d = await r.json();
        showToast(d.error || 'Failed to save', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  }, [showToast, refetchPreferences]);

  /* ── Family invite handler ─────────────────────────────────────── */
  const handleFamilyInvite = useCallback(async (first: string, last: string, email: string, relationship: string) => {
    try {
      const r = await fetch('/api/portal/family/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: first, last_name: last, email, relationship }),
      });
      if (r.ok) {
        showToast('Invitation sent');
        setShowFamilyInvite(false);
        refetchFamily();
      } else {
        const d = await r.json();
        showToast(d.error || 'Failed to invite', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  }, [showToast, refetchFamily]);

  const handleSaveTenantSignals = useCallback(async () => {
    setSavingTenantSignals(true);
    try {
      const r = await fetch('/api/portal/tenant/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outside_rental_url: outsideRentalUrl,
          outside_rental_address: outsideRentalAddress,
          monthly_rent: leaseData?.rent_per_month ?? undefined,
          target_purchase_price: targetPurchasePrice,
          monthly_ownership_budget: monthlyOwnershipBudget,
          lease_end_date: leaseData?.lease_end_date ?? undefined,
          lease_intent: leaseIntent,
          move_timing: moveTiming,
          document_readiness: documentReadiness,
          notes: tenantSignalNotes,
        }),
      });
      if (r.ok) {
        showToast('Signals saved for your agent');
      } else {
        const d = await r.json();
        showToast(d.error || 'Failed to save signals', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setSavingTenantSignals(false);
    }
  }, [
    documentReadiness,
    leaseData?.lease_end_date,
    leaseData?.rent_per_month,
    leaseIntent,
    monthlyOwnershipBudget,
    moveTiming,
    outsideRentalAddress,
    outsideRentalUrl,
    showToast,
    targetPurchasePrice,
    tenantSignalNotes,
  ]);

  /* ── Loading / not-ready screens ───────────────────────────────── */
  if (!ready) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      {/* ── Toast ─────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {multiWorkspace && (
              <button
                onClick={() => router.push('/portal')}
                className="text-gray-400 hover:text-gray-700 transition-colors mr-1"
                title="Back to Portal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <span className="text-sm font-bold text-purple-700">Tenant Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 hidden sm:inline">
              {user?.first_name} {user?.last_name}
            </span>
            <button
              onClick={() => {
                fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.replace('/sign-in'));
              }}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab bar ───────────────────────────────────────────────── */}
      <nav className="border-b border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex overflow-x-auto gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Content ───────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-400 text-sm">Loading...</div>
          </div>
        ) : (
          <>
            {tab === 'listings' && (
              <ListingsTab
                listings={listings}
                comments={comments}
                expandedListing={expandedListing}
                showRequestForm={showRequestForm}
                showShowingModal={showShowingModal}
                onExpand={(id) => {
                  setExpandedListing(expandedListing === id ? null : id);
                  if (expandedListing !== id) loadComments(id);
                }}
                onReact={handleReaction}
                onComment={handleComment}
                onRequestForm={setShowRequestForm}
                onListingRequest={handleListingRequest}
                onShowingModal={setShowShowingModal}
                onShowingRequest={handleShowingRequest}
              />
            )}
            {tab === 'lease' && (
              <div className="space-y-6">
                {!leaseData || (!leaseData.lease_start_date && !leaseData.property_address) ? (
                  <div className="text-center py-12">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-gray-500 font-medium">No lease information available</p>
                    <p className="text-xs text-gray-400 mt-1">Your agent will add lease details when your rental is confirmed.</p>
                  </div>
                ) : (
                  <>
                    {/* Lease Summary Card */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">Lease Details</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Property</div>
                          <div className="text-sm font-medium text-gray-900">
                            {leaseData.property_address || 'Not set'}
                            {leaseData.unit_number && ` #${leaseData.unit_number}`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Monthly Rent</div>
                          <div className="text-sm font-medium text-gray-900">
                            {leaseData.rent_per_month ? `$${leaseData.rent_per_month.toLocaleString()}/mo` : 'Not set'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Lease Start</div>
                          <div className="text-sm font-medium text-gray-900">
                            {leaseData.lease_start_date ? new Date(leaseData.lease_start_date).toLocaleDateString() : 'Not set'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">Lease End</div>
                          <div className="text-sm font-medium text-gray-900">
                            {leaseData.lease_end_date ? new Date(leaseData.lease_end_date).toLocaleDateString() : 'Not set'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Days Remaining + Renewal Status */}
                    {leaseData.days_remaining != null && (
                      <div className={`rounded-2xl border p-6 ${
                        leaseData.days_remaining <= 30 ? 'bg-red-50 border-red-200' :
                        leaseData.days_remaining <= 90 ? 'bg-amber-50 border-amber-200' :
                        'bg-green-50 border-green-200'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-gray-600 mb-0.5">Days Remaining</div>
                            <div className={`text-2xl font-bold ${
                              leaseData.days_remaining <= 30 ? 'text-red-700' :
                              leaseData.days_remaining <= 90 ? 'text-amber-700' :
                              'text-green-700'
                            }`}>
                              {leaseData.days_remaining}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-600 mb-0.5">Renewal Status</div>
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                              leaseData.renewal_status === 'renewed' ? 'bg-green-100 text-green-800' :
                              leaseData.renewal_status === 'negotiating' ? 'bg-amber-100 text-amber-800' :
                              leaseData.renewal_status === 'not_renewing' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {leaseData.renewal_status ? leaseData.renewal_status.replace(/_/g, ' ') : 'Pending'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Rental Planning</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Share lease timing, document readiness, outside rentals, and rent-vs-buy context.</p>
                    </div>
                    <button
                      onClick={handleSaveTenantSignals}
                      disabled={savingTenantSignals}
                      className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {savingTenantSignals ? 'Saving...' : 'Save Signals'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Outside Rental Link</label>
                      <input
                        type="url"
                        value={outsideRentalUrl}
                        onChange={(e) => setOutsideRentalUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Outside Rental Address</label>
                      <input
                        type="text"
                        value={outsideRentalAddress}
                        onChange={(e) => setOutsideRentalAddress(e.target.value)}
                        placeholder="Address or building"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Target Purchase Price</label>
                      <input
                        type="number"
                        value={targetPurchasePrice}
                        onChange={(e) => setTargetPurchasePrice(e.target.value)}
                        placeholder="$0"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Monthly Ownership Budget</label>
                      <input
                        type="number"
                        value={monthlyOwnershipBudget}
                        onChange={(e) => setMonthlyOwnershipBudget(e.target.value)}
                        placeholder="$0/mo"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Lease Intent</label>
                      <select
                        value={leaseIntent}
                        onChange={(e) => setLeaseIntent(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white"
                      >
                        <option value="undecided">Undecided</option>
                        <option value="renew">Renew</option>
                        <option value="not_renewing">Not Renewing</option>
                        <option value="buy_next">Considering Buying</option>
                        <option value="month_to_month">Month to Month</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Move Timing</label>
                      <input
                        type="text"
                        value={moveTiming}
                        onChange={(e) => setMoveTiming(e.target.value)}
                        placeholder="ASAP, 60 days, flexible..."
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Document Readiness</label>
                      <select
                        value={documentReadiness}
                        onChange={(e) => setDocumentReadiness(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white"
                      >
                        <option value="not_started">Not Started</option>
                        <option value="collecting">Collecting</option>
                        <option value="mostly_ready">Mostly Ready</option>
                        <option value="ready">Ready</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Notes</label>
                      <input
                        type="text"
                        value={tenantSignalNotes}
                        onChange={(e) => setTenantSignalNotes(e.target.value)}
                        placeholder="Anything your agent should know"
                        className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {tab === 'showings' && <ShowingsTab showings={showings} />}
            {tab === 'preferences' && (
              <PreferencesTab
                preferences={preferences}
                editing={prefEditing}
                onEdit={() => setPrefEditing(true)}
                onCancel={() => setPrefEditing(false)}
                onSave={handleSavePreferences}
              />
            )}
            {tab === 'family' && (
              <FamilyTab
                family={family}
                showInvite={showFamilyInvite}
                onToggleInvite={() => setShowFamilyInvite(!showFamilyInvite)}
                onInvite={handleFamilyInvite}
              />
            )}
            {tab === 'profile' && user && <ProfileTab user={user} />}
          </>
        )}
      </main>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   LISTINGS TAB
   ════════════════════════════════════════════════════════════════════════════ */

function ListingsTab({
  listings, comments, expandedListing, showRequestForm, showShowingModal,
  onExpand, onReact, onComment, onRequestForm, onListingRequest,
  onShowingModal, onShowingRequest,
}: {
  listings: Listing[];
  comments: Record<string, Comment[]>;
  expandedListing: string | null;
  showRequestForm: boolean;
  showShowingModal: string | null;
  onExpand: (id: string) => void;
  onReact: (id: string, action: string) => void;
  onComment: (id: string, body: string, parentId?: string) => void;
  onRequestForm: (v: boolean) => void;
  onListingRequest: (url: string, address: string, notes: string) => void;
  onShowingModal: (id: string | null) => void;
  onShowingRequest: (id: string, date: string, time: string, notes: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Your Rentals</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Listings shared by your agent. React to let them know what you think.
          </p>
        </div>
        <button
          onClick={() => onRequestForm(true)}
          className="px-3 py-1.5 text-xs font-medium text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
        >
          + Request a Listing
        </button>
      </div>

      {/* Listing request form */}
      {showRequestForm && (
        <ListingRequestForm
          onSubmit={onListingRequest}
          onCancel={() => onRequestForm(false)}
        />
      )}

      {/* Listing cards */}
      {listings.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No listings yet. Your agent will share rentals with you here.
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              expanded={expandedListing === listing.id}
              comments={comments[listing.id] ?? []}
              showShowingModal={showShowingModal === listing.id}
              onExpand={() => onExpand(listing.id)}
              onReact={(action) => onReact(listing.id, action)}
              onComment={(body, parentId) => onComment(listing.id, body, parentId)}
              onShowingModal={() => onShowingModal(listing.id)}
              onShowingRequest={(date, time, notes) => onShowingRequest(listing.id, date, time, notes)}
              onCloseShowingModal={() => onShowingModal(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Listing Card ──────────────────────────────────────────────────────── */

function ListingCard({
  listing, expanded, comments, showShowingModal,
  onExpand, onReact, onComment,
  onShowingModal, onShowingRequest, onCloseShowingModal,
}: {
  listing: Listing;
  expanded: boolean;
  comments: Comment[];
  showShowingModal: boolean;
  onExpand: () => void;
  onReact: (action: string) => void;
  onComment: (body: string, parentId?: string) => void;
  onShowingModal: () => void;
  onShowingRequest: (date: string, time: string, notes: string) => void;
  onCloseShowingModal: () => void;
}) {
  const [commentText, setCommentText] = useState('');
  const badge = listing.status ? statusBadge(listing.status) : null;

  const reactions = [
    { key: 'liked',    label: 'Like',     icon: '\u2764\uFE0F',  activeClass: 'bg-pink-100 border-pink-300 text-pink-700' },
    { key: 'disliked', label: 'Pass',     icon: '\uD83D\uDC4E', activeClass: 'bg-gray-200 border-gray-400 text-gray-700' },
    { key: 'discuss',  label: 'Discuss',  icon: '\uD83D\uDCAC', activeClass: 'bg-blue-100 border-blue-300 text-blue-700' },
    { key: 'schedule', label: 'Tour',     icon: '\uD83D\uDCC5', activeClass: 'bg-green-100 border-green-300 text-green-700' },
  ];

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Card header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onExpand}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {listing.address || 'Address Suppressed'}
            </h3>
            {badge && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.bg} ${badge.text}`}>
                {badge.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
            <span className="font-semibold text-gray-900">{formatRent(listing.list_price)}</span>
            {listing.beds != null && <span>{listing.beds} bed</span>}
            {listing.baths != null && <span>{listing.baths} bath</span>}
            {listing.sqft != null && <span>{listing.sqft.toLocaleString()} sqft</span>}
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Reactions bar */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
        {reactions.map((rx) => {
          const active = listing.reactions[rx.key];
          return (
            <button
              key={rx.key}
              onClick={(e) => { e.stopPropagation(); onReact(rx.key); }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                active ? rx.activeClass : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span>{rx.icon}</span>
              {rx.label}
            </button>
          );
        })}
        <button
          onClick={(e) => { e.stopPropagation(); onShowingModal(); }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors ml-auto"
        >
          Schedule Tour
        </button>
      </div>

      {/* Expanded section: photos, comments */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Photos — plain <img> (Trestle proxy URLs aren't whitelisted for
              next/image and tenant portal is gated behind portal auth). */}
          {listing.photos && listing.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {listing.photos.slice(0, 6).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="w-40 h-28 object-cover rounded-lg flex-shrink-0"
                />
              ))}
            </div>
          )}

          {/* Comments */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Comments</h4>
            {comments.length === 0 ? (
              <p className="text-xs text-gray-400">No comments yet. Start the conversation.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className={`text-xs p-2 rounded-lg ${c.author.isMe ? 'bg-purple-50' : 'bg-gray-50'}`}>
                    <span className="font-semibold text-gray-700">{c.author.name}</span>
                    <span className="text-gray-400 ml-2">{formatDate(c.created_at)}</span>
                    <p className="mt-0.5 text-gray-600">{c.body}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    onComment(commentText.trim());
                    setCommentText('');
                  }
                }}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
              />
              <button
                onClick={() => {
                  if (commentText.trim()) {
                    onComment(commentText.trim());
                    setCommentText('');
                  }
                }}
                disabled={!commentText.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Showing request modal */}
      {showShowingModal && (
        <ShowingRequestModal
          listingAddress={listing.address}
          onSubmit={(date, time, notes) => onShowingRequest(date, time, notes)}
          onClose={onCloseShowingModal}
        />
      )}
    </div>
  );
}

/* ── Listing Request Form ──────────────────────────────────────────────── */

function ListingRequestForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (url: string, address: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="border border-purple-200 bg-purple-50 rounded-xl p-4 mb-5">
      <h3 className="text-sm font-semibold text-purple-800 mb-3">Request a Listing</h3>
      <p className="text-xs text-purple-600 mb-3">
        Found a rental you like? Send the link or address to your agent.
      </p>
      <div className="space-y-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Listing URL (StreetEasy, Zillow, etc.)"
          className="w-full px-3 py-2 text-xs border border-purple-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white"
        />
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Or enter an address"
          className="w-full px-3 py-2 text-xs border border-purple-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for your agent (optional)"
          rows={2}
          className="w-full px-3 py-2 text-xs border border-purple-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white resize-none"
        />
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSubmit(url, address, notes)}
          disabled={!url.trim() && !address.trim()}
          className="px-4 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors"
        >
          Send to Agent
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Showing Request Modal ─────────────────────────────────────────────── */

function ShowingRequestModal({
  listingAddress,
  onSubmit,
  onClose,
}: {
  listingAddress: string;
  onSubmit: (date: string, time: string, notes: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  // Minimum date = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="border-t border-gray-100 px-4 py-4 bg-gray-50">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">
        Schedule a Tour - {listingAddress || 'This Listing'}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Preferred Date *</label>
          <input
            type="date"
            value={date}
            min={minDate}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-0.5">Preferred Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
        </div>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (e.g., preferred time of day, accessibility needs)"
        rows={2}
        className="w-full mt-2 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none"
      />
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSubmit(date, time, notes)}
          disabled={!date}
          className="px-4 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors"
        >
          Request Tour
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SHOWINGS TAB
   ════════════════════════════════════════════════════════════════════════════ */

function ShowingsTab({ showings }: { showings: Showing[] }) {
  const upcoming = showings.filter((s) => s.status !== 'completed' && s.status !== 'cancelled');
  const past = showings.filter((s) => s.status === 'completed' || s.status === 'cancelled');

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Your Tours</h2>
      <p className="text-xs text-gray-500 mb-5">Upcoming and recent apartment tours.</p>

      {showings.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No tours scheduled yet. Request a tour from any listing.
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Upcoming</h3>
              <div className="space-y-3">
                {upcoming.map((s) => <ShowingCard key={s.id} showing={s} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Past</h3>
              <div className="space-y-3">
                {past.map((s) => <ShowingCard key={s.id} showing={s} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ShowingCard({ showing }: { showing: Showing }) {
  const badge = showingStatusBadge(showing.status);
  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">
            {showing.listing.address || 'Address Suppressed'}
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatDate(showing.date)}
            {showing.time && ` at ${formatTime(showing.time)}`}
            {showing.type && showing.type !== 'private' && ` - ${showing.type}`}
          </p>
          <p className="text-xs font-medium text-gray-700 mt-1">
            {formatRent(showing.listing.list_price)}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      </div>
      {showing.notes && (
        <p className="text-xs text-gray-500 mt-2 italic">{showing.notes}</p>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PREFERENCES TAB
   ════════════════════════════════════════════════════════════════════════════ */

function PreferencesTab({
  preferences, editing, onEdit, onCancel, onSave,
}: {
  preferences: Preferences | null;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (prefs: Preferences) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Rental Preferences</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Tell your agent what you are looking for. This helps them find the right apartments.
          </p>
        </div>
        {!editing && (
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-medium text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
          >
            {preferences ? 'Edit' : 'Set Preferences'}
          </button>
        )}
      </div>

      {editing ? (
        <PreferencesForm preferences={preferences} onSave={onSave} onCancel={onCancel} />
      ) : preferences ? (
        <PreferencesView preferences={preferences} />
      ) : (
        <div className="text-center py-16 text-gray-400 text-sm">
          No preferences set yet. Click &ldquo;Set Preferences&rdquo; to get started.
        </div>
      )}
    </div>
  );
}

function PreferencesView({ preferences }: { preferences: Preferences }) {
  const items: { label: string; value: string | null }[] = [
    { label: 'Property Types', value: preferences.property_types.length ? preferences.property_types.join(', ') : null },
    { label: 'Neighborhoods', value: preferences.neighborhoods.length ? preferences.neighborhoods.join(', ') : null },
    { label: 'Boroughs', value: preferences.boroughs.length ? preferences.boroughs.join(', ') : null },
    { label: 'Bedrooms', value: preferences.min_beds != null || preferences.max_beds != null
      ? `${preferences.min_beds ?? 'Any'} - ${preferences.max_beds ?? 'Any'}`
      : null },
    { label: 'Bathrooms', value: preferences.min_baths != null ? `${preferences.min_baths}+` : null },
    { label: 'Monthly Rent', value: preferences.min_price || preferences.max_price
      ? `${preferences.min_price ? formatRent(preferences.min_price) : 'Any'} - ${preferences.max_price ? formatRent(preferences.max_price) : 'Any'}`
      : null },
    { label: 'Min Sqft', value: preferences.min_sqft ? `${preferences.min_sqft.toLocaleString()} sqft` : null },
    { label: 'Must-Haves', value: preferences.must_haves.length ? preferences.must_haves.join(', ') : null },
    { label: 'Deal-Breakers', value: preferences.deal_breakers.length ? preferences.deal_breakers.join(', ') : null },
    { label: 'Move-In Date', value: preferences.move_in_date ? formatDate(preferences.move_in_date) : null },
    { label: 'Notes', value: preferences.notes },
  ];

  return (
    <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100">
      {items.filter((it) => it.value).map((it) => (
        <div key={it.label} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1">
          <span className="text-xs font-semibold text-gray-500 sm:w-36 flex-shrink-0">{it.label}</span>
          <span className="text-sm text-gray-900">{it.value}</span>
        </div>
      ))}
      {items.every((it) => !it.value) && (
        <div className="px-4 py-8 text-center text-gray-400 text-xs">No preferences filled in yet.</div>
      )}
    </div>
  );
}

function PreferencesForm({
  preferences, onSave, onCancel,
}: {
  preferences: Preferences | null;
  onSave: (prefs: Preferences) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Preferences>({
    property_types: preferences?.property_types ?? [],
    neighborhoods: preferences?.neighborhoods ?? [],
    boroughs: preferences?.boroughs ?? [],
    min_beds: preferences?.min_beds ?? null,
    max_beds: preferences?.max_beds ?? null,
    min_baths: preferences?.min_baths ?? null,
    min_price: preferences?.min_price ?? null,
    max_price: preferences?.max_price ?? null,
    min_sqft: preferences?.min_sqft ?? null,
    must_haves: preferences?.must_haves ?? [],
    deal_breakers: preferences?.deal_breakers ?? [],
    move_in_date: preferences?.move_in_date ?? null,
    notes: preferences?.notes ?? null,
  });

  const toggleArr = (field: keyof Preferences, value: string) => {
    setForm((prev) => {
      const arr = (prev[field] as string[]) ?? [];
      return {
        ...prev,
        [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
    });
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-5 space-y-6">
      {/* Property Types */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Property Types</label>
        <div className="flex flex-wrap gap-2">
          {RENTAL_PROPERTY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => toggleArr('property_types', t)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                form.property_types.includes(t)
                  ? 'bg-purple-100 border-purple-300 text-purple-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Boroughs */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Boroughs</label>
        <div className="flex flex-wrap gap-2">
          {BOROUGHS.map((b) => (
            <button
              key={b}
              onClick={() => toggleArr('boroughs', b)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                form.boroughs.includes(b)
                  ? 'bg-purple-100 border-purple-300 text-purple-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Neighborhoods */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Neighborhoods</label>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-2">
          {NYC_NEIGHBORHOODS.map((n) => (
            <button
              key={n}
              onClick={() => toggleArr('neighborhoods', n)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                form.neighborhoods.includes(n)
                  ? 'bg-purple-100 border-purple-300 text-purple-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Beds / Baths */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">Min Beds</label>
          <select
            value={form.min_beds ?? ''}
            onChange={(e) => setForm({ ...form, min_beds: e.target.value ? Number(e.target.value) : null })}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
          >
            <option value="">Any</option>
            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? 'Studio' : n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">Max Beds</label>
          <select
            value={form.max_beds ?? ''}
            onChange={(e) => setForm({ ...form, max_beds: e.target.value ? Number(e.target.value) : null })}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
          >
            <option value="">Any</option>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n === 0 ? 'Studio' : n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">Min Baths</label>
          <select
            value={form.min_baths ?? ''}
            onChange={(e) => setForm({ ...form, min_baths: e.target.value ? Number(e.target.value) : null })}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
          >
            <option value="">Any</option>
            {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">Min Sqft</label>
          <input
            type="number"
            value={form.min_sqft ?? ''}
            onChange={(e) => setForm({ ...form, min_sqft: e.target.value ? Number(e.target.value) : null })}
            placeholder="Any"
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
          />
        </div>
      </div>

      {/* Monthly Rent Range */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Monthly Rent Range</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Min Rent</label>
            <input
              type="number"
              value={form.min_price ?? ''}
              onChange={(e) => setForm({ ...form, min_price: e.target.value || null })}
              placeholder="$0"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">Max Rent</label>
            <input
              type="number"
              value={form.max_price ?? ''}
              onChange={(e) => setForm({ ...form, max_price: e.target.value || null })}
              placeholder="No max"
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Move-In Date */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Move-In Date</label>
        <input
          type="date"
          value={form.move_in_date ?? ''}
          onChange={(e) => setForm({ ...form, move_in_date: e.target.value || null })}
          className="w-full sm:w-48 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
        />
      </div>

      {/* Must-Haves */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Must-Haves</label>
        <div className="flex flex-wrap gap-2">
          {RENTAL_MUST_HAVES.map((m) => (
            <button
              key={m}
              onClick={() => toggleArr('must_haves', m)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                form.must_haves.includes(m)
                  ? 'bg-green-100 border-green-300 text-green-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Deal-Breakers */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Deal-Breakers</label>
        <div className="flex flex-wrap gap-2">
          {RENTAL_DEAL_BREAKERS.map((d) => (
            <button
              key={d}
              onClick={() => toggleArr('deal_breakers', d)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                form.deal_breakers.includes(d)
                  ? 'bg-red-100 border-red-300 text-red-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Notes for Your Agent</label>
        <textarea
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
          placeholder="Anything else your agent should know (commute needs, roommate situation, pets, etc.)"
          rows={3}
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSave(form)}
          className="px-5 py-2 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          Save Preferences
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   FAMILY TAB
   ════════════════════════════════════════════════════════════════════════════ */

function FamilyTab({
  family, showInvite, onToggleInvite, onInvite,
}: {
  family: FamilyMember[];
  showInvite: boolean;
  onToggleInvite: () => void;
  onInvite: (first: string, last: string, email: string, relationship: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Family & Partners</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Invite a spouse, partner, or roommate to follow along on your rental search.
          </p>
        </div>
        <button
          onClick={onToggleInvite}
          className="px-3 py-1.5 text-xs font-medium text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
        >
          {showInvite ? 'Cancel' : '+ Invite'}
        </button>
      </div>

      {showInvite && <FamilyInviteForm onSubmit={onInvite} />}

      {family.length === 0 && !showInvite ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No family members added yet. Invite someone to share your rental search.
        </div>
      ) : (
        <div className="space-y-3">
          {family.map((m) => (
            <div key={m.id} className="border border-gray-200 rounded-xl bg-white p-4 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">{m.member.name}</h4>
                <p className="text-xs text-gray-500">{m.member.email}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{m.relationship}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                m.member.active ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                {m.member.active ? 'Active' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FamilyInviteForm({ onSubmit }: { onSubmit: (first: string, last: string, email: string, rel: string) => void }) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [rel, setRel] = useState('partner');

  return (
    <div className="border border-purple-200 bg-purple-50 rounded-xl p-4 mb-5">
      <h3 className="text-sm font-semibold text-purple-800 mb-3">Invite a Family Member</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="text"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder="First name"
          className="px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
        />
        <input
          type="text"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          placeholder="Last name"
          className="px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
        />
        <select
          value={rel}
          onChange={(e) => setRel(e.target.value)}
          className="px-3 py-2 text-xs border border-purple-200 rounded-lg bg-white"
        >
          <option value="partner">Partner</option>
          <option value="spouse">Spouse</option>
          <option value="roommate">Roommate</option>
          <option value="parent">Parent</option>
          <option value="guarantor">Guarantor</option>
          <option value="other">Other</option>
        </select>
      </div>
      <button
        onClick={() => onSubmit(first, last, email, rel)}
        disabled={!first.trim() || !last.trim() || !email.trim()}
        className="mt-3 px-4 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors"
      >
        Send Invitation
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PROFILE TAB
   ════════════════════════════════════════════════════════════════════════════ */

function ProfileTab({ user }: { user: UserProfile }) {
  const items = [
    { label: 'Name', value: `${user.first_name} ${user.last_name}` },
    { label: 'Email', value: user.email },
    { label: 'Phone', value: user.phone },
    { label: 'Portal Role', value: 'Tenant' },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Your Profile</h2>
      <p className="text-xs text-gray-500 mb-5">
        Contact your agent to update your information.
      </p>
      <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100">
        {items.map((it) => (
          <div key={it.label} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1">
            <span className="text-xs font-semibold text-gray-500 sm:w-32 flex-shrink-0">{it.label}</span>
            <span className="text-sm text-gray-900">{it.value || '--'}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 mt-4">
        Mallan Real Estate Inc. | Licensed Real Estate Broker | 646-258-4460
      </p>
    </div>
  );
}
