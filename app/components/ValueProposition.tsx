'use client';

import { useState } from 'react';
import Link from 'next/link';
import AffordabilityCalculator from '@/app/components/AffordabilityCalculator';
import RentVsBuyStandalone from '@/app/components/RentVsBuyStandalone';
import SellerClosingCostCalculator from '@/app/components/SellerClosingCostCalculator';

function MobileCalcToggle({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:contents">
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg mt-3"
      >
        {open ? 'Hide' : 'Show'} {label}
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`${open ? 'block' : 'hidden'} md:block`}>
        {children}
      </div>
    </div>
  );
}

export default function ValueProposition() {
  return (
    <section className="py-20 sm:py-24 md:py-28 px-4 bg-[#f9f8f6]">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl text-gray-900 leading-tight tracking-tight">
            Every side of a New York<br className="hidden sm:block" /> real estate transaction.
          </h2>
          <p className="mt-4 text-base text-gray-500 max-w-xl mx-auto leading-relaxed">
            Residential, commercial, and investment properties across all five boroughs.
          </p>
        </div>

        {/* Three service columns */}
        <div className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-12">

          {/* Buy */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 bg-white border border-gray-200 rounded-xl p-7">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Buy</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                Buyer and investor representation for co-ops, condos, condops, townhouses, and commercial properties.
              </p>
              <Link
                href="/buy"
                data-analytics-cta="cta_buy"
                className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
              >
                Browse Sales →
              </Link>
            </div>
            <MobileCalcToggle label="Affordability Calculator">
              <AffordabilityCalculator />
            </MobileCalcToggle>
          </div>

          {/* Rent */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 bg-white border border-gray-200 rounded-xl p-7">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Rent</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                NYC apartment rentals with support for negotiations, application preparation, and building-specific approvals.
              </p>
              <Link
                href="/rent"
                data-analytics-cta="cta_rent"
                className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
              >
                Browse Rentals →
              </Link>
            </div>
            <MobileCalcToggle label="Rent vs Buy Calculator">
              <RentVsBuyStandalone />
            </MobileCalcToggle>
          </div>

          {/* Sell */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 bg-white border border-gray-200 rounded-xl p-7">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Sell</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                Strategic pricing, comprehensive marketing, professional photography, and end-to-end transaction management.
              </p>
              <Link
                href="/sell"
                data-analytics-cta="cta_sell"
                className="text-sm font-medium text-gray-900 hover:text-gray-500 transition-colors"
              >
                Sell Your Property →
              </Link>
            </div>
            <MobileCalcToggle label="Closing Cost Calculator">
              <SellerClosingCostCalculator />
            </MobileCalcToggle>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/contact"
            data-analytics-cta="cta_contact_primary"
            className="btn-dark text-sm"
          >
            Talk to a Broker →
          </Link>
        </div>

      </div>
    </section>
  );
}
