import Link from 'next/link';
import Image from 'next/image';

/**
 * Trust Markers Section
 *
 * Compliance-critical elements:
 * - NY State broker license (required by law)
 * - Fair Housing statement (HUD requirement)
 * - REBNY attribution (membership requirement)
 *
 * DO NOT remove or weaken these elements.
 */
export default function TrustMarkers() {
  return (
    <section className="py-12 sm:py-16 md:py-20 px-4 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Section header - consistent styling */}
        <div className="text-center mb-8 sm:mb-10">
          <h2 className="text-lg sm:text-xl md:text-2xl font-sans font-bold tracking-tight text-gray-900">
            Licensed &amp; Compliant
          </h2>
          <p className="mt-2 text-sm sm:text-base text-gray-600">
            NY State licensed broker. Fair housing for all.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 sm:gap-8 items-start">
          {/* NY State License */}
          <div className="text-center">
            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900 mb-1">
              NY State Licensed Broker
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              License #10991205323
            </p>
            <p className="text-xs text-gray-500">
              New York Department of State<br />
              Division of Licensing Services
            </p>
          </div>

          {/* Fair Housing */}
          <div className="text-center">
            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4">
              <Image
                src="/images/equal-housing-logo.svg"
                alt=""
                width={28}
                height={28}
                className="w-7 h-7"
                unoptimized
              />
            </div>
            <h3 className="font-medium text-gray-900 mb-1">
              Equal Housing Opportunity
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              We are pledged to the letter and spirit of U.S. policy for fair housing.
            </p>
            <Link
              href="/fair-housing"
              className="text-xs text-brand-gold hover:underline"
            >
              Read Our Fair Housing Policy →
            </Link>
          </div>

          {/* REBNY */}
          <div className="text-center">
            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="font-medium text-gray-900 mb-1">
              REBNY Member
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              Participant in the REBNY Residential Listing Service.
            </p>
            <p className="text-xs text-gray-500">
              Real Estate Board of New York
            </p>
          </div>
        </div>

        {/* Contact CTA */}
        <div className="mt-10 sm:mt-12 text-center">
          <p className="text-gray-500 mb-4 text-sm sm:text-base">
            Questions? We&apos;re here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
            <Link
              href="/contact"
              data-analytics-cta="cta_contact_footer"
              className="inline-block px-8 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-sm sm:text-base tracking-wide"
            >
              Contact Us
            </Link>
            <a
              href="tel:+16462584460"
              data-analytics-cta="cta_phone"
              className="inline-block px-8 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors text-sm sm:text-base"
            >
              Call (646) 258-4460
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
