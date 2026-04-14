'use client';

import { useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useConsentStatus } from './CookieConsent';

const SESSION_KEY = 'mallan_session_id';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2, 10);
  }
}

function fireIntent(eventType: string, payload?: Record<string, unknown>) {
  const sessionId = getSessionId();
  const data = {
    event_type: eventType,
    session_id: sessionId,
    payload: {
      ...payload,
      path: typeof window !== 'undefined' ? window.location.pathname : '',
      timestamp: Date.now(),
    },
  };

  // Use sendBeacon for reliability (doesn't block navigation)
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/intent', JSON.stringify(data));
  } else {
    fetch('/api/analytics/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
      keepalive: true,
    }).catch(() => {});
  }
}

/**
 * IntentTracker — invisible component that fires buyer intent events.
 * Mount in layout.tsx alongside BehavioralTracker.
 *
 * Automatically tracks:
 * - page_view on every navigation
 * - listing_view when on /listing/* pages
 * - search_query when on /search pages
 *
 * Other components fire events via:
 *   window.dispatchEvent(new CustomEvent('mallan:intent', { detail: { type: 'favorite_add', listing_id: '123' } }))
 */
export default function IntentTracker() {
  const pathname = usePathname();
  const { analyticsAllowed } = useConsentStatus();

  // Track page views (consent-gated)
  useEffect(() => {
    if (!pathname || !analyticsAllowed) return;

    // Fire page_view on every navigation
    fireIntent('page_view', { page: pathname });

    // Fire listing_view if on a listing page
    if (pathname.startsWith('/listing/')) {
      const slug = pathname.split('/listing/')[1];
      fireIntent('listing_view', { slug });
    }

    // Fire search_query if on search page
    if (pathname === '/search') {
      const params = typeof window !== 'undefined' ? window.location.search : '';
      fireIntent('search_query', { query: params });
    }
  }, [pathname, analyticsAllowed]);

  // Listen for custom events from other components (consent-gated)
  const handleCustomIntent = useCallback((e: Event) => {
    if (!analyticsAllowed) return;
    const detail = (e as CustomEvent).detail;
    if (detail?.type) {
      fireIntent(detail.type, detail);
    }
  }, [analyticsAllowed]);

  useEffect(() => {
    window.addEventListener('mallan:intent', handleCustomIntent);
    return () => window.removeEventListener('mallan:intent', handleCustomIntent);
  }, [handleCustomIntent]);

  return null; // Invisible component
}

// Export fireIntent for direct use in components
export { fireIntent };
