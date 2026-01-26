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
    <section className="py-16 md:py-20 bg-white">
      <div className="max-w-6xl mx-auto px-4">
        {/* Main Value Statement */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-3xl md:text-4xl font-serif font-medium text-gray-900 mb-4">
            Your NYC Real Estate Partner
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
            Whether you&apos;re buying your first home, selling a family property, or
            searching for the right rental, we provide knowledgeable guidance
            through every step of the process.
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
              Navigate NYC&apos;s competitive market with an agent who understands
              co-op boards, condo financials, and neighborhood dynamics.
            </p>
            <Link
              href="/buy"
              data-analytics-cta="value_prop_buy"
              className="text-brand-gold hover:underline font-medium text-sm"
            >
              Search Properties →
            </Link>
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
              Find apartments across Manhattan and Brooklyn with guidance on
              applications, lease terms, and building requirements.
            </p>
            <Link
              href="/rent"
              data-analytics-cta="value_prop_rent"
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
            <h3 className="text-xl font-serif font-medium text-gray-900 mb-2">Sell</h3>
            <p className="text-gray-600 mb-4 text-sm">
              List your property with professional marketing, accurate pricing
              guidance, and representation throughout the transaction.
            </p>
            <Link
              href="/sell"
              data-analytics-cta="value_prop_sell"
              className="text-brand-gold hover:underline font-medium text-sm"
            >
              Learn More →
            </Link>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="text-center">
          <Link
            href="/contact"
            data-analytics-cta="value_prop_contact"
            className="inline-block px-8 py-3 bg-brand-dark text-white font-medium rounded hover:bg-black transition-colors"
          >
            Schedule a Consultation
          </Link>
          <p className="mt-3 text-sm text-gray-500">
            No obligation. We&apos;ll discuss your goals and how we can help.
          </p>
        </div>
      </div>
    </section>
  );
}
