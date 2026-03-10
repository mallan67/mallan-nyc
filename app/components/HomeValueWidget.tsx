'use client';

import { useState, FormEvent } from 'react';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

export default function HomeValueWidget() {
  const ref = useGsapReveal<HTMLDivElement>({ y: 40, duration: 1 });
  const [formData, setFormData] = useState({ name: '', address: '', email: '', phone: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function update(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim() || !formData.email.trim() || !formData.phone.trim()) {
      setStatus('error');
      setErrorMsg('All fields are required.');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/cma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setFormData({ name: '', address: '', email: '', phone: '' });
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div ref={ref} className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-3xl border border-brand-gold-deep/20 p-8 shadow-sm">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: 'linear-gradient(135deg, rgba(196,160,82,0.15), rgba(196,160,82,0.04))' }}
        >
          <svg className="w-6 h-6 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>

        <h3 className="font-display font-semibold text-xl text-brand-dark text-center mb-2">
          What&apos;s Your Home Worth?
        </h3>
        <p className="text-brand-dark/60 text-[13px] font-light text-center leading-relaxed mb-6">
          Get a free property valuation from a licensed broker.
        </p>

        {status === 'success' ? (
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-2xl px-5 py-4 mb-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium">Thank you!</span>
            </div>
            <p className="text-brand-dark/60 text-sm font-light">
              Your valuation will be delivered within 24 hours.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="Your name"
              aria-label="Full name"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-[#FAFAFA] text-sm text-brand-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-deep/30 focus:border-brand-gold-deep transition-all"
            />
            <input
              type="text"
              required
              value={formData.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="Property address"
              aria-label="Property address"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-[#FAFAFA] text-sm text-brand-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-deep/30 focus:border-brand-gold-deep transition-all"
            />
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="Email"
              aria-label="Email address"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-[#FAFAFA] text-sm text-brand-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-deep/30 focus:border-brand-gold-deep transition-all"
            />
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="Phone"
              aria-label="Phone number"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-[#FAFAFA] text-sm text-brand-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-deep/30 focus:border-brand-gold-deep transition-all"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full py-3.5 rounded-xl bg-brand-gold-deep text-white text-sm font-medium hover:bg-brand-gold-deep/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Submitting...' : 'Get My Free Valuation'}
            </button>
          </form>
        )}

        {status === 'error' && (
          <p className="mt-3 text-red-600 text-sm text-center">{errorMsg}</p>
        )}

        {status !== 'success' && (
          <p className="mt-4 text-brand-dark/40 text-[11px] font-light text-center leading-relaxed">
            By submitting, you consent to receive communications from Mallan Real Estate Inc.
            regarding your property valuation. Message and data rates may apply.
            You can opt out at any time.
          </p>
        )}
      </div>
    </div>
  );
}
