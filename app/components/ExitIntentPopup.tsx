'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

const SESSION_KEY = 'mallan_exit_shown';
const DISMISS_KEY = 'mallan_exit_dismissed';
const EMAIL_CAPTURED_KEY = 'mallan_fav_email_captured';
const MOBILE_DELAY_MS = 90_000; // 90 seconds

export default function ExitIntentPopup() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const shouldSuppress = useCallback(() => {
    // Suppress on CRM pages
    if (pathname?.startsWith('/crm')) return true;
    // Already shown this session
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY)) return true;
    // User previously dismissed or already captured
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem(DISMISS_KEY)) return true;
      if (localStorage.getItem(EMAIL_CAPTURED_KEY)) return true;
    }
    return false;
  }, [pathname]);

  const show = useCallback(() => {
    if (shouldSuppress()) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(true);
  }, [shouldSuppress]);

  // Desktop: mouseout through top of viewport
  useEffect(() => {
    if (shouldSuppress()) return;

    const handleMouseOut = (e: MouseEvent) => {
      // Only trigger when cursor leaves through the top
      if (e.clientY <= 0 && e.relatedTarget === null) {
        show();
      }
    };

    document.addEventListener('mouseout', handleMouseOut);
    return () => document.removeEventListener('mouseout', handleMouseOut);
  }, [show, shouldSuppress]);

  // Mobile: trigger after 90 seconds of page time
  useEffect(() => {
    if (shouldSuppress()) return;

    // Detect mobile: no fine pointer (touch device)
    const isMobile = typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches;
    if (!isMobile) return;

    const timer = setTimeout(() => {
      show();
    }, MOBILE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [show, shouldSuppress]);

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
    localStorage.setItem(DISMISS_KEY, '1');
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
          frequency: 'weekly',
          criteria: { type: 'sale' },
          consentOptIn: true,
          consentSource: 'exit_intent',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      localStorage.setItem(EMAIL_CAPTURED_KEY, email);
      setIsSuccess(true);

      // Auto-close after 2 seconds
      setTimeout(() => {
        setVisible(false);
      }, 2000);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === overlayRef.current) handleDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Before you go"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal panel */}
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
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

        <div className="p-8 pt-10 text-center">
          {isSuccess ? (
            /* Success state */
            <div className="py-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold text-brand-dark">
                You&apos;re all set!
              </h3>
              <p className="text-sm text-brand-dark/60 mt-1">
                We&apos;ll keep you updated on new listings.
              </p>
            </div>
          ) : (
            /* Form state */
            <>
              {/* Icon */}
              <div className="w-12 h-12 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto mb-5">
                <svg className="w-6 h-6 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>

              <h2 className="text-xl font-display font-semibold text-brand-dark mb-2">
                Before You Go...
              </h2>
              <p className="text-sm text-brand-dark/60 mb-6 leading-relaxed">
                Save your search and get notified when new listings match your criteria.
              </p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Enter your email"
                  aria-label="Email address"
                  className="w-full rounded-2xl px-4 py-3 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm text-center placeholder:text-brand-dark/40"
                />

                <label className="flex items-start gap-2 text-left cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold/30"
                  />
                  <span className="text-[10px] text-brand-dark/50 leading-tight">
                    I consent to receive listing alert emails from Mallan Real Estate Inc. I can <a href="/unsubscribe" className="underline">unsubscribe</a> at any time.
                  </span>
                </label>

                {error && (
                  <p className="text-red-600 text-xs">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-6 py-3 bg-brand-gold text-white rounded-2xl hover:bg-brand-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold tracking-wide"
                >
                  {isSubmitting ? 'Saving...' : 'Keep Me Updated'}
                </button>
              </form>

              <button
                onClick={handleDismiss}
                className="mt-4 text-xs text-brand-dark/40 hover:text-brand-dark/60 transition-colors"
              >
                No thanks
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
