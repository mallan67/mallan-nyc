import Link from 'next/link';

export default function SellerCTA() {
  return (
    <section className="px-4 sm:px-6 md:px-12 lg:px-20 py-16 md:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center rounded-3xl bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] p-8 md:p-12 lg:p-16 overflow-hidden">
          {/* Left — Copy */}
          <div>
            <p className="text-brand-gold text-[11px] font-medium tracking-[0.2em] uppercase mb-4">
              For Sellers
            </p>
            <h2 className="font-display font-bold text-2xl md:text-3xl lg:text-4xl tracking-tight text-white leading-tight mb-4">
              Thinking of Selling?
            </h2>
            <p className="text-white/60 text-[15px] font-light leading-relaxed mb-6">
              Your listing goes live across every major platform simultaneously &mdash; from
              NYC&apos;s 30,000+ agent network to Zillow, StreetEasy, Realtor.com, and
              international portals. Maximum exposure from day one.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/sell#valuation"
                className="px-6 py-3 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm"
              >
                Get Free Valuation
              </Link>
              <Link
                href="/results"
                className="px-6 py-3 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 transition-colors text-sm"
              >
                See Our Results
              </Link>
            </div>
          </div>
          {/* Right — Quick stats */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { stat: '10+', label: 'Platforms', sub: 'Instant syndication' },
              { stat: '30K+', label: 'Agents', sub: 'NYC broker network' },
              { stat: 'Free', label: 'CMA Report', sub: 'No obligation' },
              { stat: '5.0', label: 'Zillow Rating', sub: 'Verified reviews' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl p-5"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <p className="text-2xl font-display font-bold text-brand-gold mb-0.5">
                  {item.stat}
                </p>
                <p className="text-white/80 text-[13px] font-medium">{item.label}</p>
                <p className="text-white/40 text-[11px]">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
