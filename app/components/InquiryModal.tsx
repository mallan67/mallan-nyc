'use client';

import { useState, useEffect, useRef } from 'react';

type InquiryMode = 'showing' | 'question';

interface InquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: InquiryMode;
  listingId?: string;
  listingAddress?: string;
  isRental?: boolean;
}

export default function InquiryModal({
  isOpen,
  onClose,
  mode,
  listingId,
  listingAddress,
  isRental,
}: InquiryModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
    preferredDate: '',
    preferredTime: '',
    agreeToTerms: false,
    optInUpdates: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isShowing = mode === 'showing';
  const title = isShowing
    ? isRental
      ? 'Schedule a Viewing'
      : 'Request a Showing'
    : 'Ask a Question';

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        email: '',
        phone: '',
        message: '',
        preferredDate: '',
        preferredTime: '',
        agreeToTerms: false,
        optInUpdates: false,
      });
      setIsSubmitted(false);
      setError(null);
    }
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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
      // Build message with context
      let fullMessage = '';
      if (isShowing) {
        fullMessage = `[Showing Request]`;
        if (formData.preferredDate) {
          fullMessage += `\nPreferred Date: ${formData.preferredDate}`;
        }
        if (formData.preferredTime) {
          fullMessage += `\nPreferred Time: ${formData.preferredTime}`;
        }
        if (formData.message) {
          fullMessage += `\n\n${formData.message}`;
        }
      } else {
        fullMessage = `[Question]\n\n${formData.message}`;
      }

      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          message: fullMessage,
          preferredDate: formData.preferredDate || undefined,
          listingId,
          listingAddress,
          agreeToTerms: formData.agreeToTerms,
          optInUpdates: formData.optInUpdates,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to submit. Please try again.');
        return;
      }

      setIsSubmitted(true);
    } catch {
      setError('Failed to submit. Please try again or call us at (646) 258-4460.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white/95 backdrop-blur-sm border-b border-black/5 rounded-t-3xl">
          <h2 className="font-display font-semibold text-lg text-brand-dark">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-brand-dark/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* Listing context */}
          {listingAddress && (
            <div className="mb-5 px-4 py-3 bg-gray-50 rounded-2xl">
              <p className="text-xs text-brand-dark/60 font-medium uppercase tracking-wider mb-0.5">Property</p>
              <p className="text-sm text-brand-dark font-medium">{listingAddress}</p>
            </div>
          )}

          {isSubmitted ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold text-brand-dark mb-2">
                {isShowing ? 'Showing Request Sent' : 'Question Sent'}
              </h3>
              <p className="text-sm text-brand-dark/70 mb-6">
                {isShowing
                  ? 'We\'ll confirm your showing time shortly. An agent will reach out within 24 hours.'
                  : 'Thank you for your question! An agent will get back to you within 24 hours.'}
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-brand-dark text-white rounded-2xl text-sm font-medium hover:bg-brand-dark/90 transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="inquiry-name" className="block text-sm font-medium text-brand-dark/90 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="inquiry-name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full rounded-2xl px-4 py-2.5 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm"
                  placeholder="Your full name"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="inquiry-email" className="block text-sm font-medium text-brand-dark/90 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  id="inquiry-email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full rounded-2xl px-4 py-2.5 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm"
                  placeholder="you@example.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="inquiry-phone" className="block text-sm font-medium text-brand-dark/90 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  id="inquiry-phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  className="w-full rounded-2xl px-4 py-2.5 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm"
                  placeholder="(212) 555-0123"
                />
              </div>

              {/* Date/Time for showing mode */}
              {isShowing && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="inquiry-date" className="block text-sm font-medium text-brand-dark/90 mb-1">
                      Preferred Date
                    </label>
                    <input
                      type="date"
                      id="inquiry-date"
                      name="preferredDate"
                      value={formData.preferredDate}
                      onChange={handleChange}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full rounded-2xl px-4 py-2.5 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="inquiry-time" className="block text-sm font-medium text-brand-dark/90 mb-1">
                      Preferred Time
                    </label>
                    <select
                      id="inquiry-time"
                      name="preferredTime"
                      value={formData.preferredTime}
                      onChange={handleChange}
                      className="w-full rounded-2xl px-4 py-2.5 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm"
                    >
                      <option value="">Any time</option>
                      <option value="Morning (9am-12pm)">Morning (9am-12pm)</option>
                      <option value="Afternoon (12pm-3pm)">Afternoon (12pm-3pm)</option>
                      <option value="Late Afternoon (3pm-5pm)">Late Afternoon (3pm-5pm)</option>
                      <option value="Evening (5pm-7pm)">Evening (5pm-7pm)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Message */}
              <div>
                <label htmlFor="inquiry-message" className="block text-sm font-medium text-brand-dark/90 mb-1">
                  {isShowing ? 'Additional Notes' : 'Your Question'} {!isShowing && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  id="inquiry-message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required={!isShowing}
                  rows={isShowing ? 2 : 3}
                  className="w-full rounded-2xl px-4 py-2.5 bg-white ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 text-sm resize-none"
                  placeholder={
                    isShowing
                      ? 'Any special requests or notes for the showing...'
                      : 'What would you like to know about this property?'
                  }
                />
              </div>

              {/* TCPA Consent */}
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="agreeToTerms"
                    checked={formData.agreeToTerms}
                    onChange={handleChange}
                    required
                    className="mt-1 flex-shrink-0"
                  />
                  <span className="text-xs text-brand-dark/80 leading-relaxed">
                    By submitting, I agree to the{' '}
                    <a href="/terms" className="text-brand-gold hover:underline" target="_blank" rel="noopener noreferrer">
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="/privacy" className="text-brand-gold hover:underline" target="_blank" rel="noopener noreferrer">
                      Privacy Policy
                    </a>
                    . I consent to being contacted by Mallan Real Estate Inc. by phone, email, or text at the number provided. Message and data rates may apply.{' '}
                    <span className="text-red-500">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="optInUpdates"
                    checked={formData.optInUpdates}
                    onChange={handleChange}
                    className="mt-1 flex-shrink-0"
                  />
                  <span className="text-xs text-brand-dark/80">
                    Send me updates about similar listings and market news
                  </span>
                </label>
              </div>

              {error && (
                <p className="text-red-600 text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {isSubmitting
                  ? 'Sending...'
                  : isShowing
                    ? 'Request Showing'
                    : 'Send Question'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
