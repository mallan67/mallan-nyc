import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import SocialShareBar from '@/app/components/SocialShareBar';
import Image from 'next/image';
import Link from 'next/link';
import SellerClosingCostCalculator from '@/app/components/SellerClosingCostCalculator';
import CMARequestForm from '@/app/components/CMARequestForm';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Sell Your Property | Mallan Real Estate',
  description: 'Sell your NYC property with Mallan Real Estate. Expert guidance, professional marketing, and proven results.',
  alternates: { canonical: 'https://mallan.nyc/sell' },
  openGraph: {
    title: 'Sell Your Property | Mallan Real Estate',
    description: 'Sell your NYC property with expert guidance, professional marketing, and proven results from Mallan Real Estate.',
    url: 'https://mallan.nyc/sell',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sell Your Property | Mallan Real Estate',
    description: 'Sell your NYC property with expert guidance, professional marketing, and proven results from Mallan Real Estate.',
  },
};

const sellHowToSchema = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to Sell Your Property in NYC',
  description: 'A 5-step guide to selling your property in New York City with Mallan Real Estate.',
  step: [
    {
      '@type': 'HowToStep',
      position: 1,
      name: 'Consultation',
      text: 'Meet with a licensed agent to discuss your goals, timeline, and assess your property. You will receive a comprehensive market analysis.',
    },
    {
      '@type': 'HowToStep',
      position: 2,
      name: 'Preparation',
      text: 'Receive recommendations for staging, repairs, and improvements to maximize your property\'s appeal. Professional photography and marketing materials are prepared.',
    },
    {
      '@type': 'HowToStep',
      position: 3,
      name: 'Marketing',
      text: 'Your property is listed across all major platforms including REBNY RLS and marketed to a network of buyers and brokers.',
    },
    {
      '@type': 'HowToStep',
      position: 4,
      name: 'Showings and Offers',
      text: 'All showings are managed and offers are presented for your review. The team guides you through negotiations to secure the best terms.',
    },
    {
      '@type': 'HowToStep',
      position: 5,
      name: 'Closing',
      text: 'Coordination with attorneys, buyers, and all parties ensures a smooth closing process from contract to keys.',
    },
  ],
};

const sellFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How long does it take to sell a property in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The average time to sell a property in NYC is 3 to 6 months from listing to closing. Well-priced properties in desirable neighborhoods can sell faster. Co-ops may take longer due to board approval requirements, typically adding 1-3 months to the timeline.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are the closing costs for sellers in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NYC sellers should expect closing costs of approximately 6-8% of the sale price, including: broker commission, NYC/NYS transfer taxes (1.4-1.825% depending on price), attorney fees ($2,000-$5,000), and any building-required fees like flip taxes for co-ops. Properties over $1 million are subject to a mansion tax paid by the buyer.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to stage my NYC property before selling?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'While not required, professional staging can significantly impact sale price and time on market. Well-presented properties tend to attract more interest and stronger offers. At minimum, decluttering and professional photography are recommended for all listings.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do you determine the right listing price?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We prepare a Comparative Market Analysis (CMA) that examines recent sales of similar properties in your neighborhood, current market conditions, and your property\'s unique features. This data-driven approach, combined with our local market expertise, helps determine a price that attracts buyers while maximizing your return.',
      },
    },
    {
      '@type': 'Question',
      name: 'What happens if my co-op board rejects a buyer?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Co-op boards in NYC can reject buyers without providing a reason (subject to fair housing laws). If a board rejection occurs, the contract typically becomes void and the buyer\'s deposit is returned. We help minimize this risk by pre-screening buyers and ensuring application packages are thorough and well-presented.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I sell my property while it\'s tenant-occupied?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, but NYC tenant protection laws apply. Rent-stabilized tenants have the right to remain through lease expiration and renewal. Market-rate tenants must be given proper notice. Selling with a tenant in place may affect the buyer pool — investors may prefer it, while end-users typically want vacant possession. We advise on the best strategy for your situation.',
      },
    },
  ],
};

const FAQS = [
  {
    question: 'How long does it take to sell a property in NYC?',
    answer: 'The average time to sell a property in NYC is 3 to 6 months from listing to closing. Well-priced properties in desirable neighborhoods can sell faster. Co-ops may take longer due to board approval requirements, typically adding 1-3 months to the timeline.',
  },
  {
    question: 'What are the closing costs for sellers in NYC?',
    answer: 'NYC sellers should expect closing costs of approximately 6-8% of the sale price, including: broker commission, NYC/NYS transfer taxes (1.4-1.825% depending on price), attorney fees ($2,000-$5,000), and any building-required fees like flip taxes for co-ops. Properties over $1 million are subject to a mansion tax paid by the buyer.',
  },
  {
    question: 'Do I need to stage my NYC property before selling?',
    answer: 'While not required, professional staging can significantly impact sale price and time on market. Well-presented properties tend to attract more interest and stronger offers. At minimum, decluttering and professional photography are recommended for all listings.',
  },
  {
    question: 'How do you determine the right listing price?',
    answer: 'We prepare a Comparative Market Analysis (CMA) that examines recent sales of similar properties in your neighborhood, current market conditions, and your property\u2019s unique features. This data-driven approach, combined with our local market expertise, helps determine a price that attracts buyers while maximizing your return.',
  },
  {
    question: 'What happens if my co-op board rejects a buyer?',
    answer: 'Co-op boards in NYC can reject buyers without providing a reason (subject to fair housing laws). If a board rejection occurs, the contract typically becomes void and the buyer\u2019s deposit is returned. We help minimize this risk by pre-screening buyers and ensuring application packages are thorough and well-presented.',
  },
  {
    question: 'Can I sell my property while it\u2019s tenant-occupied?',
    answer: 'Yes, but NYC tenant protection laws apply. Rent-stabilized tenants have the right to remain through lease expiration and renewal. Market-rate tenants must be given proper notice. Selling with a tenant in place may affect the buyer pool \u2014 investors may prefer it, while end-users typically want vacant possession. We advise on the best strategy for your situation.',
  },
];

const SELLER_REVIEWS = [
  {
    quote: 'My husband and I have worked with Maya on both buying and selling, as well as looking at other possible properties. She does an excellent job. She has an excellent understanding of the current market and your needs. She always keeps your interests at the forefront.',
    author: 'J.',
    detail: 'Bought & Sold \u00B7 NYC',
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
];

const SELLING_STEPS = [
  {
    step: '01',
    title: 'Consultation',
    description: 'We meet to discuss your goals, timeline, and property. You receive a comprehensive market analysis with comparable sales data.',
  },
  {
    step: '02',
    title: 'Preparation',
    description: 'Strategic staging, repairs, and professional photography. Every detail is crafted to command attention.',
  },
  {
    step: '03',
    title: 'Launch',
    description: 'Your listing goes live across every platform simultaneously \u2014 local, national, and global.',
  },
  {
    step: '04',
    title: 'Showings & Offers',
    description: 'We manage all showings, present every offer, and negotiate to secure the strongest terms.',
  },
  {
    step: '05',
    title: 'Closing',
    description: 'We coordinate with attorneys, buyers, and all parties for a seamless close.',
  },
];

const ZILLOW_URL = 'https://www.zillow.com/profile/Maya%20Allan';

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).join('');
}

export default function SellPage() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sellHowToSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sellFaqSchema) }}
      />
      <Header dark />
      <main>
        {/* ═══════════════════════════════════════════════
            1. HERO — Cinematic full-viewport
            ═══════════════════════════════════════════════ */}
        <section className="relative h-screen min-h-[600px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 liquid-img">
            <Image
              src="https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1600&q=80&auto=format&fit=crop"
              alt="Manhattan skyline at golden hour from luxury high-rise"
              fill
              className="object-cover"
              style={{ objectPosition: 'center 40%' }}
              priority
              sizes="100vw"
              quality={90}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70" />
          </div>
          <div className="relative z-10 text-center text-white px-6 pt-20 max-w-4xl">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-6">Mallan Real Estate</p>
            <h1 className="font-display font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1.02] mb-6" style={{ textShadow: '0 4px 40px rgba(0,0,0,0.2)' }}>
              Your Home Deserves<br />the World&apos;s Attention
            </h1>
            <p className="text-white/60 text-base md:text-lg font-extralight max-w-xl mx-auto mb-12 leading-relaxed">
              We don&apos;t just list your property. We launch it &mdash; across New York,
              across the country, and around the world.
            </p>
            <a
              href="#valuation"
              className="btn-liquid inline-block px-12 py-4 bg-brand-gold hover:bg-brand-gold-deep text-white font-medium rounded-full text-sm tracking-wide"
            >
              Get Your Free Valuation
            </a>
          </div>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
            <div className="w-6 h-10 border border-white/20 rounded-full flex justify-center pt-2.5">
              <div className="w-1 h-2 bg-white/50 rounded-full animate-bounce" />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            2. REACH — Local / National / Global (transparent)
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-16 md:mb-24">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3 gold-glow-text">Where Your Listing Goes</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-6xl tracking-tight text-brand-dark leading-tight">
                Listed Locally.<br className="hidden md:block" /> Seen Nationally.<br className="hidden md:block" /> Reached Globally.
              </h2>
              <p className="mt-6 text-brand-dark/40 text-[15px] font-extralight max-w-2xl mx-auto leading-relaxed">
                The moment your listing goes live, it appears on every major platform &mdash;
                from NYC&apos;s broker network to the largest real estate sites in the world.
              </p>
            </div>

            {/* Three reach tiers */}
            <div className="grid md:grid-cols-3 gap-6 md:gap-8">
              {/* LOCAL */}
              <div className="btn-liquid relative rounded-3xl p-8 md:p-10 border border-black/[0.04]" style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.03), rgba(255,255,255,0.8))', boxShadow: '0 8px 40px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.15), rgba(184,134,11,0.05))' }}>
                    <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-brand-gold-deep text-[11px] font-medium tracking-[0.15em] uppercase">New York City</p>
                </div>
                <p className="font-display font-bold text-5xl md:text-6xl text-brand-dark mb-2">30K+</p>
                <p className="text-brand-dark/50 text-sm font-light mb-6">Licensed agents across NYC see your listing instantly</p>
                <div className="space-y-3 border-t border-black/[0.05] pt-6">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">570+ participating brokerage firms</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">30 partner brokerage websites</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">StreetEasy &mdash; NYC&apos;s #1 property search</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">mallan.nyc &mdash; featured with professional photography</p>
                  </div>
                </div>
              </div>

              {/* NATIONAL */}
              <div className="btn-liquid relative rounded-3xl p-8 md:p-10 border border-black/[0.04]" style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.03), rgba(255,255,255,0.8))', boxShadow: '0 8px 40px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.15), rgba(184,134,11,0.05))' }}>
                    <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <p className="text-brand-gold-deep text-[11px] font-medium tracking-[0.15em] uppercase">Nationwide</p>
                </div>
                <p className="font-display font-bold text-5xl md:text-6xl text-brand-dark mb-2">Millions</p>
                <p className="text-brand-dark/50 text-sm font-light mb-6">of buyers on America&apos;s largest real estate platforms</p>
                <div className="space-y-3 border-t border-black/[0.05] pt-6">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">Zillow + Trulia &mdash; most-visited in the US</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">Realtor.com &mdash; official site of the NAR</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">Redfin &mdash; tech-forward search nationwide</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">Homes.com &mdash; CoStar&apos;s flagship consumer portal</p>
                  </div>
                </div>
              </div>

              {/* GLOBAL */}
              <div className="btn-liquid relative rounded-3xl p-8 md:p-10 border border-black/[0.04]" style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.03), rgba(255,255,255,0.8))', boxShadow: '0 8px 40px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.15), rgba(184,134,11,0.05))' }}>
                    <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-brand-gold-deep text-[11px] font-medium tracking-[0.15em] uppercase">Global</p>
                </div>
                <p className="font-display font-bold text-5xl md:text-6xl text-brand-dark mb-2">Worldwide</p>
                <p className="text-brand-dark/50 text-sm font-light mb-6">Your listing reaches international buyers searching for NYC property</p>
                <div className="space-y-3 border-t border-black/[0.05] pt-6">
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">ListHub &mdash; syndicates to 100+ international portals</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">ListGlobally &mdash; 100+ countries, 700M+ monthly visitors</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">International MLS &mdash; cross-border buyer network</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-gold" />
                    <p className="text-brand-dark/40 text-[13px] font-extralight">Samaki &mdash; global real estate marketplace</p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-brand-dark/20 text-[11px] text-center mt-14 max-w-3xl mx-auto leading-relaxed">
              Your listing is syndicated automatically across all platforms the moment it goes live.
              StreetEasy listings are uploaded directly &mdash; sales are free. No additional fees for syndication.
            </p>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            3. NOT JUST LISTED — Asymmetric cinematic cards
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40 bg-[#F8F7F4]">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-16 md:mb-20">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3 gold-glow-text">The Advantage</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-6xl tracking-tight text-brand-dark leading-tight">
                Not Just Listed.<br />Launched.
              </h2>
              <p className="mt-6 text-brand-dark/40 text-[15px] font-extralight max-w-xl mx-auto leading-relaxed">
                Every property we represent receives the full weight of our marketing,
                our network, and our relentless attention to detail.
              </p>
            </div>

            {/* Asymmetric grid — row 1: pricing stack (large) + photo (small) */}
            <div className="grid lg:grid-cols-12 gap-6 md:gap-8">

              {/* Strategic Pricing — Frosted glass stacked cards (7 cols) */}
              <div className="lg:col-span-7 relative rounded-[28px] overflow-hidden min-h-[520px] lg:min-h-[580px]" style={{ background: 'linear-gradient(160deg, #c8cfd8, #dce1e8, #eaecf0)', boxShadow: '0 20px 60px rgba(0,0,0,0.06)' }}>
                {/* Brushed metallic shimmer overlay */}
                <div className="absolute inset-0 opacity-30" style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(255,255,255,0.15) 2px, rgba(255,255,255,0.15) 3px)' }} />

                <div className="relative z-10 p-8 md:p-12 h-full flex flex-col">
                  {/* Stacked cards */}
                  <div className="relative flex-1 min-h-[340px]">
                    {/* Card 3 (back) */}
                    <div
                      className="absolute top-0 left-0 right-0 bottom-0 rounded-[18px]"
                      style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.25), rgba(255,255,255,0.08))', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.3)', transform: 'translate(20px, 16px)', boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}
                    />
                    {/* Card 2 (middle) */}
                    <div
                      className="absolute top-0 left-0 right-0 bottom-0 rounded-[18px]"
                      style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.35), rgba(255,255,255,0.12))', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.4)', transform: 'translate(10px, 8px)', boxShadow: '0 12px 40px rgba(0,0,0,0.06)' }}
                    />
                    {/* Card 1 (front) — Pricing Plan */}
                    <div
                      className="absolute top-0 left-0 right-0 bottom-0 rounded-[18px]"
                      style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.6), rgba(255,255,255,0.25))', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 20px 50px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)' }}
                    >
                      <div className="p-7 md:p-9 h-full flex flex-col">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 rounded-full bg-brand-dark/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-brand-dark/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </div>
                          <span className="text-brand-dark/60 text-[12px] font-medium tracking-[0.12em] uppercase">Pricing Strategy</span>
                        </div>
                        <h3 className="font-display font-bold text-3xl md:text-4xl text-brand-dark mb-3">Pricing Plan</h3>
                        <div className="space-y-4 mt-6">
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-dark/30" />
                            <span className="text-brand-dark/60 text-[15px] font-light">Market Range</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-dark/30" />
                            <span className="text-brand-dark/60 text-[15px] font-light">Your Goals</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-dark/30" />
                            <span className="text-brand-dark/60 text-[15px] font-light">Price Recommendations</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom tab labels */}
                  <div className="flex gap-3 mt-5 relative z-10">
                    <div className="px-5 py-2.5 rounded-lg text-[12px] font-medium text-brand-dark/50 tracking-wide" style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.5)' }}>
                      Comparable Report
                    </div>
                    <div className="px-5 py-2.5 rounded-lg text-[12px] font-medium text-brand-dark/50 tracking-wide" style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.5)' }}>
                      Marketing Campaign
                    </div>
                  </div>
                </div>
              </div>

              {/* Professional Imagery — SMALLER (5 cols) */}
              <div className="lg:col-span-5 relative rounded-3xl overflow-hidden aspect-[4/3] lg:aspect-auto lg:min-h-[520px] group liquid-img" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
                <Image
                  src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80&auto=format&fit=crop"
                  alt="Luxury property photographed with professional lighting"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 42vw"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8 md:p-10">
                  <p className="text-brand-gold text-[11px] font-medium tracking-[0.15em] uppercase mb-2">Photography & Media</p>
                  <h3 className="font-display font-bold text-xl md:text-2xl text-white mb-2">Professional Imagery</h3>
                  <p className="text-white/60 text-[13px] font-extralight leading-relaxed max-w-sm">
                    High-resolution photography, virtual tours, and floor plans that
                    make buyers stop scrolling and start calling.
                  </p>
                </div>
              </div>

              {/* Expert Negotiation — SMALLER (5 cols) */}
              <div className="lg:col-span-5 relative rounded-3xl overflow-hidden aspect-[4/3] lg:aspect-auto lg:min-h-[400px] group liquid-img" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
                <Image
                  src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&q=80&auto=format&fit=crop"
                  alt="Elegant living room in a staged New York property"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 42vw"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8 md:p-10">
                  <p className="text-brand-gold text-[11px] font-medium tracking-[0.15em] uppercase mb-2">Representation</p>
                  <h3 className="font-display font-bold text-xl md:text-2xl text-white mb-2">Expert Negotiation</h3>
                  <p className="text-white/60 text-[13px] font-extralight leading-relaxed max-w-sm">
                    Every offer evaluated, every term negotiated, every dollar fought for.
                  </p>
                </div>
              </div>

              {/* Personal Attention — LARGER (7 cols) */}
              <div className="lg:col-span-7 relative rounded-3xl overflow-hidden aspect-[4/3] lg:aspect-auto lg:min-h-[400px] group liquid-img" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
                <Image
                  src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=85&auto=format&fit=crop"
                  alt="Luxury property exterior with elegant architecture"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 58vw"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
                  <p className="text-brand-gold text-[11px] font-medium tracking-[0.15em] uppercase mb-3">White-Glove Service</p>
                  <h3 className="font-display font-bold text-2xl md:text-4xl text-white mb-3">Personal Attention</h3>
                  <p className="text-white/60 text-sm font-extralight leading-relaxed max-w-md">
                    You work directly with your broker from day one through closing.
                    No hand-offs, no assistants, no runaround.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            4. VALUATION FORM — Editorial 2-column
            ═══════════════════════════════════════════════ */}
        <section id="valuation" className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 md:gap-28 items-center">
            <div>
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3 gold-glow-text">Free Valuation</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight mb-6 leading-snug text-brand-dark">
                What&apos;s Your Property Worth?
              </h2>
              <p className="text-brand-dark/40 text-[15px] font-extralight leading-[2] mb-10">
                Get a complimentary property valuation from a licensed NYC broker.
                We&apos;ll evaluate your property, your neighborhood, and current market
                conditions to give you an accurate price range &mdash; no obligation, no pressure.
              </p>
              <div className="glass-card rounded-2xl p-6 flex items-center gap-5">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.15), rgba(184,134,11,0.05))', boxShadow: 'var(--gold-glow)' }}
                >
                  <span className="font-display font-bold text-brand-gold-deep text-lg">MA</span>
                </div>
                <div>
                  <p className="font-display font-semibold text-[15px] text-brand-dark">Maya Allan</p>
                  <p className="text-brand-dark/30 text-[12px] font-extralight">Founder &middot; Licensed NYC Broker</p>
                </div>
              </div>
            </div>
            <div>
              <CMARequestForm />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            5. SELLING PROCESS — Horizontal timeline
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40 bg-[#F8F7F4]">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-16 md:mb-20">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3 gold-glow-text">The Process</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-6xl tracking-tight text-brand-dark">
                Five Steps to Sold
              </h2>
            </div>

            <div className="hidden lg:block">
              <div className="relative">
                <div className="absolute top-6 left-[10%] right-[10%] h-px bg-brand-gold/20" />
                <div className="grid grid-cols-5 gap-6">
                  {SELLING_STEPS.map((item) => (
                    <div key={item.step} className="flex flex-col items-center text-center">
                      <div className="relative z-10 w-12 h-12 rounded-full bg-brand-gold text-white flex items-center justify-center font-semibold text-sm mb-6 shadow-lg shadow-brand-gold/20">
                        {item.step}
                      </div>
                      <h3 className="font-display font-semibold text-base text-brand-dark mb-2">{item.title}</h3>
                      <p className="text-brand-dark/40 text-[13px] font-extralight leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:hidden space-y-4">
              {SELLING_STEPS.map((item) => (
                <div key={item.step} className="btn-liquid glass-card rounded-2xl p-6 flex gap-5">
                  <div className="flex-shrink-0">
                    <span className="w-12 h-12 rounded-full bg-brand-gold text-white flex items-center justify-center font-semibold text-sm shadow-lg shadow-brand-gold/20">
                      {item.step}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-semibold mb-1">{item.title}</h3>
                    <p className="text-brand-dark/40 text-sm font-extralight">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            6. CLOSING COST CALCULATOR
            ═══════════════════════════════════════════════ */}
        <section className="py-12 px-4">
          <div className="max-w-xl mx-auto">
            <SellerClosingCostCalculator />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            7. COMMISSION TRANSPARENCY
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3 gold-glow-text">Transparency</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                No Surprises. Ever.
              </h2>
            </div>
            <div className="glass-card rounded-3xl p-8 md:p-12 max-w-3xl mx-auto">
              <p className="text-brand-dark/40 text-[15px] font-extralight leading-[2] mb-8">
                You&apos;ll know exactly what you&apos;re paying before you sign anything.
                We believe the best client relationships start with complete honesty about costs.
              </p>
              <ul className="space-y-5 mb-8">
                {[
                  'Commission rates are not set by law and are fully negotiable',
                  'All fees are discussed upfront before any agreement',
                  'No hidden costs \u2014 ever',
                  'Use the closing cost calculator above for a detailed estimate',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-brand-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-brand-dark/50 text-[14px] font-light">{point}</span>
                  </li>
                ))}
              </ul>
              <p className="text-brand-dark/25 text-[12px] font-extralight border-t border-black/5 pt-5">
                Per the National Association of Realtors settlement (August 2024),
                commission rates are fully negotiable between brokers and their clients.
                Compensation is not fixed by any industry standard.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            8. FAQ ACCORDION
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 bg-[#F8F7F4]" aria-label="Frequently Asked Questions about selling">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3 gold-glow-text">Common Questions</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                Frequently Asked Questions
              </h2>
            </div>
            <div className="space-y-2 max-w-3xl mx-auto">
              {FAQS.map((faq, i) => (
                <details key={i} className="group glass-card rounded-3xl">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer px-6 py-5 text-sm sm:text-base font-medium text-brand-dark select-none">
                    {faq.question}
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-brand-dark/40 group-open:rotate-45 transition-transform text-lg"
                    >
                      +
                    </span>
                  </summary>
                  <div className="px-6 pb-5 text-sm sm:text-base text-brand-dark/60 leading-relaxed">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            9. TESTIMONIALS
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32 lg:py-40">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-16 md:mb-20">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3 gold-glow-text">Client Reviews</p>
              <div className="flex items-center justify-center gap-3 mb-4">
                <span className="text-brand-gold font-bold text-sm">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                <span className="text-[12px] font-light text-brand-dark/50">5.0 &middot; 13 reviews on</span>
                <span className="text-[11px] font-semibold bg-brand-dark text-white px-2.5 py-0.5 rounded-full">Zillow</span>
              </div>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                What Our Sellers Say
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-7 md:gap-8">
              {SELLER_REVIEWS.map((review) => (
                <div key={review.author} className="btn-liquid rev-card bg-white rounded-3xl p-8 md:p-9">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="text-brand-gold text-sm font-bold">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                    <span className="text-[9px] font-semibold bg-brand-dark text-white px-2 py-0.5 rounded-full">Verified</span>
                  </div>
                  <p className="text-[15px] text-brand-dark/70 font-light leading-[1.8] mb-8">
                    &ldquo;{review.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.12), rgba(184,134,11,0.04))' }}
                    >
                      <span className="font-display font-bold text-[11px] text-brand-gold-deep">
                        {getInitials(review.author)}
                      </span>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-brand-dark">{review.author}</p>
                      <p className="text-brand-dark/40 text-[12px] font-extralight">{review.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-12">
              <a
                href={ZILLOW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-medium text-brand-dark/40 hover:text-brand-gold transition-colors"
              >
                Read all 13 reviews &rarr;
              </a>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            10. CTA — Cinematic final push
            ═══════════════════════════════════════════════ */}
        <section className="relative py-24 md:py-36 overflow-hidden">
          <div className="absolute inset-0 liquid-img">
            <Image
              src="https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=80&auto=format&fit=crop"
              alt="Luxury New York City apartment interior"
              fill
              className="object-cover"
              sizes="100vw"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/70" />
          </div>
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-4">Let&apos;s Talk</p>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-white mb-6">
              Ready to Sell?
            </h2>
            <p className="text-white/50 text-[15px] font-extralight max-w-lg mx-auto mb-10 leading-relaxed">
              Get a free, no-obligation market analysis and learn what your property
              could sell for in today&apos;s market.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#valuation"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep text-sm tracking-wide"
              >
                Get Your Free Valuation
              </a>
              <a
                href="tel:+16462584460"
                className="btn-liquid inline-block px-10 py-4 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 text-sm tracking-wide"
              >
                Call (646) 258-4460
              </a>
            </div>
          </div>
        </section>
      </main>
      <SocialShareBar title="Sell Your Property | Mallan Real Estate" />
      <Footer />
    </div>
  );
}
