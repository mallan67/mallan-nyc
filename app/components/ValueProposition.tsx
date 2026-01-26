'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

/**
 * Value Proposition Section
 *
 * Compliance notes:
 * - No guarantees or promises of results
 * - NYC-specific positioning
 * - Fair Housing compliant language
 * - No discriminatory targeting
 */

type ServiceType = 'buy' | 'rent' | 'sell';

interface DropdownProps {
  label: string;
  basePath: string;
  analyticsLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function ServiceDropdown({ label, basePath, analyticsLabel, isOpen, onToggle, onClose }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={onToggle}
        data-analytics-cta={analyticsLabel}
        className="text-brand-gold hover:underline font-medium text-sm inline-flex items-center gap-1"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {label}
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] z-50">
          <Link
            href={`${basePath}?type=residential`}
            data-analytics-cta={`${analyticsLabel}_residential`}
            className="block px-4 py-3 text-sm text-gray-800 hover:bg-gray-50 rounded-t-lg border-b border-gray-100"
            onClick={onClose}
          >
            Residential
          </Link>
          <Link
            href={`${basePath}?type=commercial`}
            data-analytics-cta={`${analyticsLabel}_commercial`}
            className="block px-4 py-3 text-sm text-gray-800 hover:bg-gray-50 rounded-b-lg"
            onClick={onClose}
          >
            Commercial
          </Link>
        </div>
      )}
    </div>
  );
}

export default function ValueProposition() {
  const [openDropdown, setOpenDropdown] = useState<ServiceType | null>(null);

  const handleToggle = (type: ServiceType) => {
    setOpenDropdown(openDropdown === type ? null : type);
  };

  const handleClose = () => {
    setOpenDropdown(null);
  };

  return (
    <section className="py-16 md:py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4">
        {/* Main Value Statement */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-serif font-medium text-gray-900 mb-4">
            Licensed NYC Brokerage
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
            Residential and commercial sales and rentals in Manhattan and Brooklyn.
            Licensed broker representation for all property types.
          </p>
        </div>

        {/* Service Paths */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {/* Buy */}
          <div className="text-center p-6 rounded-lg border border-gray-100 hover:border-brand-gold/30 hover:shadow-lg transition-all">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-serif font-medium text-gray-900 mb-2">Buy</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Buyer representation for residential and commercial properties.
              Board packages, financial review, and contract negotiation.
            </p>
            <ServiceDropdown
              label="Browse Sales →"
              basePath="/buy"
              analyticsLabel="cta_buy"
              isOpen={openDropdown === 'buy'}
              onToggle={() => handleToggle('buy')}
              onClose={handleClose}
            />
          </div>

          {/* Rent */}
          <div className="text-center p-6 rounded-lg border border-gray-100 hover:border-brand-gold/30 hover:shadow-lg transition-all">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-serif font-medium text-gray-900 mb-2">Rent</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Residential apartments and commercial spaces in Manhattan and Brooklyn.
              Application support and lease review.
            </p>
            <ServiceDropdown
              label="Browse Rentals →"
              basePath="/rent"
              analyticsLabel="cta_rent"
              isOpen={openDropdown === 'rent'}
              onToggle={() => handleToggle('rent')}
              onClose={handleClose}
            />
          </div>

          {/* Sell */}
          <div className="text-center p-6 rounded-lg border border-gray-100 hover:border-brand-gold/30 hover:shadow-lg transition-all">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-serif font-medium text-gray-900 mb-2">Sell</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Professional photography, pricing analysis, and full transaction
              management from listing to closing.
            </p>
            <ServiceDropdown
              label="Sell Your Property →"
              basePath="/sell"
              analyticsLabel="cta_sell"
              isOpen={openDropdown === 'sell'}
              onToggle={() => handleToggle('sell')}
              onClose={handleClose}
            />
          </div>
        </div>

        {/* Primary CTA */}
        <div className="text-center">
          <Link
            href="/contact"
            data-analytics-cta="cta_contact_primary"
            className="inline-block px-8 py-3 bg-brand-dark text-white font-medium rounded hover:bg-black transition-colors"
          >
            Contact Us
          </Link>
          <p className="mt-3 text-sm text-gray-500">
            No obligation. Tell us what you&apos;re looking for.
          </p>
        </div>
      </div>
    </section>
  );
}
