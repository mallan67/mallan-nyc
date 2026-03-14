/**
 * PostHog configuration and MLS-safe event helpers.
 *
 * CRITICAL: REBNY RLS / IDX compliance constraint.
 * Never send restricted MLS payloads into analytics:
 *   - No listing addresses (InternetAddressDisplayYN may be false)
 *   - No listing photos or media URLs
 *   - No agent PII (name, email, phone, license#)
 *   - No listing prices from MLS feed
 *   - No compensation/commission amounts
 *   - No owner names or contact info
 *
 * Safe to send:
 *   - Listing IDs (opaque identifiers, not PII)
 *   - Derived/computed events (search count, time on page, funnel step)
 *   - User-initiated actions (clicked, submitted, viewed)
 *   - Non-MLS metadata (property type, borough, neighborhood, bed/bath counts)
 *   - Page paths (already public URLs)
 *   - Feature flags and experiment assignments
 */
import posthog from "posthog-js";

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

/** Initialize PostHog. Call once on consent grant. */
export function initPostHog(): void {
  if (!POSTHOG_KEY || typeof window === "undefined") return;
  if (posthog.__loaded) return; // already initialized

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: "https://us.posthog.com",

    // Privacy: respect cookie consent, no autocapture of PII
    persistence: "localStorage+cookie",
    capture_pageview: false,    // we fire manually after consent check
    capture_pageleave: true,
    autocapture: {
      dom_event_allowlist: ["click", "submit"],
      element_allowlist: ["a", "button", "form", "input", "select", "textarea"],
      css_selector_allowlist: ["[data-ph-capture]"],
    },

    // Session replay config
    session_recording: {
      maskAllInputs: true,       // mask form inputs (PII protection)
      maskTextSelector: "[data-ph-mask]", // extra masking for sensitive elements
    },

    // Don't send full URL query params (may contain search filters with MLS data)
    sanitize_properties: (properties) => {
      // Strip query params from $current_url — keep path only
      if (properties["$current_url"]) {
        try {
          const url = new URL(properties["$current_url"] as string);
          properties["$current_url"] = url.origin + url.pathname;
        } catch {
          // keep as-is if parse fails
        }
      }
      return properties;
    },

    loaded: (ph) => {
      // In dev mode, enable debug logging
      if (process.env.NODE_ENV === "development") {
        ph.debug();
      }
    },
  });
}

/** Shut down PostHog. Call on consent revocation. */
export function shutdownPostHog(): void {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) {
    posthog.opt_out_capturing();
  }
}

// ── MLS-safe event helpers ──
// These are the ONLY functions that should be used to send events.
// They enforce the compliance boundary: no MLS data leaks into analytics.

/** Track a page view (path only, no query params). */
export function trackPageView(path?: string): void {
  if (!posthog.__loaded) return;
  posthog.capture("$pageview", {
    $current_url: path ?? window.location.pathname,
  });
}

/**
 * Search funnel: user performed a search.
 * Safe: only counts and filter categories, no listing data.
 */
export function trackSearch(filters: {
  borough?: string;
  neighborhood?: string;
  property_type?: string;
  bed_min?: number;
  bed_max?: number;
  price_bucket?: string; // e.g. "500k-1m", NOT exact MLS prices
  result_count: number;
}): void {
  if (!posthog.__loaded) return;
  posthog.capture("search_performed", filters);
}

/**
 * Search funnel: user viewed a listing from search results.
 * Safe: listing_id is an opaque identifier, not PII.
 */
export function trackListingView(listingId: string, source: string): void {
  if (!posthog.__loaded) return;
  posthog.capture("listing_viewed", {
    listing_id: listingId,
    source, // "search", "favorites", "alert_email", "direct"
  });
}

/**
 * Inquiry funnel: user submitted a contact/inquiry form.
 * Safe: no form content, just the event + listing reference.
 */
export function trackInquiry(listingId: string | null, type: string): void {
  if (!posthog.__loaded) return;
  posthog.capture("inquiry_submitted", {
    listing_id: listingId,
    inquiry_type: type, // "contact", "schedule_showing", "offer", "cma_request"
  });
}

/**
 * Micro-commitment: user saved a listing, signed up for alerts, etc.
 * Safe: action type + opaque ID only.
 */
export function trackMicroCommitment(action: string, entityId?: string): void {
  if (!posthog.__loaded) return;
  posthog.capture("micro_commitment", {
    action, // "favorite", "save_search", "alert_subscribe", "schedule_open_house"
    entity_id: entityId,
  });
}

/**
 * Portal engagement: client portal usage patterns.
 * Safe: action type only, no listing or client data.
 */
export function trackPortalEvent(portal: string, action: string): void {
  if (!posthog.__loaded) return;
  posthog.capture("portal_event", {
    portal_type: portal, // "buyer", "seller", "tenant", "landlord"
    action, // "login", "viewed_listing", "liked", "disliked", "discuss", "offer"
  });
}

/**
 * CRM feature adoption: which dashboard features agents actually use.
 * Safe: feature name only, no client or deal data.
 */
export function trackCrmFeature(feature: string, action: string): void {
  if (!posthog.__loaded) return;
  posthog.capture("crm_feature_used", {
    feature, // "demand_heatmap", "cma_engine", "lead_scoring", "commission_tracker"
    action,  // "opened", "generated_report", "exported"
  });
}

/**
 * Alert fatigue: track when users unsubscribe or ignore alerts.
 * Safe: alert type + action only.
 */
export function trackAlertEngagement(alertType: string, action: string): void {
  if (!posthog.__loaded) return;
  posthog.capture("alert_engagement", {
    alert_type: alertType, // "search_alert", "price_drop", "new_listing", "showing_reminder"
    action, // "opened", "clicked", "unsubscribed", "ignored"
  });
}

/** Re-export posthog instance for feature flags and direct access. */
export { posthog };
