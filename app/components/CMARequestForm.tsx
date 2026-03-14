'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trackInquiry } from '@/lib/posthog';

export default function CMARequestForm() {
  const [formData, setFormData] = useState({
    address: '',
    unit: '',
    borough: '',
    propertyType: '',
    bedrooms: '',
    bathrooms: '',
    sqft: '',
    name: '',
    email: '',
    phone: '',
    notes: '',
    tcpaConsent: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.tcpaConsent) {
      setError('Please agree to be contacted regarding your property valuation request.');
      return;
    }
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/cma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitted(true);
      trackInquiry(null, 'cma_request');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="glass-card rounded-3xl p-10 bg-green-50/50 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-display font-semibold text-green-800 mb-2">Request Received</h3>
        <p className="text-green-700 text-sm max-w-md mx-auto mb-6">
          Thank you! Your personalized Comparative Market Analysis will be delivered within 24 hours.
          A licensed broker will follow up to discuss your property in detail.
        </p>
        <div className="flex items-center justify-center gap-6 text-xs text-green-600/80">
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Check your email for confirmation
          </span>
        </div>
      </div>
    );
  }

  const inputClass = 'w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Property Address */}
      <div>
        <label htmlFor="cma-address" className="block text-sm font-medium mb-1">
          Property Address <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="cma-address"
          name="address"
          value={formData.address}
          onChange={handleChange}
          required
          className={inputClass}
          placeholder="123 Main Street, New York, NY"
        />
      </div>

      {/* Unit + Borough */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cma-unit" className="block text-sm font-medium mb-1">
            Unit / Apt #
          </label>
          <input
            type="text"
            id="cma-unit"
            name="unit"
            value={formData.unit}
            onChange={handleChange}
            className={inputClass}
            placeholder="4B"
          />
        </div>
        <div>
          <label htmlFor="cma-borough" className="block text-sm font-medium mb-1">
            Borough <span className="text-red-500">*</span>
          </label>
          <select
            id="cma-borough"
            name="borough"
            value={formData.borough}
            onChange={handleChange}
            required
            className={inputClass}
          >
            <option value="">Select...</option>
            <option value="manhattan">Manhattan</option>
            <option value="brooklyn">Brooklyn</option>
            <option value="queens">Queens</option>
            <option value="bronx">Bronx</option>
            <option value="staten_island">Staten Island</option>
          </select>
        </div>
      </div>

      {/* Property Type + Bedrooms */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cma-propertyType" className="block text-sm font-medium mb-1">
            Property Type <span className="text-red-500">*</span>
          </label>
          <select
            id="cma-propertyType"
            name="propertyType"
            value={formData.propertyType}
            onChange={handleChange}
            required
            className={inputClass}
          >
            <option value="">Select...</option>
            <option value="condo">Condo</option>
            <option value="coop">Co-op</option>
            <option value="townhouse">Townhouse</option>
            <option value="multifamily">Multi-Family</option>
            <option value="singlefamily">Single Family</option>
          </select>
        </div>
        <div>
          <label htmlFor="cma-bedrooms" className="block text-sm font-medium mb-1">
            Bedrooms <span className="text-red-500">*</span>
          </label>
          <select
            id="cma-bedrooms"
            name="bedrooms"
            value={formData.bedrooms}
            onChange={handleChange}
            required
            className={inputClass}
          >
            <option value="">Select...</option>
            <option value="studio">Studio</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5+">5+</option>
          </select>
        </div>
      </div>

      {/* Bathrooms + Sq Ft */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cma-bathrooms" className="block text-sm font-medium mb-1">
            Bathrooms
          </label>
          <select
            id="cma-bathrooms"
            name="bathrooms"
            value={formData.bathrooms}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="">Select...</option>
            <option value="1">1</option>
            <option value="1.5">1.5</option>
            <option value="2">2</option>
            <option value="2.5">2.5</option>
            <option value="3">3</option>
            <option value="3.5">3.5</option>
            <option value="4+">4+</option>
          </select>
        </div>
        <div>
          <label htmlFor="cma-sqft" className="block text-sm font-medium mb-1">
            Approx. Sq Ft
          </label>
          <input
            type="text"
            id="cma-sqft"
            name="sqft"
            value={formData.sqft}
            onChange={handleChange}
            className={inputClass}
            placeholder="1,200"
          />
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="cma-name" className="block text-sm font-medium mb-1">
          Your Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="cma-name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          className={inputClass}
          placeholder="Jane Smith"
        />
      </div>

      {/* Email + Phone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="cma-email" className="block text-sm font-medium mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="cma-email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className={inputClass}
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label htmlFor="cma-phone" className="block text-sm font-medium mb-1">
            Phone <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            id="cma-phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            className={inputClass}
            placeholder="(212) 555-0123"
          />
        </div>
      </div>

      {/* Additional Notes */}
      <div>
        <label htmlFor="cma-notes" className="block text-sm font-medium mb-1">
          Additional Notes
        </label>
        <textarea
          id="cma-notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          className={inputClass}
          placeholder="Recent renovations, timeline for selling, or any other details..."
        />
      </div>

      {/* TCPA Consent Checkbox */}
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          name="tcpaConsent"
          checked={formData.tcpaConsent}
          onChange={handleChange}
          className="mt-1 accent-brand-gold"
          required
        />
        <span className="text-xs text-brand-dark/80 leading-relaxed">
          I agree to be contacted regarding my property valuation request.
          By submitting, I agree to the{' '}
          <Link href="/terms" className="text-brand-gold hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-brand-gold hover:underline">Privacy Policy</Link>.
          <span className="text-red-500"> *</span>
        </span>
      </label>

      {error && (
        <p className="text-sm text-red-600 text-center">{error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full px-6 py-3 btn-gold rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Submitting...' : 'Get My Free Valuation'}
      </button>
    </form>
  );
}
