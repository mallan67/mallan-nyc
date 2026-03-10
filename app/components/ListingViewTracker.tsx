'use client';

import { useEffect } from 'react';

const VIEWS_KEY = 'mallan_listing_views';
const GATE_SHOWN_KEY = 'mallan_reg_gate_shown';
const GATE_DISMISSED_KEY = 'mallan_reg_gate_dismissed';
const EMAIL_CAPTURED_KEY = 'mallan_fav_email_captured';
const REG_CAPTURED_KEY = 'mallan_reg_email_captured';
const VIEW_THRESHOLD = 8;

/**
 * Invisible client component placed on listing detail pages.
 * Increments a sessionStorage counter on mount.
 * When the threshold is reached, dispatches a custom event
 * that RegistrationGate listens for.
 */
export default function ListingViewTracker() {
  useEffect(() => {
    // Skip if already captured or dismissed this session
    if (localStorage.getItem(EMAIL_CAPTURED_KEY)) return;
    if (localStorage.getItem(REG_CAPTURED_KEY)) return;
    if (sessionStorage.getItem(GATE_SHOWN_KEY)) return;
    if (sessionStorage.getItem(GATE_DISMISSED_KEY)) return;

    // Increment view count
    const current = parseInt(sessionStorage.getItem(VIEWS_KEY) || '0', 10);
    const next = current + 1;
    sessionStorage.setItem(VIEWS_KEY, String(next));

    // Fire event when threshold is reached
    if (next >= VIEW_THRESHOLD) {
      sessionStorage.setItem(GATE_SHOWN_KEY, '1');
      // Small delay so the page has time to render
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('mallan:show-registration-gate'));
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  return null;
}
