'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

const GATE_SHOWN_KEY = 'mallan_reg_gate_shown';
const GATE_DISMISSED_KEY = 'mallan_reg_gate_dismissed';
const EMAIL_CAPTURED_KEY = 'mallan_fav_email_captured';
const REG_CAPTURED_KEY = 'mallan_reg_email_captured';

export default function RegistrationGate() {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const shouldSuppress = useCallback(() => {
    // Suppress on CRM pages
    if (pathname?.startsWith('/crm')) return true;
    // Already dismissed this session
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(GATE_DISMISSED_KEY)) return true;
    // Email already captured (favorites or registration)
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem(EMAIL_CAPTURED_KEY)) return true;
      if (localStorage.getItem(REG_CAPTURED_KEY)) return true;
    }
    return false;
  }, [pathname]);

  // Listen for custom event from ListingViewTracker
  useEffect(() => {
    if (shouldSuppress()) return;

    const handler = () => {
      if (!shouldSuppress()) {
        setVisible(true);
      }
    };

    window.addEventListener('mallan:show-registration-gate', handler);
    return () => window.removeEventListener('mallan:show-registration-gate', handler);
  }, [shouldSuppress]);

  // Escape key to close
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Lock body scroll while open
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  const handleDismiss = () => {
    setVisible(false);
    sessionStorage.setItem(GATE_DISMISSED_KEY, '1');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/search-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          frequency: 'daily',
          criteria: { type: 'sale' },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      localStorage.setItem(REG_CAPTURED_KEY, email);
      localStorage.setItem(EMAIL_CAPTURED_KEY, email);
      setIsSuccess(true);

      setTimeout(() => {
        setVisible(false);
      }, 2500);
    } catch {
      setError('Failed to create account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === overlayRef.current) handleDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Create a free account"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal panel */}
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-4 h-4 text-brand-dark/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-8 pt-10">
          {isSuccess ? (
            /* Success state */
            <div className="py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold text-brand-dark">
                You&apos;re all set!
              </h3>
              <p className="text-sm text-brand-dark/60 mt-1">
                We&apos;ll send you new listings that match your search.
              </p>
            </div>
          ) : (
            /* Form state */
            <>
              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <h2 className="text-xl font-display font-semibold text-brand-dark mb-2">
                  Get Listing Alerts
                </h2>
                <p className="text-sm text-brand-dark/60 leading-relaxed">
                  Get notified when new listings match your search &mdash; delivered to your inbox.
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-gold/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-dark">Save &amp; sync favorites across devices</p>
                    <p className="text-xs text-brand-dark/50">Your saved listings follow you everywhere</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-gold/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-dark">Get alerts when new listings match your search</p>
                    <p className="text-xs text-brand-dark/50">Be the first to know about new listings</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-gold/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-dark">Compare properties side by side</p>
                    <p className="text-xs text-brand-dark/50">Make informed decisions with easy comparisons</p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-black/5 mb-6" />

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Full name"
                  className="w-full rounded-2xl px-4 py-3 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm placeholder:text-brand-dark/40"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Email address"
                  aria-label="Email address"
                  className="w-full rounded-2xl px-4 py-3 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm placeholder:text-brand-dark/40"
                />

                {error && (
                  <p className="text-red-600 text-xs">{error}</p>
                )}

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold/30"
                  />
                  <span className="text-[10px] text-brand-dark/50 leading-tight">
                    I consent to receive listing alert emails from Mallan Real Estate Inc. I can <a href="/unsubscribe" className="underline">unsubscribe</a> at any time.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-6 py-3 bg-brand-gold text-white rounded-2xl hover:bg-brand-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold tracking-wide"
                >
                  {isSubmitting ? 'Saving...' : 'Get Alerts'}
                </button>
              </form>

              {/* Maybe Later */}
              <div className="text-center mt-4">
                <button
                  onClick={handleDismiss}
                  className="text-xs text-brand-dark/40 hover:text-brand-dark/60 transition-colors"
                >
                  Maybe Later
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
