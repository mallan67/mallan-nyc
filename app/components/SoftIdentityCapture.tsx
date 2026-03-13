'use client';

import { useState, useEffect, useRef } from 'react';

const SESSION_KEY = 'mallan_behavioral_session';
const CAPTURED_KEY = 'mallan_soft_identity_captured';

/**
 * SoftIdentityCapture — Email-only lead capture modal.
 *
 * Micro-commitment ladder step 2: captures just email in exchange
 * for value (price alert, CMA, saved comparison, etc).
 *
 * Triggered via custom event: window.dispatchEvent(
 *   new CustomEvent('mallan:soft-capture', { detail: { source: 'price_alert', listingId: '...' } })
 * )
 *
 * TCPA compliant: records consent_captured_at.
 */
export default function SoftIdentityCapture() {
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState('');
  const [listingId, setListingId] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Already captured
    if (localStorage.getItem(CAPTURED_KEY)) return;

    const handler = (e: CustomEvent) => {
      if (localStorage.getItem(CAPTURED_KEY)) return;
      const { source: src, listingId: lid } = e.detail || {};
      setSource(src || 'website');
      setListingId(lid || '');
      setVisible(true);
    };

    window.addEventListener('mallan:soft-capture' as string, handler as EventListener);
    return () => window.removeEventListener('mallan:soft-capture' as string, handler as EventListener);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    setError('');

    try {
      const sessionId = localStorage.getItem(SESSION_KEY) || '';
      const res = await fetch('/api/identity/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          sessionId,
          source,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Something went wrong');
        return;
      }

      localStorage.setItem(CAPTURED_KEY, email.trim());
      setIsSuccess(true);

      // Also fire a behavioral event
      window.dispatchEvent(new CustomEvent('mallan:behavioral', {
        detail: { eventType: 'inquiry_submit', listingId, metadata: { source } },
      }));

      setTimeout(() => setVisible(false), 2000);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  // Contextual copy based on source
  const copy: Record<string, { title: string; description: string; cta: string }> = {
    price_alert: {
      title: 'Get Price Drop Alerts',
      description: 'We\'ll notify you if this listing\'s price changes.',
      cta: 'Set Alert',
    },
    cma_offer: {
      title: 'Free Market Analysis',
      description: 'See how this compares to recent sales in the area.',
      cta: 'Get Report',
    },
    save_comparison: {
      title: 'Save Your Comparison',
      description: 'We\'ll email you a copy to review later.',
      cta: 'Send Comparison',
    },
    default: {
      title: 'Stay Updated',
      description: 'Get notified about new listings and price changes.',
      cta: 'Subscribe',
    },
  };

  const content = copy[source] || copy.default;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === overlayRef.current) dismiss(); }}
      role="dialog"
      aria-modal="true"
      aria-label={content.title}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors z-10"
          aria-label="Close"
        >
          <svg className="w-3.5 h-3.5 text-brand-dark/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6">
          {isSuccess ? (
            <div className="py-3 text-center">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-brand-dark">You&apos;re all set!</p>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-display font-semibold text-brand-dark mb-1">
                {content.title}
              </h3>
              <p className="text-sm text-brand-dark/60 mb-4">{content.description}</p>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  aria-label="Email address"
                  className="w-full rounded-xl px-4 py-2.5 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm"
                />

                {error && <p className="text-red-600 text-xs">{error}</p>}

                <p className="text-[10px] text-brand-dark/40 leading-tight">
                  By submitting, you consent to receive emails from Mallan Real Estate Inc. You can unsubscribe at any time.
                </p>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-4 py-2.5 bg-brand-dark text-white rounded-xl hover:bg-brand-dark/90 transition-colors disabled:opacity-50 text-sm font-medium"
                >
                  {isSubmitting ? 'Saving...' : content.cta}
                </button>
              </form>

              <button
                onClick={dismiss}
                className="w-full text-center mt-3 text-xs text-brand-dark/40 hover:text-brand-dark/60 transition-colors"
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
