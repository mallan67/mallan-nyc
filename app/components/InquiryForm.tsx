'use client';

import { useState } from 'react';
import { trackInquiry } from '@/lib/posthog';

interface InquiryFormProps {
  listingId?: string;
  listingAddress?: string;
  agentEmail?: string;
}

export default function InquiryForm({ listingId, listingAddress, agentEmail }: InquiryFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
    preferredDate: '',
    agreeToTerms: false,
    optInUpdates: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          listingId,
          listingAddress,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit inquiry. Please try again.');
        return;
      }

      setIsSubmitted(true);
      trackInquiry(listingId ?? null, 'contact');
      // Fire intent event for buyer tracking
      window.dispatchEvent(new CustomEvent('mallan:intent', {
        detail: { type: 'inquiry_submit', listing_id: listingId }
      }));
    } catch {
      setError('Failed to submit inquiry. Please try again or call us at (646) 258-4460.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="glass-card rounded-3xl p-6 bg-green-50/50" role="status" aria-live="polite">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-display font-semibold text-green-800">Inquiry Sent</h3>
        </div>
        <p className="text-green-700 text-sm">
          Thank you for your inquiry! An agent will contact you shortly.
          {listingAddress && ` We'll be in touch about ${listingAddress}.`}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-6">
      <h3 className="text-lg font-display font-semibold mb-4">Request Information</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full rounded-2xl px-4 py-2 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            placeholder="John Smith"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full rounded-2xl px-4 py-2 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            placeholder="john@example.com"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            className="w-full rounded-2xl px-4 py-2 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            placeholder="(212) 555-0123"
          />
        </div>

        <div>
          <label htmlFor="preferredDate" className="block text-sm font-medium mb-1">
            Preferred Viewing Date
          </label>
          <input
            type="date"
            id="preferredDate"
            name="preferredDate"
            value={formData.preferredDate}
            onChange={handleChange}
            min={new Date().toISOString().split('T')[0]}
            className="w-full rounded-2xl px-4 py-2 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium mb-1">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            rows={3}
            className="w-full rounded-2xl px-4 py-2 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            placeholder="I'm interested in learning more about this property..."
          />
        </div>

        {/* NYC-Specific Note for Co-ops */}
        {listingId && (
          <p className="text-xs text-brand-dark/85">
            Note: Inquiries for co-op and condo listings may require board approval.
            Your agent will provide details on the application process.
          </p>
        )}

        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="agreeToTerms"
              checked={formData.agreeToTerms}
              onChange={handleChange}
              required
              className="mt-1"
            />
            <span className="text-sm text-brand-dark/90">
              I agree to the{' '}
              <a href="/terms" className="text-brand-gold hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-brand-gold hover:underline">
                Privacy Policy
              </a>{' '}
              <span className="text-red-500">*</span>
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="optInUpdates"
              checked={formData.optInUpdates}
              onChange={handleChange}
              className="mt-1"
            />
            <span className="text-sm text-brand-dark/90">
              Send me updates about similar listings and market news
            </span>
          </label>
        </div>

        {error && (
          <p role="alert" className="text-red-600 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Sending...' : 'Send Inquiry'}
        </button>
      </form>
    </div>
  );
}
