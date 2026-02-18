import Link from 'next/link';
import AffordabilityCalculator from '@/app/components/AffordabilityCalculator';
import RentVsBuyStandalone from '@/app/components/RentVsBuyStandalone';
import SellerClosingCostCalculator from '@/app/components/SellerClosingCostCalculator';

/**
 * Value Proposition Section
 * Compliance: No guarantees, NYC-specific, Fair Housing compliant
 */
export default function ValueProposition() {
  return (
    <section className="bg-gray-950 py-24 sm:py-28 md:py-36 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14 sm:mb-16">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#C4A052] mb-3">
            Full-Service Brokerage
          </p>
          <h2 className="font-sans font-black text-4xl sm:text-5xl md:text-6xl text-white leading-none tracking-tight max-w-3xl mx-auto">
            Every side of a New York real estate transaction.
          </h2>
          <p className="mt-6 text-base sm:text-lg text-white/45 max-w-xl mx-auto leading-relaxed">
            Residential, commercial, and investment properties across all five boroughs. One broker who picks up the phone.
          </p>
        </div>

        {/* Three service columns */}
        <div className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-12 sm:mb-14">

          {/* Buy */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-7 hover:bg-white/8 hover:border-white/20 transition-all">
              <div className="w-12 h-12 bg-[#C4A052]/15 rounded-xl flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-[#C4A052]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Buy</h3>
              <p className="text-white/55 text-sm leading-relaxed mb-5">
                Buyer and investor representation for co-ops, condos, condops, townhouses, and commercial properties. Board packages, financial review, and contract negotiation.
              </p>
              <Link
                href="/buy"
                data-analytics-cta="cta_buy"
                className="inline-flex items-center gap-1.5 text-[#C4A052] font-semibold text-sm hover:gap-3 transition-all"
              >
                Browse Sales <span aria-hidden>→</span>
              </Link>
            </div>
            <AffordabilityCalculator />
          </div>

          {/* Rent */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-7 hover:bg-white/8 hover:border-white/20 transition-all">
              <div className="w-12 h-12 bg-[#C4A052]/15 rounded-xl flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-[#C4A052]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Rent</h3>
              <p className="text-white/55 text-sm leading-relaxed mb-5">
                NYC apartment rentals with support for rent negotiations, application preparation and submission, and guidance through building-specific requirements and approvals.
              </p>
              <Link
                href="/rent"
                data-analytics-cta="cta_rent"
                className="inline-flex items-center gap-1.5 text-[#C4A052] font-semibold text-sm hover:gap-3 transition-all"
              >
                Browse Rentals <span aria-hidden>→</span>
              </Link>
            </div>
            <RentVsBuyStandalone />
          </div>

          {/* Sell */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-7 hover:bg-white/8 hover:border-white/20 transition-all">
              <div className="w-12 h-12 bg-[#C4A052]/15 rounded-xl flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-[#C4A052]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Sell</h3>
              <p className="text-white/55 text-sm leading-relaxed mb-5">
                Strategic property pricing, comprehensive marketing exposure, professional photography, and end-to-end transaction management from listing to closing.
              </p>
              <Link
                href="/sell"
                data-analytics-cta="cta_sell"
                className="inline-flex items-center gap-1.5 text-[#C4A052] font-semibold text-sm hover:gap-3 transition-all"
              >
                Sell Your Property <span aria-hidden>→</span>
              </Link>
            </div>
            <SellerClosingCostCalculator />
          </div>
        </div>

        {/* Primary CTA */}
        <div className="text-center border-t border-white/10 pt-12">
          <p className="text-white/40 text-sm mb-5">Ready to get started?</p>
          <Link
            href="/contact"
            data-analytics-cta="cta_contact_primary"
            className="inline-block px-10 py-4 bg-[#C4A052] text-gray-950 font-bold rounded-xl hover:bg-[#d4b060] shadow-lg transition-all text-sm sm:text-base tracking-wide"
          >
            Talk to a Broker
          </Link>
          <p className="mt-3 text-xs text-white/30">
            No obligation. Tell us what you&apos;re looking for.
          </p>
        </div>

      </div>
    </section>
  );
}
