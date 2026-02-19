'use client';

import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

const REVIEWS = [
  { quote: 'Maya made our Upper West Side co-op acquisition seamless. Her knowledge of board packages gave us the edge. She negotiated $40K below ask.', author: 'J. Robertson', detail: 'Bought a Co-op \u00B7 UWS' },
  { quote: 'She sold our Tribeca condo above asking in under two weeks. Staging, photography, marketing \u2014 flawless. Three competing offers.', author: 'K. Nakamura', detail: 'Sold a Condo \u00B7 Tribeca' },
  { quote: 'Relocating from London to Brooklyn Heights felt overwhelming until Maya. She found us a brownstone rental in 72 hours. Every detail handled remotely.', author: 'S. Whitfield', detail: 'Rented \u00B7 Brooklyn Heights' },
  { quote: 'As a first-time buyer, I was nervous. Maya walked me through every step with patience and care. Found me a pre-war gem I never would have found.', author: 'A. Chen', detail: 'Bought a Co-op \u00B7 UES' },
  { quote: 'Her pricing strategy was spot-on and her network brought a buyer before we listed publicly. Exceptional professionalism.', author: 'M. & D. Patel', detail: 'Sold a Condo \u00B7 Hudson Yards' },
  { quote: 'Maya is in a different league. Treats every client like her only client. Found us a place that wasn\'t on the market yet.', author: 'R. Blackwood', detail: 'Bought a Condo \u00B7 West Village' },
];

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).join('');
}

export default function ZillowTestimonials() {
  const gridRef = useGsapReveal<HTMLDivElement>({ children: true, y: 40, stagger: 0.06 });

  return (
    <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40">
      <div className="max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-14 md:mb-20">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-brand-gold-deep font-bold text-sm gold-glow-text">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
              <span className="text-[12px] font-extralight text-brand-dark/30">5.0 on</span>
              <span className="text-[11px] font-semibold bg-brand-dark text-white px-2.5 py-0.5 rounded-full">Zillow</span>
            </div>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">Client Voices</h2>
          </div>
        </div>

        {/* Review cards */}
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 md:gap-8">
          {REVIEWS.map((review) => (
            <div key={review.author} className="rev-card bg-white rounded-3xl p-7 md:p-8">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-brand-gold-deep text-sm font-bold gold-glow-text">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                <span className="text-[9px] font-semibold bg-brand-dark text-white px-2 py-0.5 rounded-full">Verified</span>
              </div>
              <p className="text-[15px] text-brand-dark/50 font-extralight leading-[1.8] mb-6">
                &ldquo;{review.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.03), rgba(0,0,0,0.06))' }}
                >
                  <span className="font-display font-semibold text-[11px] text-brand-dark/40">
                    {getInitials(review.author)}
                  </span>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-brand-dark">{review.author}</p>
                  <p className="text-brand-dark/20 text-[12px] font-extralight">{review.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
