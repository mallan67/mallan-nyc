'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/* ───────── Types ───────── */

interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface AuthData {
  authenticated: boolean;
  principalType: string;
  portalRole: string | null;
  primaryPortalRole: string | null;
  enabledWorkspaces: string[];
  user: AuthUser | null;
}

interface PortalListing {
  id: string;
  listing_id: string | null;
  address: string;
  list_price: string | null;
  status: string | null;
  listing_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  photo_url: string | null;
  reactions: Record<string, boolean>;
}

interface ExternalPortalListing {
  id: string;
  url: string | null;
  normalized_url: string | null;
  source_host: string | null;
  address: string | null;
  title: string | null;
  notes: string | null;
  status: string;
  action_bucket: string;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  listing_id: string;
  parent_id: string | null;
  body: string;
  author: { id: string; name: string; isMe: boolean };
  created_at: string;
}

interface ExternalListingComment {
  id: string;
  external_listing_id: string;
  body: string;
  request_type: string;
  author: { type: string; id: string; name: string; email: string } | null;
  created_at: string;
}

interface Showing {
  id: string;
  listing_id: string;
  date: string;
  time: string | null;
  type: string | null;
  status: string;
  notes: string | null;
  listing: {
    id: string;
    listing_id: string | null;
    address: string;
    list_price: string;
    listing_type: string | null;
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
  move_in_date: string | null;
  notes: string | null;
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

/* ───────── Constants ───────── */

const TABS = ['Listings', 'Showings', 'Preferences', 'Family', 'Profile'] as const;
type Tab = (typeof TABS)[number];

const PROPERTY_TYPE_OPTIONS = [
  'Condo', 'Co-op', 'Condop', 'Townhouse', 'Single Family', 'Multi-Family',
];

const BOROUGH_OPTIONS = [
  'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island',
];

const MUST_HAVE_OPTIONS = [
  'Doorman', 'Elevator', 'Laundry In-Unit', 'Laundry In-Building', 'Parking',
  'Gym', 'Roof Deck', 'Storage', 'Pet Friendly', 'Outdoor Space',
  'Dishwasher', 'Central Air', 'Fireplace', 'Home Office',
];

const RELATIONSHIP_OPTIONS = [
  'spouse', 'partner', 'parent', 'child', 'sibling', 'friend', 'other',
];

const EXTERNAL_LISTING_BUCKETS = [
  { key: 'saved', label: 'Saved' },
  { key: 'seen', label: 'Seen' },
  { key: 'liked', label: 'Like' },
  { key: 'discuss', label: 'Discuss' },
  { key: 'disliked', label: 'Pass' },
];

/* ───────── Helpers ───────── */

function fmtPrice(val: string | null | undefined): string {
  if (!val) return '—';
  const n = Number(val);
  if (isNaN(n)) return val;
  return '$' + n.toLocaleString('en-US');
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function statusBadge(status: string | null): { text: string; cls: string } {
  switch (status?.toLowerCase()) {
    case 'active': return { text: 'Active', cls: 'bg-blue-100 text-blue-700' };
    case 'under contract':
    case 'contract': return { text: 'Under Contract', cls: 'bg-purple-100 text-purple-700' };
    case 'pending': return { text: 'Pending', cls: 'bg-orange-100 text-orange-700' };
    case 'closed':
    case 'sold': return { text: 'Sold', cls: 'bg-green-100 text-green-700' };
    case 'comingsoon':
    case 'coming soon': return { text: 'Coming Soon — No Showings Until Listed', cls: 'bg-yellow-100 text-yellow-700' };
    default: return { text: status || 'Unknown', cls: 'bg-gray-100 text-gray-600' };
  }
}

function showingStatusBadge(status: string): { text: string; cls: string } {
  switch (status) {
    case 'requested': return { text: 'Requested', cls: 'bg-yellow-100 text-yellow-700' };
    case 'confirmed': return { text: 'Confirmed', cls: 'bg-blue-100 text-blue-700' };
    case 'completed': return { text: 'Completed', cls: 'bg-green-100 text-green-700' };
    case 'cancelled': return { text: 'Cancelled', cls: 'bg-red-100 text-red-700' };
    default: return { text: status, cls: 'bg-gray-100 text-gray-600' };
  }
}

/* ───────── Page Component ───────── */

export default function BuyerPortalPage() {
  const router = useRouter();

  /* ── Auth state ── */
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [enabledWorkspaces, setEnabledWorkspaces] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  /* ── Tab ── */
  const [tab, setTab] = useState<Tab>('Listings');

  /* ── Listings ── */
  const [listings, setListings] = useState<PortalListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [externalListings, setExternalListings] = useState<ExternalPortalListing[]>([]);
  const [externalListingsLoading, setExternalListingsLoading] = useState(true);

  /* ── Comments per listing (keyed by listing id) ── */
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({});
  const [commentsOpen, setCommentsOpen] = useState<Record<string, boolean>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [commentSubmitting, setCommentSubmitting] = useState<Record<string, boolean>>({});
  const [externalCommentsMap, setExternalCommentsMap] = useState<Record<string, ExternalListingComment[]>>({});
  const [externalCommentDrafts, setExternalCommentDrafts] = useState<Record<string, string>>({});

  /* ── Listing request form ── */
  const [listingReqOpen, setListingReqOpen] = useState(false);
  const [listingReqUrl, setListingReqUrl] = useState('');
  const [listingReqAddress, setListingReqAddress] = useState('');
  const [listingReqNotes, setListingReqNotes] = useState('');
  const [listingReqSubmitting, setListingReqSubmitting] = useState(false);
  const [listingReqSuccess, setListingReqSuccess] = useState('');

  /* ── Showing request modal ── */
  const [showingModalOpen, setShowingModalOpen] = useState(false);
  const [showingModalListingId, setShowingModalListingId] = useState('');
  const [showingModalDate, setShowingModalDate] = useState('');
  const [showingModalTime, setShowingModalTime] = useState('');
  const [showingModalNotes, setShowingModalNotes] = useState('');
  const [showingModalSubmitting, setShowingModalSubmitting] = useState(false);
  const [showingModalError, setShowingModalError] = useState('');

  /* ── Showings ── */
  const [showings, setShowings] = useState<Showing[]>([]);
  const [showingsLoading, setShowingsLoading] = useState(true);

  /* ── Preferences ── */
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsEditing, setPrefsEditing] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState<Preferences | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);

  /* ── Family ── */
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [familyLoading, setFamilyLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFirst, setInviteFirst] = useState('');
  const [inviteLast, setInviteLast] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRelationship, setInviteRelationship] = useState('spouse');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  /* ── Couple invite ── */
  const [inviteCouple, setInviteCouple] = useState(false);
  const [invite2First, setInvite2First] = useState('');
  const [invite2Last, setInvite2Last] = useState('');
  const [invite2Email, setInvite2Email] = useState('');
  const [invite2Phone, setInvite2Phone] = useState('');
  const [invite2Relationship, setInvite2Relationship] = useState('partner');

  /* ── Toast ── */
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  /* ───────── Auth Check ───────── */

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data: AuthData) => {
        if (!data.authenticated || data.principalType !== 'lead') {
          router.replace('/sign-in');
          return;
        }

        const ws = data.enabledWorkspaces || [data.primaryPortalRole || data.portalRole].filter(Boolean) as string[];

        // Must have buyer workspace or buyer portal role
        if (!ws.includes('buyer') && data.portalRole !== 'buyer') {
          router.replace('/portal');
          return;
        }

        setAuthUser(data.user);
        setEnabledWorkspaces(ws);
        setReady(true);
      })
      .catch(() => router.replace('/sign-in'));
  }, [router]);

  /* ───────── Data Fetchers ───────── */

  const fetchListings = useCallback(async () => {
    setListingsLoading(true);
    try {
      const res = await fetch('/api/portal/listings');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setListings(data.listings || []);
    } catch {
      setListings([]);
    } finally {
      setListingsLoading(false);
    }
  }, []);

  const fetchExternalListings = useCallback(async () => {
    setExternalListingsLoading(true);
    try {
      const res = await fetch('/api/portal/external-listings');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setExternalListings(data.external_listings || []);
    } catch {
      setExternalListings([]);
    } finally {
      setExternalListingsLoading(false);
    }
  }, []);

  const fetchShowings = useCallback(async () => {
    setShowingsLoading(true);
    try {
      const res = await fetch('/api/portal/showings');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setShowings(data.showings || []);
    } catch {
      setShowings([]);
    } finally {
      setShowingsLoading(false);
    }
  }, []);

  const fetchPreferences = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const res = await fetch('/api/portal/preferences');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPreferences(data.preferences || null);
    } catch {
      setPreferences(null);
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  const fetchFamily = useCallback(async () => {
    setFamilyLoading(true);
    try {
      const res = await fetch('/api/portal/family');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFamily(data.family || []);
    } catch {
      setFamily([]);
    } finally {
      setFamilyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetchListings();
    fetchExternalListings();
    fetchShowings();
    fetchPreferences();
    fetchFamily();
  }, [ready, fetchListings, fetchExternalListings, fetchShowings, fetchPreferences, fetchFamily]);

  useEffect(() => {
    if (!ready || externalListings.length === 0) return;
    externalListings.forEach((item) => {
      if (externalCommentsMap[item.id] === undefined) {
        fetchExternalListingComments(item.id);
      }
    });
  }, [ready, externalListings, externalCommentsMap]);

  /* ───────── Reactions ───────── */

  async function handleReaction(listingId: string, action: string) {
    try {
      const res = await fetch(`/api/portal/listings/${listingId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to react', 'error');
        return;
      }
      const data = await res.json();
      // Update local state
      setListings((prev) =>
        prev.map((l) => {
          if (l.id !== listingId) return l;
          const next = { ...l.reactions };
          if (data.active) next[action] = true;
          else delete next[action];
          return { ...l, reactions: next };
        })
      );
    } catch {
      showToast('Failed to react', 'error');
    }
  }

  /* ───────── Comments ───────── */

  async function fetchComments(listingId: string) {
    try {
      const res = await fetch(`/api/portal/listings/${listingId}/comments`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCommentsMap((prev) => ({ ...prev, [listingId]: data.comments || [] }));
    } catch {
      setCommentsMap((prev) => ({ ...prev, [listingId]: [] }));
    }
  }

  function toggleComments(listingId: string) {
    const isOpen = commentsOpen[listingId];
    if (!isOpen) fetchComments(listingId);
    setCommentsOpen((prev) => ({ ...prev, [listingId]: !isOpen }));
  }

  async function submitComment(listingId: string, parentId?: string) {
    const body = replyDrafts[parentId || listingId]?.trim();
    if (!body) return;
    setCommentSubmitting((prev) => ({ ...prev, [parentId || listingId]: true }));
    try {
      const res = await fetch(`/api/portal/listings/${listingId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, parent_id: parentId || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to post comment', 'error');
        return;
      }
      setReplyDrafts((prev) => ({ ...prev, [parentId || listingId]: '' }));
      await fetchComments(listingId);
    } catch {
      showToast('Failed to post comment', 'error');
    } finally {
      setCommentSubmitting((prev) => ({ ...prev, [parentId || listingId]: false }));
    }
  }

  /* ───────── Listing Request ───────── */

  async function submitListingRequest() {
    if (!listingReqUrl && !listingReqAddress) return;
    setListingReqSubmitting(true);
    setListingReqSuccess('');
    try {
      const res = await fetch('/api/portal/external-listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: listingReqUrl || undefined,
          address: listingReqAddress || undefined,
          notes: listingReqNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to send request', 'error');
        return;
      }
      const data = await res.json();
      setListingReqSuccess('Saved and sent to your agent.');
      if (data.external_listing) {
        setExternalListings((prev) => [
          data.external_listing,
          ...prev.filter((item) => item.id !== data.external_listing.id),
        ]);
      }
      setListingReqUrl('');
      setListingReqAddress('');
      setListingReqNotes('');
      setTimeout(() => {
        setListingReqSuccess('');
        setListingReqOpen(false);
      }, 2500);
    } catch {
      showToast('Failed to send request', 'error');
    } finally {
      setListingReqSubmitting(false);
    }
  }

  async function updateExternalListingBucket(externalListingId: string, bucket: string) {
    try {
      const res = await fetch(`/api/portal/external-listings/${externalListingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_bucket: bucket }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to update outside listing', 'error');
        return;
      }
      const data = await res.json();
      if (data.external_listing) {
        setExternalListings((prev) =>
          prev.map((item) => item.id === externalListingId ? data.external_listing : item)
        );
      }
    } catch {
      showToast('Failed to update outside listing', 'error');
    }
  }

  /* ───────── Showing Request ───────── */

  async function fetchExternalListingComments(externalListingId: string) {
    try {
      const res = await fetch(`/api/portal/external-listings/${externalListingId}/comments`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setExternalCommentsMap((prev) => ({ ...prev, [externalListingId]: data.comments || [] }));
    } catch {
      setExternalCommentsMap((prev) => ({ ...prev, [externalListingId]: [] }));
    }
  }

  async function submitExternalListingComment(
    externalListingId: string,
    requestType: 'comment' | 'request_info' | 'showing_request' = 'comment',
    fallbackBody?: string,
  ) {
    const body = externalCommentDrafts[externalListingId]?.trim() || fallbackBody || '';
    if (!body) return;
    try {
      const res = await fetch(`/api/portal/external-listings/${externalListingId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, request_type: requestType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to send note', 'error');
        return;
      }
      const data = await res.json();
      if (data.comment) {
        setExternalCommentsMap((prev) => ({
          ...prev,
          [externalListingId]: [...(prev[externalListingId] || []), data.comment],
        }));
      }
      setExternalCommentDrafts((prev) => ({ ...prev, [externalListingId]: '' }));
    } catch {
      showToast('Failed to send note', 'error');
    }
  }

  function openShowingModal(listingId: string) {
    setShowingModalListingId(listingId);
    setShowingModalDate('');
    setShowingModalTime('');
    setShowingModalNotes('');
    setShowingModalError('');
    setShowingModalOpen(true);
  }

  async function submitShowingRequest() {
    if (!showingModalListingId || !showingModalDate) {
      setShowingModalError('Please select a date.');
      return;
    }
    setShowingModalSubmitting(true);
    setShowingModalError('');
    try {
      const res = await fetch('/api/portal/showings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: showingModalListingId,
          date: showingModalDate,
          time: showingModalTime || undefined,
          notes: showingModalNotes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setShowingModalError(err.error || 'Failed to request showing');
        return;
      }
      setShowingModalOpen(false);
      showToast('Showing request sent!');
      fetchShowings();
    } catch {
      setShowingModalError('Failed to request showing');
    } finally {
      setShowingModalSubmitting(false);
    }
  }

  /* ───────── Preferences Save ───────── */

  function startEditPrefs() {
    setPrefsDraft(
      preferences
        ? { ...preferences }
        : {
            property_types: [],
            neighborhoods: [],
            boroughs: [],
            min_beds: null,
            max_beds: null,
            min_baths: null,
            min_price: null,
            max_price: null,
            min_sqft: null,
            must_haves: [],
            deal_breakers: [],
            move_in_date: null,
            notes: null,
          }
    );
    setPrefsEditing(true);
  }

  async function savePrefs() {
    if (!prefsDraft) return;
    setPrefsSaving(true);
    try {
      const res = await fetch('/api/portal/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefsDraft),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to save preferences', 'error');
        return;
      }
      const data = await res.json();
      setPreferences(data.preferences);
      setPrefsEditing(false);
      showToast('Preferences saved!');
    } catch {
      showToast('Failed to save preferences', 'error');
    } finally {
      setPrefsSaving(false);
    }
  }

  /* ── Preference draft helpers ── */
  function togglePrefArray(field: 'property_types' | 'neighborhoods' | 'boroughs' | 'must_haves' | 'deal_breakers', value: string) {
    if (!prefsDraft) return;
    const arr = prefsDraft[field] || [];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    setPrefsDraft({ ...prefsDraft, [field]: next });
  }

  function setPrefNum(field: keyof Preferences, value: string) {
    if (!prefsDraft) return;
    const num = value === '' ? null : Number(value);
    setPrefsDraft({ ...prefsDraft, [field]: num });
  }

  function setPrefStr(field: keyof Preferences, value: string) {
    if (!prefsDraft) return;
    setPrefsDraft({ ...prefsDraft, [field]: value || null });
  }

  /* ───────── Family Invite ───────── */

  async function submitInvite() {
    if (!inviteFirst || !inviteLast || !inviteEmail) {
      setInviteError('First name, last name, and email are required.');
      return;
    }
    setInviteSubmitting(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      // Invite first person
      const res = await fetch('/api/portal/family/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: inviteFirst,
          last_name: inviteLast,
          email: inviteEmail,
          phone: invitePhone || undefined,
          relationship: inviteRelationship,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setInviteError(err.error || 'Failed to invite');
        return;
      }

      // If couple, invite second person
      if (inviteCouple && invite2First && invite2Last && invite2Email) {
        const res2 = await fetch('/api/portal/family/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: invite2First,
            last_name: invite2Last,
            email: invite2Email,
            phone: invite2Phone || undefined,
            relationship: invite2Relationship,
          }),
        });
        if (!res2.ok) {
          const err2 = await res2.json().catch(() => ({}));
          setInviteError(`First person invited, but second failed: ${err2.error || 'Unknown error'}`);
          fetchFamily();
          return;
        }
      }

      setInviteSuccess('Invite sent!');
      setInviteFirst(''); setInviteLast(''); setInviteEmail(''); setInvitePhone('');
      setInvite2First(''); setInvite2Last(''); setInvite2Email(''); setInvite2Phone('');
      setInviteCouple(false);
      fetchFamily();
      setTimeout(() => { setInviteSuccess(''); setInviteOpen(false); }, 2500);
    } catch {
      setInviteError('Failed to invite');
    } finally {
      setInviteSubmitting(false);
    }
  }

  /* ───────── Sign Out ───────── */

  function handleSignOut() {
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => router.replace('/sign-in'));
  }

  /* ───────── Loading Screen ───────── */

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  /* ───────── Render ───────── */

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Showing Request Modal */}
      {showingModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Request a Showing</h3>
            {showingModalError && <p className="text-sm text-red-600 mb-3">{showingModalError}</p>}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Date *</label>
                <input
                  type="date"
                  value={showingModalDate}
                  onChange={(e) => setShowingModalDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Preferred Time</label>
                <input
                  type="time"
                  value={showingModalTime}
                  onChange={(e) => setShowingModalTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Notes</label>
                <textarea
                  value={showingModalNotes}
                  onChange={(e) => setShowingModalNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-none"
                  placeholder="Any scheduling preferences..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowingModalOpen(false)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitShowingRequest}
                disabled={showingModalSubmitting}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {showingModalSubmitting ? 'Sending...' : 'Request Showing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              {enabledWorkspaces.length > 1 && (
                <button
                  onClick={() => router.push('/portal')}
                  className="text-sm text-gray-500 hover:text-gray-800 transition-colors mr-2"
                >
                  &larr; Back to Portal
                </button>
              )}
              <h1 className="text-lg font-bold text-gray-900">Buyer Portal</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 hidden sm:inline">{authUser?.name}</span>
              <button
                onClick={handleSignOut}
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto -mb-px">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* ═══════ LISTINGS TAB ═══════ */}
        {tab === 'Listings' && (
          <div>
            {/* Listing request toggle */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Your Listings</h2>
              <button
                onClick={() => setListingReqOpen(!listingReqOpen)}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                {listingReqOpen ? 'Close' : 'Request a Listing'}
              </button>
            </div>

            {/* Listing request form */}
            {listingReqOpen && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">
                  Send a listing link or address to your agent
                </h3>
                {listingReqSuccess && <p className="text-sm text-green-700 mb-3">{listingReqSuccess}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Listing URL</label>
                    <input
                      type="url"
                      value={listingReqUrl}
                      onChange={(e) => setListingReqUrl(e.target.value)}
                      placeholder="https://streeteasy.com/..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Address</label>
                    <input
                      type="text"
                      value={listingReqAddress}
                      onChange={(e) => setListingReqAddress(e.target.value)}
                      placeholder="123 Main St, Apt 4B"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Notes (optional)</label>
                  <textarea
                    value={listingReqNotes}
                    onChange={(e) => setListingReqNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-none"
                    placeholder="Anything you want your agent to know..."
                  />
                </div>
                <div className="mt-3 text-right">
                  <button
                    onClick={submitListingRequest}
                    disabled={listingReqSubmitting || (!listingReqUrl && !listingReqAddress)}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {listingReqSubmitting ? 'Sending...' : 'Send to Agent'}
                  </button>
                </div>
              </div>
            )}

            {/* Buyer-submitted outside listings */}
            {(externalListingsLoading || externalListings.length > 0) && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">Outside Listings</h3>
                  <span className="text-xs text-gray-400">Not IDX inventory</span>
                </div>
                {externalListingsLoading ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {externalListings.map((item) => (
                      <div key={item.id} className="bg-white border border-amber-200 rounded-xl p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                                Outside Listing
                              </span>
                              <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                                {item.action_bucket}
                              </span>
                            </div>
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                              {item.title || item.address || item.source_host || 'Submitted listing'}
                            </h3>
                            {item.address && (
                              <p className="text-xs text-gray-500 mt-1">{item.address}</p>
                            )}
                            {item.notes && (
                              <p className="text-xs text-gray-600 mt-2">{item.notes}</p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-2">
                              Added {fmtDate(item.created_at)}
                              {item.source_host ? ` from ${item.source_host}` : ''}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-3">
                              {EXTERNAL_LISTING_BUCKETS.map((bucket) => {
                                const active = item.action_bucket === bucket.key;
                                return (
                                  <button
                                    key={bucket.key}
                                    onClick={() => updateExternalListingBucket(item.id, bucket.key)}
                                    className={`border rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                      active
                                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                                        : 'border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                                    }`}
                                  >
                                    {bucket.label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-4 border-t border-gray-100 pt-3">
                              <p className="text-xs font-semibold text-gray-700 mb-2">Notes / Requests</p>
                              {(externalCommentsMap[item.id] || []).length === 0 ? (
                                <p className="text-xs text-gray-400 mb-2">No notes yet.</p>
                              ) : (
                                <div className="space-y-2 mb-3">
                                  {(externalCommentsMap[item.id] || []).map((comment) => (
                                    <div key={comment.id} className="rounded-lg bg-gray-50 px-3 py-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-semibold text-gray-700">{comment.author?.name || 'Mallan NYC'}</span>
                                          {comment.request_type !== 'comment' && (
                                            <span className="text-[10px] uppercase font-semibold bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">
                                              {comment.request_type === 'showing_request' ? 'Tour' : 'Info'}
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[10px] text-gray-400">{fmtDateTime(comment.created_at)}</span>
                                      </div>
                                      <p className="text-xs text-gray-700 mt-1">{comment.body}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <textarea
                                value={externalCommentDrafts[item.id] || ''}
                                onChange={(e) => setExternalCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                rows={2}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-none"
                                placeholder="Ask a question or add context for your agent..."
                              />
                              <div className="flex flex-wrap gap-2 justify-end mt-2">
                                <button
                                  onClick={() => submitExternalListingComment(item.id, 'comment')}
                                  disabled={!externalCommentDrafts[item.id]?.trim()}
                                  className="border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                                >
                                  Add Note
                                </button>
                                <button
                                  onClick={() => submitExternalListingComment(item.id, 'request_info')}
                                  disabled={!externalCommentDrafts[item.id]?.trim()}
                                  className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                                >
                                  Request Info
                                </button>
                                <button
                                  onClick={() => submitExternalListingComment(item.id, 'showing_request', 'I would like to schedule a tour or have my agent investigate this outside listing.')}
                                  className="bg-amber-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-amber-700"
                                >
                                  Request Tour
                                </button>
                              </div>
                            </div>
                          </div>
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="flex-shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800"
                            >
                              Open
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Listing cards */}
            {listingsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : listings.length === 0 && externalListings.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                No listings shared with you yet. Your agent will add listings for you to review.
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No agent-shared IDX listings yet.
              </div>
            ) : (
              <div className="space-y-4">
                {listings.map((listing) => {
                  const badge = statusBadge(listing.status);
                  const comments = commentsMap[listing.id] || [];
                  const isCommentsOpen = commentsOpen[listing.id];

                  return (
                    <div key={listing.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="p-5">
                        {/* Address + status */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                              {listing.address}
                            </h3>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                              {listing.listing_type && <span>{listing.listing_type}</span>}
                              {listing.bedrooms != null && <span>{listing.bedrooms} bed</span>}
                              {listing.bathrooms != null && <span>{listing.bathrooms} bath</span>}
                              {listing.sqft != null && <span>{listing.sqft.toLocaleString()} sqft</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                              {badge.text}
                            </span>
                          </div>
                        </div>

                        {/* Price */}
                        <div className="text-lg font-bold text-gray-900 mb-3">
                          {fmtPrice(listing.list_price)}
                        </div>

                        {/* Reaction buttons */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {[
                            { action: 'liked', label: 'Like', icon: '\u2764\uFE0F', activeClass: 'bg-red-50 border-red-300 text-red-700' },
                            { action: 'disliked', label: 'Pass', icon: '\u{1F44E}', activeClass: 'bg-gray-100 border-gray-400 text-gray-700' },
                            { action: 'discuss', label: "Let's Discuss", icon: '\u{1F4AC}', activeClass: 'bg-purple-50 border-purple-300 text-purple-700' },
                            { action: 'schedule', label: 'Tour', icon: '\u{1F4C5}', activeClass: 'bg-blue-50 border-blue-300 text-blue-700' },
                          ].map(({ action, label, icon, activeClass }) => {
                            const isActive = listing.reactions[action];
                            return (
                              <button
                                key={action}
                                onClick={() => {
                                  if (action === 'schedule') {
                                    openShowingModal(listing.id);
                                  } else {
                                    handleReaction(listing.id, action);
                                  }
                                }}
                                className={`inline-flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                  isActive
                                    ? activeClass
                                    : 'border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                                }`}
                              >
                                <span>{icon}</span>
                                {label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Comments toggle */}
                        <button
                          onClick={() => toggleComments(listing.id)}
                          className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                        >
                          {isCommentsOpen ? 'Hide comments' : `Comments${comments.length > 0 ? ` (${comments.length})` : ''}`}
                        </button>
                      </div>

                      {/* Comments thread */}
                      {isCommentsOpen && (
                        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                          {comments.length === 0 ? (
                            <p className="text-xs text-gray-400 mb-3">No comments yet.</p>
                          ) : (
                            <div className="space-y-3 mb-3">
                              {comments
                                .filter((c) => !c.parent_id)
                                .map((c) => (
                                  <div key={c.id}>
                                    <div className="flex items-start gap-2">
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.author.isMe ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                                        {c.author.name.charAt(0).toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-xs font-semibold text-gray-800">{c.author.name}</span>
                                          <span className="text-[10px] text-gray-400">{fmtDateTime(c.created_at)}</span>
                                        </div>
                                        <p className="text-sm text-gray-700 mt-0.5">{c.body}</p>
                                      </div>
                                    </div>
                                    {/* Replies */}
                                    {comments
                                      .filter((r) => r.parent_id === c.id)
                                      .map((r) => (
                                        <div key={r.id} className="ml-8 mt-2 flex items-start gap-2">
                                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${r.author.isMe ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                                            {r.author.name.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2">
                                              <span className="text-xs font-semibold text-gray-800">{r.author.name}</span>
                                              <span className="text-[10px] text-gray-400">{fmtDateTime(r.created_at)}</span>
                                            </div>
                                            <p className="text-xs text-gray-700 mt-0.5">{r.body}</p>
                                          </div>
                                        </div>
                                      ))}
                                    {/* Reply input */}
                                    <div className="ml-8 mt-2 flex gap-2">
                                      <input
                                        type="text"
                                        value={replyDrafts[c.id] || ''}
                                        onChange={(e) =>
                                          setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            submitComment(listing.id, c.id);
                                          }
                                        }}
                                        placeholder="Reply..."
                                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                                      />
                                      <button
                                        onClick={() => submitComment(listing.id, c.id)}
                                        disabled={commentSubmitting[c.id]}
                                        className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                                      >
                                        {commentSubmitting[c.id] ? '...' : 'Send'}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                          {/* New comment */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={replyDrafts[listing.id] || ''}
                              onChange={(e) =>
                                setReplyDrafts((prev) => ({ ...prev, [listing.id]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  submitComment(listing.id);
                                }
                              }}
                              placeholder="Add a comment..."
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                            />
                            <button
                              onClick={() => submitComment(listing.id)}
                              disabled={commentSubmitting[listing.id]}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                              {commentSubmitting[listing.id] ? '...' : 'Send'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════ SHOWINGS TAB ═══════ */}
        {tab === 'Showings' && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-5">Your Showings</h2>

            {showingsLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : showings.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                No showings scheduled. Request a showing from the Listings tab.
              </div>
            ) : (
              <div className="space-y-4">
                {showings.map((s) => {
                  const badge = showingStatusBadge(s.status);
                  return (
                    <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                            {s.listing.address}
                          </h3>
                          <div className="text-sm font-bold text-gray-900 mt-1">
                            {fmtPrice(s.listing.list_price)}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                            <span>{fmtDate(s.date)}</span>
                            {s.time && <span>{s.time}</span>}
                            {s.type && <span className="capitalize">{s.type}</span>}
                          </div>
                          {s.notes && (
                            <p className="text-xs text-gray-500 mt-2 italic">{s.notes}</p>
                          )}
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>
                          {badge.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════ PREFERENCES TAB ═══════ */}
        {tab === 'Preferences' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Search Preferences</h2>
              {!prefsEditing && (
                <button
                  onClick={startEditPrefs}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>

            {prefsLoading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-3 bg-gray-200 rounded w-2/3" />
                  ))}
                </div>
              </div>
            ) : prefsEditing && prefsDraft ? (
              /* ── Edit mode ── */
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
                {/* Property types */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-2">Property Types</label>
                  <div className="flex flex-wrap gap-2">
                    {PROPERTY_TYPE_OPTIONS.map((pt) => {
                      const active = prefsDraft.property_types.includes(pt);
                      return (
                        <button
                          key={pt}
                          onClick={() => togglePrefArray('property_types', pt)}
                          className={`border rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                          }`}
                        >
                          {pt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Boroughs */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-2">Boroughs</label>
                  <div className="flex flex-wrap gap-2">
                    {BOROUGH_OPTIONS.map((b) => {
                      const active = prefsDraft.boroughs.includes(b);
                      return (
                        <button
                          key={b}
                          onClick={() => togglePrefArray('boroughs', b)}
                          className={`border rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                          }`}
                        >
                          {b}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Neighborhoods */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Neighborhoods</label>
                  <input
                    type="text"
                    value={prefsDraft.neighborhoods.join(', ')}
                    onChange={(e) =>
                      setPrefsDraft({
                        ...prefsDraft,
                        neighborhoods: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="Upper East Side, West Village, Park Slope..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Comma-separated</p>
                </div>

                {/* Beds / Baths */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Min Beds</label>
                    <input
                      type="number"
                      min={0}
                      value={prefsDraft.min_beds ?? ''}
                      onChange={(e) => setPrefNum('min_beds', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Max Beds</label>
                    <input
                      type="number"
                      min={0}
                      value={prefsDraft.max_beds ?? ''}
                      onChange={(e) => setPrefNum('max_beds', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Min Baths</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={prefsDraft.min_baths ?? ''}
                      onChange={(e) => setPrefNum('min_baths', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                </div>

                {/* Price range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Min Price</label>
                    <input
                      type="number"
                      min={0}
                      value={prefsDraft.min_price ?? ''}
                      onChange={(e) => setPrefStr('min_price', e.target.value)}
                      placeholder="500000"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Max Price</label>
                    <input
                      type="number"
                      min={0}
                      value={prefsDraft.max_price ?? ''}
                      onChange={(e) => setPrefStr('max_price', e.target.value)}
                      placeholder="2000000"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                </div>

                {/* Sqft */}
                <div className="w-1/2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Min Sqft</label>
                  <input
                    type="number"
                    min={0}
                    value={prefsDraft.min_sqft ?? ''}
                    onChange={(e) => setPrefNum('min_sqft', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                  />
                </div>

                {/* Must-haves */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-2">Must-Haves</label>
                  <div className="flex flex-wrap gap-2">
                    {MUST_HAVE_OPTIONS.map((mh) => {
                      const active = prefsDraft.must_haves.includes(mh);
                      return (
                        <button
                          key={mh}
                          onClick={() => togglePrefArray('must_haves', mh)}
                          className={`border rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            active ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                          }`}
                        >
                          {mh}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Deal-breakers */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Deal-Breakers</label>
                  <input
                    type="text"
                    value={prefsDraft.deal_breakers.join(', ')}
                    onChange={(e) =>
                      setPrefsDraft({
                        ...prefsDraft,
                        deal_breakers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="No walk-up, No basement, ..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Comma-separated</p>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Notes for Your Agent</label>
                  <textarea
                    value={prefsDraft.notes ?? ''}
                    onChange={(e) => setPrefStr('notes', e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-none"
                    placeholder="Any other preferences or details..."
                  />
                </div>

                {/* Save / Cancel */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setPrefsEditing(false)}
                    className="border border-gray-300 rounded-lg px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={savePrefs}
                    disabled={prefsSaving}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {prefsSaving ? 'Saving...' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Read-only view ── */
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                {!preferences ? (
                  <div className="text-center py-10">
                    <p className="text-gray-400 text-sm mb-3">No preferences set yet.</p>
                    <button
                      onClick={startEditPrefs}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Set your search preferences
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {preferences.property_types.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-gray-700">Property Types:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {preferences.property_types.map((t) => (
                            <span key={t} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {preferences.boroughs.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-gray-700">Boroughs:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {preferences.boroughs.map((b) => (
                            <span key={b} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{b}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {preferences.neighborhoods.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-gray-700">Neighborhoods:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {preferences.neighborhoods.map((n) => (
                            <span key={n} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">{n}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {preferences.min_beds != null && (
                        <div>
                          <span className="text-xs font-semibold text-gray-700 block">Min Beds</span>
                          <span className="text-sm font-medium text-gray-900">{preferences.min_beds}</span>
                        </div>
                      )}
                      {preferences.max_beds != null && (
                        <div>
                          <span className="text-xs font-semibold text-gray-700 block">Max Beds</span>
                          <span className="text-sm font-medium text-gray-900">{preferences.max_beds}</span>
                        </div>
                      )}
                      {preferences.min_baths != null && (
                        <div>
                          <span className="text-xs font-semibold text-gray-700 block">Min Baths</span>
                          <span className="text-sm font-medium text-gray-900">{preferences.min_baths}</span>
                        </div>
                      )}
                      {preferences.min_sqft != null && (
                        <div>
                          <span className="text-xs font-semibold text-gray-700 block">Min Sqft</span>
                          <span className="text-sm font-medium text-gray-900">{preferences.min_sqft.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    {(preferences.min_price || preferences.max_price) && (
                      <div>
                        <span className="text-xs font-semibold text-gray-700 block">Price Range</span>
                        <span className="text-sm font-medium text-gray-900">
                          {fmtPrice(preferences.min_price)} &ndash; {fmtPrice(preferences.max_price)}
                        </span>
                      </div>
                    )}
                    {preferences.must_haves.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-gray-700">Must-Haves:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {preferences.must_haves.map((mh) => (
                            <span key={mh} className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full">{mh}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {preferences.deal_breakers.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-gray-700">Deal-Breakers:</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {preferences.deal_breakers.map((db) => (
                            <span key={db} className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-full">{db}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {preferences.notes && (
                      <div>
                        <span className="text-xs font-semibold text-gray-700 block">Notes</span>
                        <p className="text-sm text-gray-700 mt-0.5">{preferences.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════ FAMILY TAB ═══════ */}
        {tab === 'Family' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Family Members</h2>
              <button
                onClick={() => { setInviteOpen(!inviteOpen); setInviteError(''); setInviteSuccess(''); }}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                {inviteOpen ? 'Close' : 'Invite'}
              </button>
            </div>

            {/* Invite form */}
            {inviteOpen && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">
                  Invite a family member to follow along
                </h3>
                {inviteError && <p className="text-sm text-red-600 mb-3">{inviteError}</p>}
                {inviteSuccess && <p className="text-sm text-green-700 mb-3">{inviteSuccess}</p>}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">First Name *</label>
                    <input
                      type="text"
                      value={inviteFirst}
                      onChange={(e) => setInviteFirst(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Last Name *</label>
                    <input
                      type="text"
                      value={inviteLast}
                      onChange={(e) => setInviteLast(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Email *</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Phone</label>
                    <input
                      type="tel"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Relationship</label>
                    <select
                      value={inviteRelationship}
                      onChange={(e) => setInviteRelationship(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none bg-white"
                    >
                      {RELATIONSHIP_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Couple toggle */}
                <div className="mt-4">
                  <button
                    onClick={() => setInviteCouple(!inviteCouple)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    {inviteCouple ? '- Remove second person' : '+ Add a second person (couple)'}
                  </button>
                </div>

                {inviteCouple && (
                  <div className="grid gap-3 sm:grid-cols-2 mt-3 pt-3 border-t border-blue-200">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">First Name *</label>
                      <input
                        type="text"
                        value={invite2First}
                        onChange={(e) => setInvite2First(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Last Name *</label>
                      <input
                        type="text"
                        value={invite2Last}
                        onChange={(e) => setInvite2Last(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Email *</label>
                      <input
                        type="email"
                        value={invite2Email}
                        onChange={(e) => setInvite2Email(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Phone</label>
                      <input
                        type="tel"
                        value={invite2Phone}
                        onChange={(e) => setInvite2Phone(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Relationship</label>
                      <select
                        value={invite2Relationship}
                        onChange={(e) => setInvite2Relationship(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none bg-white"
                      >
                        {RELATIONSHIP_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="mt-4 text-right">
                  <button
                    onClick={submitInvite}
                    disabled={inviteSubmitting}
                    className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {inviteSubmitting ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              </div>
            )}

            {/* Family list */}
            {familyLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : family.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                No family members added yet. Invite someone to share your search.
              </div>
            ) : (
              <div className="space-y-3">
                {family.map((fm) => (
                  <div key={fm.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                          {fm.member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{fm.member.name}</div>
                          <div className="text-xs text-gray-500">{fm.member.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 capitalize">{fm.relationship}</span>
                        <span className={`w-2 h-2 rounded-full ${fm.member.active ? 'bg-green-500' : 'bg-gray-300'}`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ PROFILE TAB ═══════ */}
        {tab === 'Profile' && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-5">Your Profile</h2>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              {authUser ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-700">
                      {authUser.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-gray-900">{authUser.name}</div>
                      <div className="text-sm text-gray-500">Buyer</div>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <span className="text-xs font-semibold text-gray-700 block">Email</span>
                        <span className="text-sm text-gray-900">{authUser.email}</span>
                      </div>
                      {authUser.phone && (
                        <div>
                          <span className="text-xs font-semibold text-gray-700 block">Phone</span>
                          <span className="text-sm text-gray-900">{authUser.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Unable to load profile.</p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
