import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import HomeValueWidget from '@/app/components/HomeValueWidget';
import SellerClosingCostCalculator from '@/app/components/SellerClosingCostCalculator';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Sell Your NYC Townhouse | Brownstone & Townhouse Specialists | Mallan Real Estate',
  description:
    'Sell your NYC townhouse or brownstone with experts who understand landmark regulations, FAR potential, multi-unit income, and the unique value of your property. Free CMA.',
  alternates: { canonical: 'https://mallan.nyc/sell/townhouses' },
  keywords: [
    'sell townhouse NYC',
    'sell brownstone NYC',
    'NYC townhouse value',
    'brownstone CMA',
    'sell limestone townhouse',
    'NYC townhouse broker',
    'Upper East Side townhouse',
    'Brooklyn brownstone',
    'Harlem townhouse',
    'West Village townhouse',
    'townhouse market analysis',
  ],
  openGraph: {
    title: 'Sell Your NYC Townhouse | Mallan Real Estate',
    description:
      'Expert guidance for townhouse and brownstone sellers. Free market analysis, landmark expertise, and maximum exposure.',
    url: 'https://mallan.nyc/sell/townhouses',
  },
};

const townhouseFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much is my NYC townhouse worth?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NYC townhouse values depend on location, lot size, FAR (Floor Area Ratio), condition, landmark status, and rental income potential. Brownstones in prime neighborhoods like the Upper East Side, West Village, and Brooklyn Heights can range from $3M to over $30M. Request a free CMA for a building-specific valuation.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does landmark status affect my townhouse sale?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Properties in NYC Landmark Preservation Commission (LPC) designated historic districts have restrictions on exterior modifications, which can affect buyer plans for renovation. However, landmark status also preserves neighborhood character and can be a selling point for buyers seeking historic properties. We advise on how to position landmark status as an asset.',
      },
    },
    {
      '@type': 'Question',
      name: 'Should I sell my townhouse as a single-family or multi-family?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'It depends on the current configuration, zoning, and market demand. Multi-family townhouses (2-4 units) appeal to investors and owner-occupants seeking rental income. Single-family conversions appeal to end-users wanting a full-house experience. We analyze both scenarios to determine which configuration maximizes your sale price.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is FAR and how does it affect my townhouse value?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'FAR (Floor Area Ratio) determines how much buildable square footage is allowed on your lot. If your townhouse has unused FAR (air rights), it can significantly increase property value because buyers can expand upward or outward. We calculate your available FAR and factor it into your valuation.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are the closing costs for selling a townhouse in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Townhouse sellers pay NYC and NYS transfer taxes (1.4-1.825% depending on price), broker commission (negotiable), attorney fees ($3,000-$7,500 for townhouses due to complexity), and potentially a mansion tax transfer (if over $1M). Unlike co-ops, there is no flip tax or board approval process. Total closing costs are typically 7-9% of the sale price.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does it take to sell a townhouse in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NYC townhouses typically take 4-8 months from listing to closing. Well-priced properties in prime neighborhoods can sell faster. The townhouse market has a smaller but more serious buyer pool compared to condos — buyers tend to be highly qualified and motivated. There is no board approval process, which can save 2-3 months versus co-op sales.',
      },
    },
  ],
};

const TOWNHOUSE_FAQS = [
  {
    question: 'How much is my NYC townhouse worth?',
    answer:
      'NYC townhouse values depend on location, lot size, FAR (Floor Area Ratio), condition, landmark status, and rental income potential. Brownstones in prime neighborhoods can range from $3M to over $30M. Request a free CMA for a building-specific valuation.',
  },
  {
    question: 'Does landmark status affect my townhouse sale?',
    answer:
      'Properties in LPC designated historic districts have restrictions on exterior modifications, which can affect buyer renovation plans. However, landmark status preserves neighborhood character and can be a strong selling point. We advise on how to position it as an asset.',
  },
  {
    question: 'Should I sell as single-family or multi-family?',
    answer:
      'It depends on configuration, zoning, and demand. Multi-family (2-4 units) appeals to investors and owner-occupants seeking rental income. Single-family appeals to end-users wanting the full-house experience. We analyze both scenarios to maximize your price.',
  },
  {
    question: 'What is FAR and how does it affect my value?',
    answer:
      'FAR (Floor Area Ratio) determines buildable square footage on your lot. Unused FAR (air rights) can significantly increase value because buyers can expand. We calculate your available FAR and factor it into your valuation.',
  },
  {
    question: 'What are the closing costs for townhouses?',
    answer:
      'Sellers pay transfer taxes (1.4-1.825%), broker commission (negotiable), and attorney fees ($3K-$7.5K). Unlike co-ops, there is no flip tax or board approval. Total costs are typically 7-9% of sale price.',
  },
  {
    question: 'How long does it take to sell a townhouse?',
    answer:
      'NYC townhouses typically take 4-8 months from listing to closing. The buyer pool is smaller but more serious and highly qualified. No board approval saves 2-3 months versus co-op sales.',
  },
];

const VALUE_DRIVERS = [
  {
    title: 'Location & Block',
    description:
      'Tree-lined vs. commercial, proximity to parks and transit, block character and neighbor quality.',
    icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    title: 'Lot Size & FAR',
    description:
      'Total lot dimensions, unused FAR (air rights), and development or expansion potential.',
    icon: 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15',
  },
  {
    title: 'Condition & Renovation',
    description:
      'Original details preserved, quality of renovation, mechanical systems, roof condition.',
    icon: 'M11.42 15.17l-5.658-5.66a2.121 2.121 0 113-3l5.657 5.657M18 12.75h.008v.008H18V12.75zM21.75 12a9.75 9.75 0 11-19.5 0 9.75 9.75 0 0119.5 0z',
  },
  {
    title: 'Outdoor Space',
    description:
      'Private garden, backyard depth, roof deck potential, front stoop condition and character.',
    icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z',
  },
  {
    title: 'Rental Income',
    description:
      'Current or potential rental income from additional units, garden apartments, or professional space.',
    icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  },
  {
    title: 'Landmark & Historic Status',
    description:
      'LPC designation, historic district location, architectural style (brownstone, limestone, Federal, Greek Revival).',
    icon: 'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z',
  },
];

const NEIGHBORHOODS = [
  { name: 'Upper East Side', borough: 'Manhattan', style: 'Limestone & brownstone townhouses' },
  { name: 'Upper West Side', borough: 'Manhattan', style: 'Brownstone row houses' },
  { name: 'West Village', borough: 'Manhattan', style: 'Federal & Greek Revival' },
  { name: 'Greenwich Village', borough: 'Manhattan', style: 'Historic brownstones' },
  { name: 'Chelsea', borough: 'Manhattan', style: 'Row houses & carriage houses' },
  { name: 'Harlem', borough: 'Manhattan', style: 'Brownstone renaissance' },
  { name: 'Brooklyn Heights', borough: 'Brooklyn', style: 'Landmarked brownstones' },
  { name: 'Park Slope', borough: 'Brooklyn', style: 'Victorian brownstones' },
  { name: 'Carroll Gardens', borough: 'Brooklyn', style: 'Wide-stoop brownstones' },
  { name: 'Bed-Stuy', borough: 'Brooklyn', style: 'Renaissance Revival' },
  { name: 'Fort Greene', borough: 'Brooklyn', style: 'Historic row houses' },
  { name: 'Prospect Heights', borough: 'Brooklyn', style: 'Restored brownstones' },
];

const SELLING_ADVANTAGES = [
  {
    title: 'No Board Approval',
    description: 'Unlike co-ops, townhouse sales close without board interviews, financial scrutiny, or approval delays. Your buyer pool is wider and your timeline is shorter.',
  },
  {
    title: 'No Flip Tax',
    description: 'Townhouse sales are exempt from co-op flip taxes (which can be 1-3% of the sale price). More of your proceeds stay in your pocket.',
  },
  {
    title: 'Full Control',
    description: 'You own the land, the building, and the air rights. No managing agent, no maintenance increases, no special assessments from a board.',
  },
  {
    title: 'Development Potential',
    description: 'Unused FAR, lot assembly opportunities, and conversion potential (SRO, multi-family, single-family) all add premium value.',
  },
];

export default function TownhouseSellerPage() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(townhouseFaqSchema) }}
      />

      <main>
        {/* ═══════════════════════════════════════════════
            1. HERO
            ═══════════════════════════════════════════════ */}
        <section className="relative h-screen min-h-[600px] max-h-[900px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1600&q=80&auto=format&fit=crop"
              alt="Classic NYC brownstone townhouse with stoop and tree-lined street"
              fill
              className="object-cover"
              style={{ objectPosition: 'center 30%' }}
              priority
              sizes="100vw"
              quality={90}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/75" />
          </div>
          <div className="relative z-10 text-center text-white px-6 pt-20 max-w-4xl">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-6">
              Townhouse & Brownstone Specialists
            </p>
            <h1
              className="font-display font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1.02] mb-6"
              style={{ textShadow: '0 4px 40px rgba(0,0,0,0.2)' }}
            >
              Your Townhouse<br />Deserves an Expert
            </h1>
            <p className="text-white/80 text-base md:text-lg font-light max-w-xl mx-auto mb-12 leading-relaxed">
              Selling a townhouse isn&apos;t like selling a condo. It takes someone
              who understands land value, FAR, landmark rules, and the buyers
              who appreciate what you have.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#valuation"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold hover:bg-brand-gold-deep text-white font-medium rounded-full text-sm tracking-wide"
              >
                Get Your Free Townhouse CMA
              </a>
              <a
                href="tel:+16462584460"
                className="btn-liquid inline-block px-10 py-4 border border-white/25 text-white font-medium rounded-full hover:bg-white/10 text-sm tracking-wide"
              >
                Call (646) 258-4460
              </a>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            2. WHY TOWNHOUSES ARE DIFFERENT
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-14 md:mb-20">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Why It Matters
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark leading-tight">
                A Townhouse Isn&apos;t Just a Home.<br className="hidden md:block" />
                It&apos;s Land, Air Rights, and Legacy.
              </h2>
              <p className="mt-6 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto leading-relaxed">
                Townhouse valuations require understanding factors that don&apos;t apply
                to apartments &mdash; lot size, FAR, landmark status, rental income,
                and development potential. A generic CMA won&apos;t do.
              </p>
            </div>

            {/* Value Drivers Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {VALUE_DRIVERS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl p-6 border border-black/[0.04] hover:shadow-md transition-shadow"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(184,134,11,0.03), rgba(255,255,255,0.8))',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(184,134,11,0.15), rgba(184,134,11,0.05))',
                    }}
                  >
                    <svg
                      className="w-5 h-5 text-brand-gold-deep"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d={item.icon}
                      />
                    </svg>
                  </div>
                  <h3 className="font-display font-semibold text-[15px] text-brand-dark mb-2">
                    {item.title}
                  </h3>
                  <p className="text-brand-dark/60 text-[13px] font-light leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            3. TOWNHOUSE SELLER ADVANTAGES
            ═══════════════════════════════════════════════ */}
        <section className="relative overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80&auto=format&fit=crop"
            alt="Elegant townhouse interior with original details"
            fill
            className="object-cover"
            sizes="100vw"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />

          <div className="relative z-10 max-w-[1440px] mx-auto px-6 md:px-12 lg:px-20 py-20 md:py-28">
            <div className="max-w-2xl">
              <p className="text-brand-gold text-[11px] font-medium tracking-[0.2em] uppercase mb-4">
                Selling Advantages
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-white leading-tight mb-10">
                Why Townhouse Sellers<br />Have the Upper Hand
              </h2>
              <div className="space-y-6">
                {SELLING_ADVANTAGES.map((adv) => (
                  <div
                    key={adv.title}
                    className="rounded-2xl p-6"
                    style={{
                      background: 'rgba(30,30,30,0.55)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <h3 className="font-display font-semibold text-[15px] text-brand-gold mb-2">
                      {adv.title}
                    </h3>
                    <p className="text-white/70 text-[13px] font-light leading-relaxed">
                      {adv.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            4. NEIGHBORHOODS WE SERVE
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Neighborhood Expertise
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                NYC&apos;s Premier Townhouse Neighborhoods
              </h2>
              <p className="mt-4 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto">
                We specialize in the neighborhoods where townhouses define the streetscape.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {NEIGHBORHOODS.map((n) => (
                <Link
                  key={n.name}
                  href={`/${n.borough.toLowerCase().replace(' ', '-')}`}
                  className="group rounded-2xl p-5 border border-black/[0.04] hover:border-brand-gold/20 hover:shadow-md transition-all"
                >
                  <p className="font-display font-semibold text-brand-dark group-hover:text-brand-gold-deep transition-colors">
                    {n.name}
                  </p>
                  <p className="text-[12px] text-brand-dark/40 mt-0.5">{n.borough}</p>
                  <p className="text-[12px] text-brand-dark/60 mt-2 font-light">{n.style}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            5. VALUATION FORM
            ═══════════════════════════════════════════════ */}
        <section id="valuation" className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-10">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Free Analysis
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark mb-4">
                What&apos;s Your Townhouse Worth?
              </h2>
              <p className="text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto leading-relaxed">
                Get a detailed Comparative Market Analysis built specifically for townhouses &mdash;
                including FAR analysis, rental income potential, and recent comparable sales.
              </p>
            </div>
            <HomeValueWidget />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            6. YOUR CMA INCLUDES (TOWNHOUSE-SPECIFIC)
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-dark">
                Your Townhouse CMA Includes
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                {
                  title: 'Comparable Townhouse Sales',
                  description:
                    'Recent sales of similar townhouses — by width, depth, stories, condition, and neighborhood. Not generic apartment comps.',
                },
                {
                  title: 'FAR & Air Rights Analysis',
                  description:
                    'Your current built FAR vs. allowable FAR. Unused air rights can add significant value for expansion-minded buyers.',
                },
                {
                  title: 'Rental Income Projection',
                  description:
                    'If your townhouse has multiple units, we project rental income and cap rate to attract investor buyers.',
                },
                {
                  title: 'Landmark & Zoning Review',
                  description:
                    'LPC district status, zoning overlay, and any restrictions or opportunities that affect marketability.',
                },
                {
                  title: 'Net Proceeds Estimate',
                  description:
                    'Detailed breakdown of closing costs, transfer taxes, and estimated net proceeds at your recommended price.',
                },
                {
                  title: 'Marketing Strategy',
                  description:
                    'Tailored plan: professional photography, architectural details highlighted, targeted buyer outreach, and syndication across 10+ platforms.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl p-6 border border-black/[0.04]"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(184,134,11,0.02), rgba(255,255,255,0.9))',
                  }}
                >
                  <h3 className="font-display font-semibold text-[15px] text-brand-dark mb-2">
                    {item.title}
                  </h3>
                  <p className="text-brand-dark/60 text-[13px] font-light leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            7. CLOSING COST CALCULATOR
            ═══════════════════════════════════════════════ */}
        <section className="py-12 px-4 bg-[#F8F7F4]">
          <div className="max-w-xl mx-auto">
            <SellerClosingCostCalculator />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            8. FAQ
            ═══════════════════════════════════════════════ */}
        <section
          className="px-6 md:px-12 lg:px-20 py-20 md:py-28"
          aria-label="Frequently Asked Questions about selling townhouses"
        >
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Common Questions
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                Townhouse Seller FAQ
              </h2>
            </div>
            <div className="space-y-2 max-w-3xl mx-auto">
              {TOWNHOUSE_FAQS.map((faq, i) => (
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
            9. TRACK RECORD
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-16 md:py-20 bg-[#F8F7F4]">
          <div className="max-w-[1440px] mx-auto text-center">
            <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
              Proven Results
            </p>
            <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-dark mb-4">
              See Our Closed Deals
            </h2>
            <p className="text-brand-dark/60 text-[15px] font-light max-w-lg mx-auto mb-8">
              Our track record speaks for itself. View every transaction across NYC.
            </p>
            <Link
              href="/results"
              className="inline-block px-8 py-3.5 bg-brand-dark text-white font-medium rounded-full hover:bg-brand-dark/90 text-sm tracking-wide transition-colors"
            >
              View Our Track Record &rarr;
            </Link>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            10. FINAL CTA
            ═══════════════════════════════════════════════ */}
        <section className="relative py-24 md:py-36 overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop"
              alt="Beautiful NYC brownstone exterior"
              fill
              className="object-cover"
              sizes="100vw"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/70" />
          </div>
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-4">
              Let&apos;s Talk
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-white mb-6">
              Ready to Sell Your Townhouse?
            </h2>
            <p className="text-white/70 text-[15px] font-light max-w-lg mx-auto mb-10 leading-relaxed">
              Get a free, no-obligation market analysis built specifically for your
              townhouse. See comparable sales, FAR potential, and what your property
              could sell for today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#valuation"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep text-sm tracking-wide"
              >
                Get Your Free Townhouse CMA
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
    </div>
  );
}
