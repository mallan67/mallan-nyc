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
export default function ValueProposition() {
  return (
    <section className="py-12 sm:py-16 md:py-20 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Main Value Statement - consistent header styling */}
        <div className="text-center mb-10 sm:mb-12">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-sans font-bold tracking-tight text-gray-900">
            Licensed NYC Brokerage
          </h2>
          <p className="mt-3 text-sm sm:text-base md:text-lg text-gray-600 max-w-2xl mx-auto">
            Expert guidance for residential, commercial, and investment properties across NYC. Connect with a licensed broker to discuss your real estate goals.
          </p>
        </div>

        {/* Service Paths */}
        <div className="grid md:grid-cols-3 gap-6 sm:gap-8 mb-10 sm:mb-12">
          {/* Buy */}
          <div className="text-center p-6 rounded-lg border border-gray-100 hover:border-brand-gold/30 hover:shadow-lg transition-all">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-sans font-medium text-gray-900 mb-2">Buy</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Buyer and investor representation for co-ops, condos, condops, townhouses, and commercial properties. Board packages, financial review, and contract negotiation.
            </p>
            <Link
              href="/buy"
              data-analytics-cta="cta_buy"
              className="text-brand-gold hover:underline font-medium text-sm"
            >
              Browse Sales →
            </Link>
          </div>

          {/* Rent */}
          <div className="text-center p-6 rounded-lg border border-gray-100 hover:border-brand-gold/30 hover:shadow-lg transition-all">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-xl font-sans font-medium text-gray-900 mb-2">Rent</h3>
            <p className="text-gray-600 mb-4 text-sm">
              New York City apartment rentals with support for rent negotiations, application preparation and submission, and guidance through building-specific requirements and approvals.
            </p>
            <Link
              href="/rent"
              data-analytics-cta="cta_rent"
              className="text-brand-gold hover:underline font-medium text-sm"
            >
              Browse Rentals →
            </Link>
          </div>

          {/* Sell */}
          <div className="text-center p-6 rounded-lg border border-gray-100 hover:border-brand-gold/30 hover:shadow-lg transition-all">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-sans font-medium text-gray-900 mb-2">Sell</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Strategic property pricing, comprehensive marketing exposure, professional photography, and end-to-end transaction management from listing to closing.
            </p>
            <Link
              href="/sell"
              data-analytics-cta="cta_sell"
              className="text-brand-gold hover:underline font-medium text-sm"
            >
              Sell Your Property →
            </Link>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="text-center">
          <Link
            href="/contact"
            data-analytics-cta="cta_contact_primary"
            className="inline-block px-8 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-sm sm:text-base tracking-wide"
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
