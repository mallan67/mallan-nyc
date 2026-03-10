'use client';

import { useState, FormEvent } from 'react';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

export default function NewsletterSignup() {
  const ref = useGsapReveal<HTMLDivElement>({ y: 40, duration: 1 });
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (!consent) {
      setStatus('error');
      setErrorMsg('Please agree to receive listing alerts.');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/search-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          frequency: 'weekly',
          criteria: { type: 'sale' },
          consent: true,
          consentText: 'I consent to receive listing alerts from Mallan Real Estate Inc.',
          consentAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]">
      <div ref={ref} className="max-w-2xl mx-auto text-center">
        <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">
          Market Insights
        </p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl md:text-4xl tracking-tight text-brand-dark mb-3">
          Stay Updated on NYC Real Estate
        </h2>
        <p className="text-brand-dark/70 text-[15px] font-light leading-relaxed mb-8 max-w-lg mx-auto">
          Get weekly market insights and new listings delivered to your inbox.
        </p>

        {status === 'success' ? (
          <div className="flex items-center justify-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-full px-6 py-4 max-w-md mx-auto">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">You&apos;re subscribed! Check your inbox.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-lg mx-auto">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                aria-label="Email address"
                className="flex-1 px-5 py-3.5 rounded-full border border-gray-200 bg-white text-sm text-brand-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-deep/30 focus:border-brand-gold-deep transition-all"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="px-8 py-3.5 rounded-full bg-brand-dark text-white text-sm font-medium hover:bg-brand-dark/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
              </button>
            </div>
            <label className="flex items-start gap-2 mt-3 cursor-pointer justify-center text-left">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold/30"
              />
              <span className="text-brand-dark/45 text-xs font-light">
                I consent to receive listing alerts from Mallan Real Estate Inc. <a href="/unsubscribe" className="underline">Unsubscribe</a> anytime.
              </span>
            </label>
          </form>
        )}

        {status === 'error' && (
          <p className="mt-3 text-red-600 text-sm">{errorMsg}</p>
        )}
      </div>
    </section>
  );
}
