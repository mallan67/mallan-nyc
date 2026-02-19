'use client';

import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

export default function CTASection() {
  const ref = useGsapReveal<HTMLDivElement>({ y: 40, duration: 1 });

  return (
    <section className="bg-brand-dark text-center py-28 md:py-40 lg:py-48 px-6">
      <div ref={ref}>
        <p className="text-brand-gold-deep text-[13px] font-medium mb-4 gold-glow-text">Begin</p>
        <h2 className="font-display font-bold text-white text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight max-w-3xl mx-auto leading-snug mb-5">
          Your next chapter starts here.
        </h2>
        <p className="text-white/60 text-sm font-light mb-14 max-w-md mx-auto leading-relaxed">
          Whether you&apos;re buying, selling, or renting &mdash; we make it effortless.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="tel:6462584460"
            data-analytics-cta="cta_phone"
            className="btn-gold bg-brand-gold-deep text-white font-medium text-sm px-10 py-4 rounded-full"
          >
            (646) 258-4460
          </a>
          <a
            href="mailto:info@mallan.nyc"
            data-analytics-cta="cta_email"
            className="btn-liquid border border-white/15 text-white font-light text-sm px-10 py-4 rounded-full hover:border-white/40"
          >
            info@mallan.nyc
          </a>
        </div>
      </div>
    </section>
  );
}
