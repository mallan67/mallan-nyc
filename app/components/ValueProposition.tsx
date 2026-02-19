import Link from 'next/link';
import AffordabilityCalculator from '@/app/components/AffordabilityCalculator';
import RentVsBuyStandalone from '@/app/components/RentVsBuyStandalone';
import SellerClosingCostCalculator from '@/app/components/SellerClosingCostCalculator';

/**
 * Value Proposition Section
 *
 * Compliance notes:
 * - No guarantees or promises of results
 * - NYC-specific positioning
 * - Fair Housing compliant language
 * - No discriminatory targeting
 */
export default function ValueProposition() {
  return (
    <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40">
      <div className="max-w-[1440px] mx-auto">
        {/* Section header */}
        <div className="text-center mb-12 md:mb-16">
          <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Services</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
            Licensed NYC Brokerage
          </h2>
          <p className="mt-4 text-brand-dark/40 text-[15px] font-extralight max-w-2xl mx-auto leading-relaxed">
            Expert guidance for residential, commercial, and investment properties across NYC. Connect with a licensed broker to discuss your real estate goals.
          </p>
        </div>

        {/* Service Paths + Tools */}
        <div className="grid md:grid-cols-3 gap-7 md:gap-8 mb-10 sm:mb-12">
          {/* Buy + Affordability Calculator */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 text-center glass-card rounded-3xl p-8 hover:shadow-lg transition-all duration-500">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.1), rgba(184,134,11,0.03))' }}
              >
                <svg className="w-7 h-7 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="font-display font-semibold text-xl text-brand-dark mb-3">Buy</h3>
              <p className="text-brand-dark/40 text-[14px] font-extralight leading-relaxed mb-5">
                Buyer and investor representation for co-ops, condos, condops, townhouses, and commercial properties.
              </p>
              <Link
                href="/buy"
                data-analytics-cta="cta_buy"
                className="text-brand-gold-deep hover:underline font-medium text-sm"
              >
                Browse Sales &rarr;
              </Link>
            </div>
            <AffordabilityCalculator />
          </div>

          {/* Rent + Rent vs Buy */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 text-center glass-card rounded-3xl p-8 hover:shadow-lg transition-all duration-500">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.1), rgba(184,134,11,0.03))' }}
              >
                <svg className="w-7 h-7 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h3 className="font-display font-semibold text-xl text-brand-dark mb-3">Rent</h3>
              <p className="text-brand-dark/40 text-[14px] font-extralight leading-relaxed mb-5">
                NYC apartment rentals with support for rent negotiations, application preparation, and building requirements.
              </p>
              <Link
                href="/rent"
                data-analytics-cta="cta_rent"
                className="text-brand-gold-deep hover:underline font-medium text-sm"
              >
                Browse Rentals &rarr;
              </Link>
            </div>
            <RentVsBuyStandalone />
          </div>

          {/* Sell + Closing Cost Calculator */}
          <div className="flex flex-col gap-4">
            <div className="flex-1 text-center glass-card rounded-3xl p-8 hover:shadow-lg transition-all duration-500">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.1), rgba(184,134,11,0.03))' }}
              >
                <svg className="w-7 h-7 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-display font-semibold text-xl text-brand-dark mb-3">Sell</h3>
              <p className="text-brand-dark/40 text-[14px] font-extralight leading-relaxed mb-5">
                Strategic pricing, comprehensive marketing exposure, professional photography, and end-to-end transaction management.
              </p>
              <Link
                href="/sell"
                data-analytics-cta="cta_sell"
                className="text-brand-gold-deep hover:underline font-medium text-sm"
              >
                Sell Your Property &rarr;
              </Link>
            </div>
            <SellerClosingCostCalculator />
          </div>
        </div>

        {/* Primary CTA */}
        <div className="text-center">
          <Link
            href="/contact"
            data-analytics-cta="cta_contact_primary"
            className="btn-liquid inline-block px-10 py-4 bg-brand-dark text-white font-medium rounded-full text-sm tracking-wide"
          >
            Contact Us
          </Link>
          <p className="mt-4 text-brand-dark/25 text-[13px] font-extralight">
            No obligation. Tell us what you&apos;re looking for.
          </p>
        </div>
      </div>
    </section>
  );
}
