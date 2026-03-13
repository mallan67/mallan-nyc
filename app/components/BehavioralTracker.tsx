'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

const SESSION_KEY = 'mallan_behavioral_session';
const LAST_VISIT_KEY = 'mallan_last_listings';
const ENDPOINT = '/api/analytics/behavioral';

/**
 * BehavioralTracker — Invisible component mounted in root layout.
 *
 * Captures granular behavioral micro-signals:
 * - Scroll-back on price (price sensitivity)
 * - Photo dwell time (visual preference)
 * - Calculator engagement depth
 * - Return visits to same listing
 * - Tab switching between listings
 * - Transit/school check signals
 *
 * Privacy-safe: no IP fingerprinting, no user-agent capture.
 * All events are anonymous until identity is captured.
 */
export default function BehavioralTracker() {
  const pathname = usePathname();
  const scrollRef = useRef<number>(0);
  const priceScrollBackCount = useRef<number>(0);
  const dwellStartRef = useRef<number>(0);
  const sentEventsRef = useRef<Set<string>>(new Set());

  // Get or create anonymous session ID
  const getSessionId = useCallback((): string => {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }, []);

  // Send event (fire-and-forget)
  const sendEvent = useCallback((
    eventType: string,
    listingId?: string,
    value?: number,
    metadata?: Record<string, unknown>
  ) => {
    const sessionId = getSessionId();
    if (!sessionId) return;

    // Deduplicate: don't send same event type + listing in same page load
    const dedupeKey = `${eventType}:${listingId || ''}`;
    if (eventType !== 'photo_dwell' && sentEventsRef.current.has(dedupeKey)) return;
    sentEventsRef.current.add(dedupeKey);

    const payload = {
      sessionId,
      eventType,
      listingId: listingId || undefined,
      value: value || undefined,
      metadata: metadata || undefined,
      pagePath: pathname || undefined,
    };

    // Use sendBeacon for reliability (survives page unload)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, JSON.stringify(payload));
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  }, [getSessionId, pathname]);

  // ─── Return Visit Detection ──────────────────────────────
  useEffect(() => {
    if (!pathname?.startsWith('/listing/')) return;

    const listingId = pathname.split('/listing/')[1]?.split('?')[0];
    if (!listingId) return;

    const lastVisits: Record<string, number> = JSON.parse(
      localStorage.getItem(LAST_VISIT_KEY) || '{}'
    );

    const lastVisit = lastVisits[listingId];
    if (lastVisit) {
      const hoursSince = (Date.now() - lastVisit) / 3600_000;
      if (hoursSince > 1) {
        sendEvent('return_visit', listingId, hoursSince);
      }
    }

    lastVisits[listingId] = Date.now();

    // Keep only last 50 listings to avoid localStorage bloat
    const entries = Object.entries(lastVisits);
    if (entries.length > 50) {
      entries.sort((a, b) => b[1] - a[1]);
      const trimmed = Object.fromEntries(entries.slice(0, 50));
      localStorage.setItem(LAST_VISIT_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(LAST_VISIT_KEY, JSON.stringify(lastVisits));
    }
  }, [pathname, sendEvent]);

  // ─── Price Scroll-Back Detection ─────────────────────────
  useEffect(() => {
    if (!pathname?.startsWith('/listing/')) return;

    const listingId = pathname.split('/listing/')[1]?.split('?')[0];
    if (!listingId) return;

    priceScrollBackCount.current = 0;
    scrollRef.current = 0;

    const handleScroll = () => {
      const currentScroll = window.scrollY;
      const prevScroll = scrollRef.current;

      // Detect scroll-back in the top portion of the page (where price lives)
      if (currentScroll < 400 && prevScroll > 500 && currentScroll < prevScroll - 100) {
        priceScrollBackCount.current++;
        if (priceScrollBackCount.current <= 5) {
          sendEvent('scroll_back_price', listingId, priceScrollBackCount.current);
        }
      }

      scrollRef.current = currentScroll;
    };

    // Throttle scroll handler
    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });
    return () => window.removeEventListener('scroll', throttledScroll);
  }, [pathname, sendEvent]);

  // ─── Page Dwell Time (on listing pages) ──────────────────
  useEffect(() => {
    if (!pathname?.startsWith('/listing/')) return;

    const listingId = pathname.split('/listing/')[1]?.split('?')[0];
    if (!listingId) return;

    dwellStartRef.current = Date.now();

    return () => {
      const dwellSecs = (Date.now() - dwellStartRef.current) / 1000;
      if (dwellSecs > 5 && dwellSecs < 1800) {
        sendEvent('photo_dwell', listingId, Math.round(dwellSecs));
      }
    };
  }, [pathname, sendEvent]);

  // ─── Listen for Custom Events from Other Components ──────
  useEffect(() => {
    const handleCustomEvent = (e: CustomEvent) => {
      const { eventType, listingId, value, metadata } = e.detail || {};
      if (eventType) {
        sendEvent(eventType, listingId, value, metadata);
      }
    };

    window.addEventListener('mallan:behavioral' as string, handleCustomEvent as EventListener);
    return () => window.removeEventListener('mallan:behavioral' as string, handleCustomEvent as EventListener);
  }, [sendEvent]);

  // Reset sent events on page change
  useEffect(() => {
    sentEventsRef.current.clear();
  }, [pathname]);

  return null; // Invisible component
}
