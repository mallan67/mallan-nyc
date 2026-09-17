'use client';

import Image from 'next/image';
import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

export default function AboutSection() {
  const sectionRef = useGsapReveal<HTMLDivElement>({ y: 40, duration: 1 });

  return (
    <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40">
      <div ref={sectionRef} className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 md:gap-28 items-center">
        {/* Image */}
        <div className="relative rounded-[32px] overflow-hidden aspect-[3/2] lg:aspect-[4/3] float-shadow">
          <Image
            src="/images/about-penthouse.png"
            alt="Luxury NYC penthouse living room with panoramic Central Park and skyline views"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
            loading="lazy"
          />
        </div>

        {/* Content */}
        <div>
          <p className="text-brand-gold-deep text-[13px] font-medium mb-3 gold-glow-text">About</p>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight mb-8 leading-snug text-brand-dark">
            The right home doesn&apos;t just house you.
          </h2>
          <p className="text-brand-dark/90 text-[15px] font-light leading-[2] mb-6">
            It grounds you, expands you, and mirrors the life you&apos;re building. At Mallan Real Estate, every property we represent is chosen not just for its market position, but for its capacity to transform the life of the person who walks through its door.
          </p>
          <p className="text-brand-dark/90 text-[15px] font-light leading-[2] mb-10">
            Founded by Maya Allan in New York City with deep market intelligence and an intuitive understanding of what makes a space feel like home. Full-service brokerage for buyers, sellers, and renters across all five boroughs.
          </p>

          {/* Agent card */}
          <div className="glass-card rounded-2xl p-6 flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.15), rgba(184,134,11,0.05))', boxShadow: 'var(--gold-glow)' }}
            >
              <span className="font-display font-bold text-brand-gold-deep text-lg">MA</span>
            </div>
            <div>
              <p className="font-display font-semibold text-[15px] text-brand-dark">Maya Allan</p>
              {/*
                This read "Founder &middot; Licensed NYC Broker".

                "Licensed NYC Broker" is an INDIVIDUAL professional claim,
                hard-coded here and published from Git on every visit to the
                home page, ungoverned by the Agent record. Same defect class
                as the founder.jobTitle removed from the root JSON-LD: that
                prong was cleaned, this rendered one was not. It is wrong
                while the database is HEALTHY, not only during an outage,
                because nothing about it can be corrected by changing the
                Agent record.

                It is also imprecise. "Licensed NYC Broker" is not a New York
                designation at all. The statutory ones are Licensed Real
                Estate Broker, Licensed Associate Real Estate Broker and
                Licensed Real Estate Salesperson (NY DOS 19 NYCRR 175.25).

                "Founder" is a COMPANY role, not a licence assertion, so it
                stays. The regulated designation belongs to the governed
                Agent profile at /agents/maya-allan, which derives it through
                lib/agents/professional-title.
              */}
              <p className="text-brand-dark/95 text-[12px] font-light">Founder</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
