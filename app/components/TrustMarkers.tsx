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
    <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
      <div className="max-w-[1440px] mx-auto">
        {/* Section header */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-brand-dark">
            Licensed &amp; Compliant
          </h2>
          <p className="mt-3 text-brand-dark/40 text-[15px] font-extralight">
            NY State licensed broker. Fair housing for all.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-7 md:gap-8 items-start">
          {/* NY State License */}
          <div className="text-center glass-card rounded-3xl p-8">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.03), rgba(0,0,0,0.06))' }}
            >
              <svg className="w-6 h-6 text-brand-dark/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="font-display font-semibold text-brand-dark mb-2">
              NY State Licensed Broker
            </h3>
            <p className="text-brand-dark/40 text-sm font-extralight mb-2">
              License #10991205323
            </p>
            <p className="text-brand-dark/25 text-[12px] font-extralight">
              New York Department of State<br />
              Division of Licensing Services
            </p>
          </div>

          {/* Fair Housing */}
          <div className="text-center glass-card rounded-3xl p-8">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.03), rgba(0,0,0,0.06))' }}
            >
              <Image
                src="/images/equal-housing-logo.svg"
                alt=""
                width={28}
                height={28}
                className="w-7 h-7"
                unoptimized
              />
            </div>
            <h3 className="font-display font-semibold text-brand-dark mb-2">
              Equal Housing Opportunity
            </h3>
            <p className="text-brand-dark/40 text-sm font-extralight mb-2">
              We are pledged to the letter and spirit of U.S. policy for fair housing.
            </p>
            <Link
              href="/fair-housing"
              className="text-brand-gold-deep hover:underline text-[12px] font-medium"
            >
              Read Our Fair Housing Policy &rarr;
            </Link>
          </div>

          {/* REBNY */}
          <div className="text-center glass-card rounded-3xl p-8">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.03), rgba(0,0,0,0.06))' }}
            >
              <svg className="w-6 h-6 text-brand-dark/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="font-display font-semibold text-brand-dark mb-2">
              REBNY Member
            </h3>
            <p className="text-brand-dark/40 text-sm font-extralight mb-2">
              Participant in the REBNY Residential Listing Service.
            </p>
            <p className="text-brand-dark/25 text-[12px] font-extralight">
              Real Estate Board of New York
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
