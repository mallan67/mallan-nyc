'use client';

import { useState, useCallback } from 'react';
import { trackMicroCommitment } from '@/lib/posthog';

interface OpenHouseRSVPProps {
  openHouseId: string;
  listingAddress: string;
  openHouseDate: string; // ISO date string e.g. "2026-03-08"
  openHouseTime: string; // e.g. "11:00 AM - 1:00 PM"
  /** Render as a compact inline button (for listing cards) vs full-width (for listing detail) */
  variant?: 'button' | 'full';
}

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function OpenHouseRSVP({
  openHouseId,
  listingAddress,
  openHouseDate,
  openHouseTime,
  variant = 'button',
}: OpenHouseRSVPProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    partySize: '1',
    message: '',
    agreeToTerms: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/open-houses/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          openHouseId,
          listingAddress,
          openHouseDate,
          openHouseTime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit RSVP. Please try again.');
        return;
      }

      setIsSubmitted(true);
      trackMicroCommitment('schedule_open_house', openHouseId);
    } catch {
      setError('Failed to submit RSVP. Please try again or call us at (646) 258-4460.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayDate = formatDisplayDate(openHouseDate);

  // RSVP Button
  const buttonEl = variant === 'full' ? (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="btn-liquid w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-brand-gold text-white rounded-2xl hover:bg-brand-gold-deep font-medium text-sm transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      RSVP for Open House
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="btn-liquid inline-flex items-center gap-1.5 px-4 py-2 bg-brand-gold text-white text-sm font-medium rounded-xl hover:bg-brand-gold-deep transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      RSVP
    </button>
  );

  return (
    <>
      {buttonEl}

      {/* Modal Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Open House RSVP"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!isSubmitting) setIsOpen(false); }}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-black/[0.06]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-display font-semibold">RSVP for Open House</h2>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Open house details */}
              <div className="mt-3 p-3 bg-[#F8F7F4] rounded-2xl">
                <p className="text-sm font-medium text-brand-dark">{listingAddress}</p>
                <p className="text-sm text-brand-dark/70 mt-1">{displayDate}</p>
                <p className="text-sm text-brand-dark/70">{openHouseTime}</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {isSubmitted ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-display font-semibold text-green-800 mb-2">You&apos;re Registered</h3>
                  <p className="text-sm text-green-700 mb-1">
                    We&apos;ll see you at the open house for {listingAddress}.
                  </p>
                  <p className="text-sm text-brand-dark/60 mb-1">{displayDate} at {openHouseTime}</p>
                  <p className="text-xs text-brand-dark/50 mt-3">
                    A confirmation email has been sent with details. Please bring a valid photo ID.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="mt-5 px-6 py-2.5 bg-brand-dark text-white text-sm rounded-2xl hover:bg-brand-dark/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="rsvp-name" className="block text-sm font-medium mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="rsvp-name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                      placeholder="John Smith"
                    />
                  </div>

                  <div>
                    <label htmlFor="rsvp-email" className="block text-sm font-medium mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="rsvp-email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                      placeholder="john@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="rsvp-phone" className="block text-sm font-medium mb-1">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      id="rsvp-phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                      placeholder="(212) 555-0123"
                    />
                  </div>

                  <div>
                    <label htmlFor="rsvp-partySize" className="block text-sm font-medium mb-1">
                      Party Size
                    </label>
                    <select
                      id="rsvp-partySize"
                      name="partySize"
                      value={formData.partySize}
                      onChange={handleChange}
                      className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm appearance-none"
                    >
                      <option value="1">1 person</option>
                      <option value="2">2 people</option>
                      <option value="3">3 people</option>
                      <option value="4">4+ people</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rsvp-message" className="block text-sm font-medium mb-1">
                      Notes <span className="text-brand-dark/40">(optional)</span>
                    </label>
                    <textarea
                      id="rsvp-message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      rows={2}
                      className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                      placeholder="Any questions or special requests..."
                    />
                  </div>

                  <div>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="agreeToTerms"
                        checked={formData.agreeToTerms}
                        onChange={handleChange}
                        required
                        className="mt-0.5"
                      />
                      <span className="text-xs text-brand-dark/70 leading-relaxed">
                        By registering, I consent to be contacted by Mallan Real Estate regarding this open house.
                        I agree to the{' '}
                        <a href="/terms" className="text-brand-gold hover:underline" target="_blank" rel="noopener noreferrer">
                          Terms of Service
                        </a>{' '}
                        and{' '}
                        <a href="/privacy" className="text-brand-gold hover:underline" target="_blank" rel="noopener noreferrer">
                          Privacy Policy
                        </a>.{' '}
                        <span className="text-red-500">*</span>
                      </span>
                    </label>
                  </div>

                  {error && (
                    <p className="text-red-600 text-sm">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full px-6 py-3 bg-brand-gold text-white rounded-2xl hover:bg-brand-gold-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                  >
                    {isSubmitting ? 'Registering...' : 'Confirm RSVP'}
                  </button>

                  <p className="text-xs text-brand-dark/50 text-center">
                    Please bring a valid photo ID to the open house.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
