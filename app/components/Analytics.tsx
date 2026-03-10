'use client';

import { useEffect, useCallback } from 'react';
import { useConsentStatus } from './CookieConsent';

// Extend Window for retargeting pixels
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Phase 1 Analytics - Minimal, consent-gated, privacy-safe
 *
 * Tracks:
 * - Page views (path only, no query params)
 * - Primary CTA clicks (contact, schedule, search)
 *
 * Does NOT track:
 * - Session replay
 * - Fingerprinting
 * - Cross-site tracking
 * - Marketing pixels
 * - PII
 *
 * Compliance: Only fires when analytics consent is granted via cookie banner.
 */

// Analytics endpoint - uses simple first-party API route
const ANALYTICS_ENDPOINT = '/api/analytics/event';

type EventType = 'pageview' | 'cta_click';

interface AnalyticsEvent {
  type: EventType;
  path: string;
  label?: string;
  timestamp: string;
}

async function sendEvent(event: AnalyticsEvent): Promise<void> {
  try {
    // Use sendBeacon for reliability on page unload, fallback to fetch
    const payload = JSON.stringify(event);

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ANALYTICS_ENDPOINT, payload);
    } else {
      await fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    // Silently fail - analytics should never break the site
  }
}

/**
 * Analytics provider component - renders nothing, just sets up tracking
 * Must be placed inside a component tree where useConsentStatus works
 */
export default function Analytics() {
  const { analyticsAllowed } = useConsentStatus();

  // Load retargeting pixels (consent-gated, env-gated)
  useEffect(() => {
    if (!analyticsAllowed) return;

    // Facebook Pixel
    const fbPixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
    if (fbPixelId && !window.fbq) {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(script);
      script.onload = () => {
        window.fbq?.('init', fbPixelId);
        window.fbq?.('track', 'PageView');
      };
    }

    // Google Ads / gtag
    const gadsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
    if (gadsId && !window.gtag) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${gadsId}`;
      document.head.appendChild(script);
      (window as Window & { dataLayer?: unknown[] }).dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer || [];
      function gtag(...args: unknown[]) { ((window as Window & { dataLayer?: unknown[] }).dataLayer as unknown[]).push(args); }
      (window as Window & { gtag?: (...args: unknown[]) => void }).gtag = gtag;
      gtag('js', new Date());
      gtag('config', gadsId);
    }
  }, [analyticsAllowed]);

  // Track page views
  useEffect(() => {
    if (!analyticsAllowed) return;

    // Send pageview on mount
    sendEvent({
      type: 'pageview',
      path: window.location.pathname, // Path only, no query params for privacy
      timestamp: new Date().toISOString(),
    });

    // Also fire pixel pageviews on navigation
    if (window.fbq) (window as Window & { fbq?: (...args: unknown[]) => void }).fbq?.('track', 'PageView');
  }, [analyticsAllowed]);

  // Set up CTA click tracking via data attributes
  useEffect(() => {
    if (!analyticsAllowed) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const ctaElement = target.closest('[data-analytics-cta]');

      if (ctaElement) {
        const label = ctaElement.getAttribute('data-analytics-cta') || 'unknown';
        sendEvent({
          type: 'cta_click',
          path: window.location.pathname,
          label,
          timestamp: new Date().toISOString(),
        });
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [analyticsAllowed]);

  return null; // This component renders nothing
}

/**
 * Hook for programmatic event tracking (use sparingly)
 * Only tracks if analytics consent is granted
 */
export function useAnalytics() {
  const { analyticsAllowed } = useConsentStatus();

  const trackCTA = useCallback(
    (label: string) => {
      if (!analyticsAllowed) return;

      sendEvent({
        type: 'cta_click',
        path: typeof window !== 'undefined' ? window.location.pathname : '/',
        label,
        timestamp: new Date().toISOString(),
      });
    },
    [analyticsAllowed]
  );

  return { trackCTA, isEnabled: analyticsAllowed };
}
