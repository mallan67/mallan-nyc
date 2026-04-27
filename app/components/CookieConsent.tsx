'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useClientOnly } from '@/lib/hooks/useClientOnly';

const CONSENT_KEY = 'mallan_cookie_consent';
const CONSENT_VERSION = '1'; // Increment when policy changes

type ConsentState = {
  essential: boolean; // Always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
  version: string;
  timestamp: string;
};

const DEFAULT_CONSENT: ConsentState = {
  essential: true,
  analytics: false,
  marketing: false,
  version: CONSENT_VERSION,
  timestamp: '',
};

/** What was last persisted in localStorage. `null` = nothing stored. */
type Hydration = { stored: ConsentState | null };

function readHydration(): Hydration {
  const raw = localStorage.getItem(CONSENT_KEY);
  if (!raw) return { stored: null };
  try {
    const parsed = JSON.parse(raw) as ConsentState;
    return { stored: parsed };
  } catch {
    return { stored: null };
  }
}

export default function CookieConsent() {
  // Mount-only hydration via state-machine reducer (no setState-in-effect
  // warning). After hydration we know whether to show the banner and
  // which preferences to seed the form with.
  const { value: hydration, hydrated } = useClientOnly<Hydration>({
    read: readHydration,
    serverFallback: { stored: null },
  });

  // Form state for in-progress edits to the preferences. Seeded from
  // stored consent (when present) once hydration finishes; the
  // set-state-during-render `prevHydrated` guard re-syncs without an
  // effect.
  const [consent, setConsent] = useState<ConsentState>(DEFAULT_CONSENT);
  const [prevHydrated, setPrevHydrated] = useState(false);
  if (hydrated && !prevHydrated) {
    setPrevHydrated(true);
    if (hydration.stored && hydration.stored.version === CONSENT_VERSION) {
      setConsent(hydration.stored);
    }
  }

  // Banner is visible if there's no stored consent OR the stored version
  // is stale. After the user saves we hide it locally via `dismissed`.
  const [dismissed, setDismissed] = useState(false);
  const visible =
    hydrated &&
    !dismissed &&
    (!hydration.stored || hydration.stored.version !== CONSENT_VERSION);

  const [showDetails, setShowDetails] = useState(false);

  const saveConsent = (newConsent: ConsentState) => {
    const withTimestamp = {
      ...newConsent,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(withTimestamp));
    setConsent(withTimestamp);
    setDismissed(true);
  };

  const acceptAll = () => {
    saveConsent({
      essential: true,
      analytics: true,
      marketing: true,
      version: CONSENT_VERSION,
      timestamp: '',
    });
  };

  const acceptEssentialOnly = () => {
    saveConsent({
      essential: true,
      analytics: false,
      marketing: false,
      version: CONSENT_VERSION,
      timestamp: '',
    });
  };

  const savePreferences = () => {
    saveConsent(consent);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-consent-title"
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg"
    >
      <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div>
            <h2 id="cookie-consent-title" className="text-base font-semibold text-gray-900">
              Cookie Preferences
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              We use cookies to provide essential website functionality. Optional cookies help us
              understand how you use our site.{' '}
              <Link href="/privacy" className="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1">
                Privacy Policy
              </Link>
            </p>
          </div>

          {/* Expandable Details */}
          {showDetails && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <fieldset>
                <legend className="sr-only">Cookie preferences</legend>

                {/* Essential - Always On */}
                <div className="flex items-start gap-3 pb-3 border-b border-gray-200">
                  <input
                    type="checkbox"
                    id="cookie-essential"
                    checked={true}
                    disabled
                    className="mt-1 h-4 w-4 rounded border-gray-300 bg-gray-100"
                    aria-describedby="cookie-essential-desc"
                  />
                  <div>
                    <label htmlFor="cookie-essential" className="text-sm font-medium text-gray-900">
                      Essential Cookies
                    </label>
                    <p id="cookie-essential-desc" className="text-xs text-gray-500">
                      Required for the website to function. Cannot be disabled.
                    </p>
                  </div>
                </div>

                {/* Analytics */}
                <div className="flex items-start gap-3 py-3 border-b border-gray-200">
                  <input
                    type="checkbox"
                    id="cookie-analytics"
                    checked={consent.analytics}
                    onChange={(e) => setConsent({ ...consent, analytics: e.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
                    aria-describedby="cookie-analytics-desc"
                  />
                  <div>
                    <label htmlFor="cookie-analytics" className="text-sm font-medium text-gray-900">
                      Analytics Cookies
                    </label>
                    <p id="cookie-analytics-desc" className="text-xs text-gray-500">
                      Help us understand how visitors interact with our website.
                    </p>
                  </div>
                </div>

                {/* Marketing */}
                <div className="flex items-start gap-3 pt-3">
                  <input
                    type="checkbox"
                    id="cookie-marketing"
                    checked={consent.marketing}
                    onChange={(e) => setConsent({ ...consent, marketing: e.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
                    aria-describedby="cookie-marketing-desc"
                  />
                  <div>
                    <label htmlFor="cookie-marketing" className="text-sm font-medium text-gray-900">
                      Marketing Cookies
                    </label>
                    <p id="cookie-marketing-desc" className="text-xs text-gray-500">
                      Used to deliver relevant advertisements and track campaign performance.
                    </p>
                  </div>
                </div>
              </fieldset>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded px-1"
            >
              {showDetails ? 'Hide details' : 'Customize preferences'}
            </button>

            <div className="flex flex-col sm:flex-row gap-2">
              {showDetails ? (
                <button
                  type="button"
                  onClick={savePreferences}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
                >
                  Save Preferences
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={acceptEssentialOnly}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    Essential Only
                  </button>
                  <button
                    type="button"
                    onClick={acceptAll}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
                  >
                    Accept All
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to check consent status - use this before loading any optional scripts
 */
export function useConsentStatus() {
  // Mount-only hydration via the same state-machine reducer pattern.
  const { value: consent } = useClientOnly<ConsentState | null>({
    read: () => {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (!stored) return null;
      try {
        return JSON.parse(stored) as ConsentState;
      } catch {
        return null;
      }
    },
    serverFallback: null,
  });

  return {
    hasConsent: consent !== null,
    analyticsAllowed: consent?.analytics ?? false,
    marketingAllowed: consent?.marketing ?? false,
  };
}
