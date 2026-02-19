'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function CMARequestForm() {
  const [formData, setFormData] = useState({
    address: '',
    unit: '',
    propertyType: '',
    bedrooms: '',
    sqft: '',
    name: '',
    email: '',
    phone: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate submission — no actual API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('CMA request submitted:', {
      ...formData,
      timestamp: new Date().toISOString(),
    });

    setIsSubmitted(true);
    setIsSubmitting(false);
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
        <p className="text-green-700 text-sm max-w-md mx-auto">
          Thank you! We&apos;ll prepare your Comparative Market Analysis and send it within 24 hours.
          A licensed broker will follow up to discuss your property.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
          placeholder="123 Main Street, New York, NY"
        />
      </div>

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
            className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
            placeholder="4B"
          />
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
            className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
            placeholder="1,200"
          />
        </div>
      </div>

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
            className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
          >
            <option value="">Select...</option>
            <option value="condo">Condo</option>
            <option value="coop">Co-op</option>
            <option value="townhouse">Townhouse</option>
            <option value="multifamily">Multi-family</option>
            <option value="commercial">Commercial</option>
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
            className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
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
          className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
          placeholder="Jane Smith"
        />
      </div>

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
            className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label htmlFor="cma-phone" className="block text-sm font-medium mb-1">
            Phone
          </label>
          <input
            type="tel"
            id="cma-phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
            placeholder="(212) 555-0123"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full px-6 py-3 btn-gold rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Submitting...' : 'Get My Free CMA'}
      </button>

      <p className="text-xs text-brand-dark/40 text-center">
        By submitting, you agree to our{' '}
        <Link href="/terms" className="text-brand-gold hover:underline">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-brand-gold hover:underline">Privacy Policy</Link>.
      </p>
    </form>
  );
}
