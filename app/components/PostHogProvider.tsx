'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useConsentStatus } from './CookieConsent';
import {
  initPostHog,
  shutdownPostHog,
  trackPageView,
  POSTHOG_KEY,
} from '@/lib/posthog';

/**
 * PostHog analytics provider. Consent-gated: only initializes
 * when the user has granted analytics consent via the cookie banner.
 *
 * Renders nothing. Place in layout.tsx alongside other providers.
 */
export default function PostHogProvider() {
  const { analyticsAllowed } = useConsentStatus();
  const pathname = usePathname();
  const wasAllowed = useRef(false);

  // Initialize or shut down based on consent
  useEffect(() => {
    if (!POSTHOG_KEY) return;

    if (analyticsAllowed && !wasAllowed.current) {
      initPostHog();
      trackPageView(pathname);
      wasAllowed.current = true;
    } else if (!analyticsAllowed && wasAllowed.current) {
      shutdownPostHog();
      wasAllowed.current = false;
    }
  }, [analyticsAllowed, pathname]);

  // Track page views on navigation (after initial load)
  useEffect(() => {
    if (!analyticsAllowed || !wasAllowed.current) return;
    trackPageView(pathname);
  }, [pathname, analyticsAllowed]);

  return null;
}
