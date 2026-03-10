'use client';

import { useState, useEffect, useCallback } from 'react';

const DISMISS_KEY = 'mallan_fav_email_dismissed';
const EMAIL_CAPTURED_KEY = 'mallan_fav_email_captured';
const DISMISS_DAYS = 7;

interface FavoriteEmailPromptProps {
  /** Current number of favorites */
  favoriteCount: number;
  /** Array of favorites to send on sync */
  favorites: Array<{ id: string; listingType: 'sale' | 'rent' }>;
  /** Render mode: 'modal' triggers after 3rd favorite, 'inline' always shows */
  mode: 'modal' | 'inline';
}

export default function FavoriteEmailPrompt({ favoriteCount, favorites, mode }: FavoriteEmailPromptProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [wantAlerts, setWantAlerts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCaptured = useCallback(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(EMAIL_CAPTURED_KEY) === 'true';
  }, []);

  const isDismissed = useCallback(() => {
    if (typeof window === 'undefined') return true;
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    const daysSince = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_DAYS;
  }, []);

  // Modal mode: open when count hits 3
  useEffect(() => {
    if (mode !== 'modal') return;
    if (favoriteCount === 3 && !hasCaptured() && !isDismissed()) {
      setIsOpen(true);
    }
  }, [favoriteCount, mode, hasCaptured, isDismissed]);

  const handleDismiss = () => {
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/favorites/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: name || undefined,
          favorites,
          wantAlerts,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to save. Please try again.');
        return;
      }

      setIsSubmitted(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem(EMAIL_CAPTURED_KEY, 'true');
      }

      // Auto-close modal after 2s
      if (mode === 'modal') {
        setTimeout(() => setIsOpen(false), 2000);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Already captured — show nothing
  if (hasCaptured() && !isSubmitted) {
    return null;
  }

  // --- INLINE MODE (for /favorites page banner) ---
  if (mode === 'inline') {
    if (isSubmitted) {
      return (
        <div className="rounded-2xl bg-green-50 ring-1 ring-green-200 p-5 mb-6">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium text-green-800">
              Your favorites are saved. You can access them from any device.
            </p>
          </div>
        </div>
      );
    }

    return (
      <form onSubmit={handleSubmit} className="rounded-2xl bg-brand-dark/[0.03] ring-1 ring-black/5 p-5 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <svg className="w-5 h-5 text-brand-gold mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-brand-dark">Access your saved properties from any device</p>
            <p className="text-xs text-brand-dark/70 mt-0.5">Enter your email to keep your favorites safe.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full sm:w-36 px-3 py-2 text-sm rounded-xl ring-1 ring-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
          />
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full sm:flex-1 px-3 py-2 text-sm rounded-xl ring-1 ring-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 bg-brand-dark text-white text-sm font-medium rounded-xl hover:bg-brand-dark/90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isSubmitting ? 'Saving...' : 'Save My Favorites'}
          </button>
        </div>

        <label className="flex items-start gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={wantAlerts}
            onChange={(e) => setWantAlerts(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold/50"
          />
          <span className="text-xs text-brand-dark/70">
            Also send me alerts when similar properties are listed
          </span>
        </label>

        {error && (
          <p className="text-xs text-red-600 mt-2">{error}</p>
        )}
      </form>
    );
  }

  // --- MODAL MODE ---
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1 text-brand-dark/40 hover:text-brand-dark/70 transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {isSubmitted ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold text-brand-dark">Favorites saved!</p>
            <p className="text-sm text-brand-dark/70 mt-1">Access them from any device.</p>
          </div>
        ) : (
          <>
            {/* Icon */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-brand-gold" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-display font-semibold text-brand-dark">
                  Never lose your saved properties
                </h2>
                <p className="text-sm text-brand-dark/70 mt-0.5">
                  Enter your email and we&apos;ll keep them safe.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-xl ring-1 ring-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
                autoFocus
              />
              <input
                type="text"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-xl ring-1 ring-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/50"
              />

              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={wantAlerts}
                  onChange={(e) => setWantAlerts(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold/50"
                />
                <span className="text-xs text-brand-dark/70">
                  Also send me alerts when similar properties are listed
                </span>
              </label>

              {error && (
                <p className="text-xs text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-brand-dark text-white text-sm font-medium rounded-xl hover:bg-brand-dark/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save My Favorites'}
              </button>
            </form>

            <button
              onClick={handleDismiss}
              className="w-full text-center text-xs text-brand-dark/50 hover:text-brand-dark/70 mt-3 transition-colors"
            >
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
