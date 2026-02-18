import Link from 'next/link';
import Image from 'next/image';

/**
 * Trust Markers — compact compliance strip
 * Required: NY State license, Fair Housing, REBNY attribution
 * DO NOT remove these elements.
 */
export default function TrustMarkers() {
  return (
    <section className="py-10 sm:py-14 px-4 bg-gray-50 border-t border-gray-200">
      <div className="max-w-5xl mx-auto">
        {/* Compact single row */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12 text-center sm:text-left">
          {/* License */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#C4A052]/10 border border-[#C4A052]/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#C4A052]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">NY Licensed Broker</p>
              <p className="text-xs text-gray-500">#10991205323</p>
            </div>
          </div>

          <span className="hidden sm:block w-px h-8 bg-gray-300" />

          {/* Fair Housing */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#C4A052]/10 border border-[#C4A052]/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <Image
                src="/images/equal-housing-logo.svg"
                alt=""
                width={22}
                height={22}
                className="w-5.5 h-5.5"
                unoptimized
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Equal Housing</p>
              <Link href="/fair-housing" className="text-xs text-[#C4A052] hover:underline">
                Fair Housing Policy →
              </Link>
            </div>
          </div>

          <span className="hidden sm:block w-px h-8 bg-gray-300" />

          {/* REBNY */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#C4A052]/10 border border-[#C4A052]/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#C4A052]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">REBNY Member</p>
              <p className="text-xs text-gray-500">RLS Participant</p>
            </div>
          </div>
        </div>

        {/* CTA — single line */}
        <div className="mt-8 text-center">
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/contact"
              data-analytics-cta="cta_contact_footer"
              className="btn-dark text-sm"
            >
              Contact Us
            </Link>
            <a
              href="tel:+16462584460"
              data-analytics-cta="cta_phone"
              className="btn-outline text-sm"
            >
              (646) 258-4460
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
