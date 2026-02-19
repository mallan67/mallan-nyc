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

const SYNDICATION_GROUPS = [
  {
    heading: 'REBNY RLS Network',
    description: 'NYC\u2019s official broker listing database \u2014 visible to 570+ participating firms and 30,000+ agents.',
    platforms: [
      { name: 'REBNY RLS', detail: '570+ firms, 30,000+ agents' },
      { name: '30 IDX Partner Brokerages', detail: 'Full IDX display on all participating brokerage websites' },
    ],
  },
  {
    heading: 'Consumer Portals',
    description: 'Direct data licensees and syndication partners \u2014 your listing appears automatically.',
    platforms: [
      { name: 'StreetEasy', detail: 'NYC\u2019s #1 property search \u2014 direct upload, sales free' },
      { name: 'Zillow + Trulia', detail: 'Auto-syncs from StreetEasy within 24 hours' },
      { name: 'Realtor.com', detail: 'Direct REBNY data license \u2014 automatic' },
      { name: 'Redfin', detail: 'Direct REBNY data license \u2014 automatic' },
      { name: 'Homes.com', detail: 'Direct REBNY data license \u2014 automatic' },
    ],
  },
  {
    heading: 'Direct Marketing',
    description: 'Beyond syndication, targeted campaigns to qualified buyers.',
    platforms: [
      { name: 'mallan.nyc', detail: 'Featured with professional photography' },
      { name: 'Social + Email', detail: 'Targeted campaigns to our buyer database' },
      { name: 'openigloo, Samaki, TBI', detail: 'Trestle IDX Plus opt-in portals \u2014 all opted IN' },
    ],
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
    description: 'We meet to discuss your goals, timeline, and assess your property. You\u2019ll receive a comprehensive market analysis.',
  },
  {
    step: '02',
    title: 'Preparation',
    description: 'We recommend staging, repairs, and improvements to maximize your property\u2019s appeal. Professional photography and materials are prepared.',
  },
  {
    step: '03',
    title: 'Marketing',
    description: 'Your property is listed across all major platforms and marketed to our network of buyers and brokers.',
  },
  {
    step: '04',
    title: 'Showings & Offers',
    description: 'We manage all showings and present offers for your review. Our team guides you through negotiations.',
  },
  {
    step: '05',
    title: 'Closing',
    description: 'We coordinate with attorneys, buyers, and all parties to ensure a smooth closing process.',
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
            1. HERO — Full-viewport with editorial presence
            ═══════════════════════════════════════════════ */}
        <section className="relative h-screen min-h-[600px] flex items-center justify-center">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1600&q=80&auto=format&fit=crop"
              alt="Manhattan skyline view from luxury high-rise"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 hero-gradient" />
          </div>
          <div className="relative z-10 text-center text-white px-6 pt-20 max-w-4xl">
            <h1 className="font-display font-bold text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05] mb-6">
              Sell Your Property
            </h1>
            <p className="text-white/70 text-sm md:text-base font-light max-w-lg mx-auto mb-10 tracking-wide">
              Whether you&apos;re selling a co-op, condo, or townhouse &mdash; we deliver
              results across all five boroughs.
            </p>
            <a
              href="#valuation"
              className="btn-liquid inline-block px-10 py-4 bg-brand-gold hover:bg-brand-gold-deep text-white font-medium rounded-full text-sm tracking-wide transition-colors"
            >
              Get Your Free Valuation
            </a>
            {/* Stat row */}
            <div className="flex items-center justify-center gap-8 md:gap-12 mt-14">
              <div className="text-center">
                <p className="font-display font-bold text-white text-2xl md:text-3xl" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.1)' }}>5</p>
                <p className="text-white/60 text-[11px] font-light tracking-wider mt-1">Boroughs</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="font-display font-bold text-white text-2xl md:text-3xl" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.1)' }}>5.0</p>
                <p className="text-white/60 text-[11px] font-light tracking-wider mt-1">Zillow Rating</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="font-display font-bold text-white text-2xl md:text-3xl" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.1)' }}>RLS</p>
                <p className="text-white/60 text-[11px] font-light tracking-wider mt-1">REBNY Member</p>
              </div>
            </div>
          </div>
          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
            <div className="w-6 h-10 border border-white/20 rounded-full flex justify-center pt-2.5">
              <div className="w-1 h-2 bg-white/50 rounded-full animate-bounce" />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            2. VALUATION FORM — Editorial 2-column
            ═══════════════════════════════════════════════ */}
        <section id="valuation" className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 md:gap-28 items-center">
            {/* Left column */}
            <div>
              <p className="text-brand-gold-deep text-[13px] font-medium mb-3 gold-glow-text">Free Valuation</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight mb-6 leading-snug text-brand-dark">
                What&apos;s Your Property Worth?
              </h2>
              <p className="text-brand-dark/40 text-[15px] font-extralight leading-[2] mb-10">
                Get a free property valuation from a licensed NYC broker.
                We&apos;ll evaluate your property and neighborhood to give you an
                accurate price range based on current market data and comparable sales.
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
                  <p className="text-brand-dark/30 text-[12px] font-extralight">Founder &middot; Licensed NYC Broker</p>
                </div>
              </div>
            </div>
            {/* Right column — form */}
            <div>
              <CMARequestForm />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            3. WHY SELL WITH US — 3-column with gold label
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Our Approach</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                Why Sell With Us
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-7 md:gap-8">
              <div className="glass-card rounded-3xl p-8 text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.1), rgba(184,134,11,0.03))' }}
                >
                  <svg className="w-7 h-7 text-brand-gold-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-display font-semibold text-xl text-brand-dark mb-3">Competitive Pricing</h3>
                <p className="text-brand-dark/40 text-[14px] font-extralight leading-relaxed">
                  Data-driven pricing strategies to maximize your return while ensuring
                  a timely sale.
                </p>
              </div>
              <div className="glass-card rounded-3xl p-8 text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.1), rgba(184,134,11,0.03))' }}
                >
                  <svg className="w-7 h-7 text-brand-gold-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="font-display font-semibold text-xl text-brand-dark mb-3">Professional Marketing</h3>
                <p className="text-brand-dark/40 text-[14px] font-extralight leading-relaxed">
                  High-quality photography, virtual tours, and targeted advertising
                  to showcase your property.
                </p>
              </div>
              <div className="glass-card rounded-3xl p-8 text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.1), rgba(184,134,11,0.03))' }}
                >
                  <svg className="w-7 h-7 text-brand-gold-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="font-display font-semibold text-xl text-brand-dark mb-3">Expert Negotiation</h3>
                <p className="text-brand-dark/40 text-[14px] font-extralight leading-relaxed">
                  Skilled negotiators who advocate for your interests and secure
                  the best possible terms.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            4. DARK SECTION — Maximum Exposure (syndication)
            ═══════════════════════════════════════════════ */}
        <section className="bg-brand-dark text-white px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold text-[13px] font-medium mb-2">Distribution</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-white">
                Your Listing, Maximum Exposure
              </h2>
              <p className="mt-4 text-white/40 text-[15px] font-extralight max-w-2xl mx-auto leading-relaxed">
                Every listing is distributed across NYC&apos;s entire brokerage ecosystem and all major consumer portals &mdash; all included.
              </p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-4 md:gap-6 mb-16 max-w-3xl mx-auto">
              <div className="bg-white/5 rounded-2xl p-6 text-center">
                <p className="font-display font-bold text-2xl md:text-3xl text-white">570+</p>
                <p className="text-white/50 text-[11px] font-light tracking-wider mt-1">Firms</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-6 text-center">
                <p className="font-display font-bold text-2xl md:text-3xl text-white">30</p>
                <p className="text-white/50 text-[11px] font-light tracking-wider mt-1">IDX Brokerages</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-6 text-center">
                <p className="font-display font-bold text-2xl md:text-3xl text-white">10+</p>
                <p className="text-white/50 text-[11px] font-light tracking-wider mt-1">Consumer Portals</p>
              </div>
            </div>

            {/* Platform groups */}
            <div className="grid md:grid-cols-3 gap-10 md:gap-12">
              {SYNDICATION_GROUPS.map((group) => (
                <div key={group.heading}>
                  <h3 className="font-display font-semibold text-sm text-white mb-1">{group.heading}</h3>
                  <p className="text-white/40 text-[12px] font-extralight mb-4 leading-relaxed">{group.description}</p>
                  <ul className="space-y-2.5">
                    {group.platforms.map((platform) => (
                      <li key={platform.name} className="flex items-start gap-3">
                        <svg className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <div>
                          <p className="text-white text-sm font-light">{platform.name}</p>
                          <p className="text-white/30 text-[11px] font-extralight">{platform.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="text-white/20 text-[11px] text-center mt-14 max-w-3xl mx-auto leading-relaxed">
              REBNY RLS syndication is automatic when IDX display is enabled (our default).
              StreetEasy listings are uploaded directly &mdash; sales are free, rentals start at $7/day.
              Direct Data Licensees receive listings automatically via their own REBNY data license agreements.
            </p>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            5. SELLING PROCESS — Horizontal timeline
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">The Process</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                How It Works
              </h2>
            </div>

            {/* Desktop: horizontal timeline */}
            <div className="hidden lg:block">
              {/* Connecting line */}
              <div className="relative">
                <div className="absolute top-6 left-[10%] right-[10%] h-px bg-brand-gold/20" />
                <div className="grid grid-cols-5 gap-6">
                  {SELLING_STEPS.map((item) => (
                    <div key={item.step} className="flex flex-col items-center text-center">
                      <div className="relative z-10 w-12 h-12 rounded-full bg-brand-gold text-white flex items-center justify-center font-semibold text-sm mb-5">
                        {item.step}
                      </div>
                      <h3 className="font-display font-semibold text-base text-brand-dark mb-2">{item.title}</h3>
                      <p className="text-brand-dark/40 text-[13px] font-extralight leading-relaxed">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile/Tablet: vertical stack */}
            <div className="lg:hidden space-y-4">
              {SELLING_STEPS.map((item) => (
                <div key={item.step} className="glass-card rounded-2xl p-6 flex gap-5">
                  <div className="flex-shrink-0">
                    <span className="w-12 h-12 rounded-full bg-brand-gold text-white flex items-center justify-center font-semibold text-sm">
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
            6. CLOSING COST CALCULATOR — Keep as-is
            ═══════════════════════════════════════════════ */}
        <section className="py-12 px-4">
          <div className="max-w-xl mx-auto">
            <SellerClosingCostCalculator />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            7. COMMISSION TRANSPARENCY — Wider with gold label
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Transparency</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                Commission Transparency
              </h2>
            </div>
            <div className="glass-card rounded-3xl p-8 md:p-10 max-w-3xl mx-auto">
              <p className="text-brand-dark/40 text-[15px] font-extralight leading-[2] mb-8">
                At Mallan Real Estate, we believe in full transparency about costs.
                You should never be surprised by fees when selling your property.
              </p>
              <ul className="space-y-4 mb-8">
                {[
                  'Commission rates are not set by law and are fully negotiable',
                  'We discuss all fees upfront before you sign anything',
                  'No hidden costs \u2014 you\u2019ll know exactly what you\u2019re paying',
                  'Seller closing cost calculator above gives you a detailed estimate',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-brand-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-brand-dark/40 text-[14px] font-extralight">{point}</span>
                  </li>
                ))}
              </ul>
              <p className="text-brand-dark/25 text-[12px] font-extralight border-t border-black/5 pt-4">
                Per the National Association of Realtors settlement (August 2024),
                commission rates are fully negotiable between brokers and their clients.
                Compensation is not fixed by any industry standard.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            8. FAQ ACCORDION — Gold label
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32" aria-label="Frequently Asked Questions about selling">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Common Questions</p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                Frequently Asked Questions
              </h2>
            </div>
            <div className="space-y-2 max-w-3xl mx-auto">
              {FAQS.map((faq, i) => (
                <details key={i} className="group glass-card rounded-3xl">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer px-5 py-4 text-sm sm:text-base font-medium text-brand-dark select-none">
                    {faq.question}
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-brand-dark/40 group-open:rotate-45 transition-transform text-lg"
                    >
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-4 text-sm sm:text-base text-brand-dark/60 leading-relaxed">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            9. TESTIMONIALS — Gold label
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium mb-2 gold-glow-text">Client Reviews</p>
              <div className="flex items-center justify-center gap-3 mb-3">
                <span className="text-brand-gold font-bold text-sm">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
                <span className="text-[12px] font-light text-brand-dark/60">5.0 &middot; 13 reviews on</span>
                <span className="text-[11px] font-semibold bg-brand-dark text-white px-2.5 py-0.5 rounded-full">Zillow</span>
              </div>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                What Sellers Say
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-7 md:gap-8">
              {SELLER_REVIEWS.map((review) => (
                <div key={review.author} className="rev-card bg-white rounded-3xl p-7">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-brand-gold text-sm font-bold">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
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
            <div className="text-center mt-10">
              <a
                href={ZILLOW_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-medium text-brand-dark/50 hover:text-brand-gold transition-colors"
              >
                Read all 13 reviews &rarr;
              </a>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            10. CTA — Keep as-is
            ═══════════════════════════════════════════════ */}
        <section className="py-20 md:py-32 bg-brand-dark text-white">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight mb-6">
              Ready to Sell?
            </h2>
            <p className="text-white/40 text-[15px] font-extralight max-w-lg mx-auto mb-10">
              Get a free, no-obligation market analysis and learn what your property
              could sell for in today&apos;s market.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/sign-up?role=seller"
                className="btn-liquid inline-block px-8 py-3.5 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm"
              >
                Get Started
              </Link>
              <Link
                href="/agents"
                className="inline-block px-8 py-3.5 bg-white text-brand-dark font-medium rounded-full hover:bg-white/90 transition-colors text-sm"
              >
                Contact an Agent
              </Link>
              <a
                href="tel:+16462584460"
                className="inline-block px-8 py-3.5 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 transition-colors text-sm"
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
