'use client';

import { useGsapReveal } from '@/lib/hooks/useGsapReveal';

const ZILLOW_URL = 'https://www.zillow.com/profile/Maya%20Allan';
const TOTAL_REVIEWS = 13;

const REVIEWS = [
  {
    quote: 'My husband and I have worked with Maya on both buying and selling, as well as looking at other possible properties. She does an excellent job. She has an excellent understanding of the current market and your needs. She always keeps your interests at the forefront; she offers great advice but never pushes people into anything.',
    author: 'J.',
    detail: 'Bought & Sold \u00B7 NYC',
  },
  {
    quote: 'I had a great experience with Maya getting the best apartment in Manhattan. She is very knowledgeable about the NY market and will work with you to get you what you need.',
    author: 'A.',
    detail: 'Bought & Sold \u00B7 Manhattan',
  },
  {
    quote: 'I was a first time home buyer \u2014 Maya was extremely professional and knowledgeable. She took the time to understand my situation and found apartments that suited my desires.',
    author: 'S.L.',
    detail: 'Bought a Condo \u00B7 Upper West Side',
  },
  {
    quote: 'Maya is determined, knowledgeable and charismatic \u2014 all assets that serve her well in her urban environment. I specifically chose Maya to be my selling and buying agent.',
    author: 'L.',
    detail: 'Bought & Sold \u00B7 Upper East Side',
  },
  {
    quote: 'Maya puts her clients first \u2014 even to the extent of dissuading them from a transaction if she feels it is not in their best interests. She helped us manage a tricky seller.',
    author: 'C.K.',
    detail: 'Bought a Condo \u00B7 Battery Park',
  },
  {
    quote: 'In the huge crowd of brokers in New York City, Maya stands out. I felt all the time that she has your best interests at heart.',
    author: 'M.',
    detail: 'Found a Tenant \u00B7 Manhattan',
  },
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
              <span className="text-[12px] font-light text-brand-dark/60">5.0 &middot; {TOTAL_REVIEWS} reviews on</span>
              <span className="text-[11px] font-semibold bg-brand-dark text-white px-2.5 py-0.5 rounded-full">Zillow</span>
            </div>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">Client Voices</h2>
          </div>
          <a
            href={ZILLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-brand-dark/50 hover:text-brand-gold-deep transition-colors"
          >
            Read all {TOTAL_REVIEWS} reviews &rarr;
          </a>
        </div>

        {/* Review cards */}
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 md:gap-8">
          {REVIEWS.map((review) => (
            <div key={review.author} className="rev-card bg-white rounded-3xl p-7 md:p-8">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-brand-gold-deep text-sm font-bold gold-glow-text">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                <span className="text-[9px] font-semibold bg-brand-dark text-white px-2 py-0.5 rounded-full">Verified</span>
              </div>
              <p className="text-[15px] text-brand-dark/70 font-light leading-[1.8] mb-6">
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
                  <p className="text-brand-dark/50 text-[12px] font-light">{review.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
