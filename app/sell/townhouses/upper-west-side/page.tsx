import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import HomeValueWidget from '@/app/components/HomeValueWidget';

export const revalidate = 86400;

export const metadata: Metadata = {
  title:
    'Sell Your Upper West Side Townhouse | UWS Brownstone Specialist | Mallan Real Estate',
  description:
    'Sell your Upper West Side townhouse or brownstone with a broker who has personally closed UWS townhouse deals. Free CMA with FAR analysis, landmark review, and comparable townhouse sales.',
  alternates: { canonical: 'https://mallan.nyc/sell/townhouses/upper-west-side' },
  keywords: [
    'sell townhouse Upper West Side',
    'sell brownstone UWS',
    'Upper West Side townhouse value',
    'UWS brownstone CMA',
    'sell townhouse West End Avenue',
    'sell brownstone Riverside Drive',
    'Upper West Side townhouse broker',
    'UWS townhouse market',
    'sell rowhouse Upper West Side',
    'West 70s townhouse',
    'West 80s brownstone',
  ],
  openGraph: {
    title: 'Sell Your Upper West Side Townhouse | Mallan Real Estate',
    description:
      'UWS townhouse specialist with proven sales record. Free townhouse-specific CMA with FAR analysis and comparable sales.',
    url: 'https://mallan.nyc/sell/townhouses/upper-west-side',
  },
};

const uwsFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much is my Upper West Side townhouse worth?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Upper West Side townhouses typically range from $4M to $20M+ depending on width, lot size, condition, block, and landmark status. A 20-foot-wide brownstone in good condition on a prime block between 70th and 90th can command $6M-$12M. Wider lots (25ft+) and corner properties command significant premiums. Request a free CMA for your specific property.',
      },
    },
    {
      '@type': 'Question',
      name: 'What streets are most desirable for UWS townhouses?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The most desirable townhouse blocks on the Upper West Side are in the West 70s and 80s between Columbus Avenue and Riverside Drive. West End Avenue and the cross streets in the low 70s-80s have the highest concentration of well-preserved brownstones. The Riverside-West End Historic District (West 80s-90s) contains some of the finest examples.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is my UWS townhouse in a landmark district?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Many UWS townhouses are within LPC-designated historic districts including the Riverside-West End Historic District, the Upper West Side/Central Park West Historic District, and the West End-Collegiate Historic District. Landmark status restricts exterior modifications but preserves property values by maintaining neighborhood character. We include a full landmark analysis in your CMA.',
      },
    },
    {
      '@type': 'Question',
      name: 'Should I sell my UWS townhouse as single-family or keep it multi-unit?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'On the Upper West Side, both configurations have strong markets. Single-family conversions appeal to families seeking full-floor living near Central Park and top schools like Trinity. Multi-unit (2-4 family) appeals to investors and owner-occupants who want rental income to offset carrying costs. We model both scenarios to recommend the best strategy.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does it take to sell a townhouse on the Upper West Side?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'UWS townhouses typically sell within 3-6 months when priced correctly. The buyer pool is highly qualified — typically families, investors, or developers. Spring (March-June) is the strongest selling season. Well-maintained brownstones on prime blocks can sell faster, especially if they offer garden-level income potential.',
      },
    },
    {
      '@type': 'Question',
      name: 'What renovations increase UWS townhouse value the most?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The highest-ROI renovations for UWS townhouses are: (1) kitchen and bathroom modernization while preserving period details, (2) garden-level apartment creation for rental income, (3) roof deck addition (where LPC permits), (4) mechanical system upgrades (HVAC, electrical, plumbing), and (5) rear extension to maximize living space within FAR limits.',
      },
    },
  ],
};

const FAQS = [
  {
    question: 'How much is my Upper West Side townhouse worth?',
    answer:
      'UWS townhouses typically range from $4M to $20M+ depending on width, lot size, condition, and block. A 20-foot-wide brownstone in good condition between 70th and 90th can command $6M-$12M. Request a free CMA for your specific property.',
  },
  {
    question: 'What streets are most desirable for UWS townhouses?',
    answer:
      'The West 70s and 80s between Columbus and Riverside Drive are the most sought-after. West End Avenue has the highest concentration of well-preserved brownstones. The Riverside-West End Historic District (80s-90s) contains some of the finest examples.',
  },
  {
    question: 'Is my townhouse in a landmark district?',
    answer:
      'Many UWS townhouses are within LPC districts including the Riverside-West End Historic District, Upper West Side/CPW Historic District, and West End-Collegiate Historic District. We include a full landmark analysis in your CMA.',
  },
  {
    question: 'Should I sell as single-family or multi-unit?',
    answer:
      'Both have strong UWS markets. Single-family appeals to families wanting full-floor living near Central Park and top schools. Multi-unit appeals to investors and owner-occupants who want rental income. We model both scenarios.',
  },
  {
    question: 'How long does it take to sell on the UWS?',
    answer:
      'UWS townhouses typically sell within 3-6 months when priced correctly. The buyer pool is highly qualified. Spring (March-June) is the strongest season. Well-maintained brownstones on prime blocks can sell faster.',
  },
  {
    question: 'What renovations increase value the most?',
    answer:
      'Highest ROI: kitchen/bath modernization preserving period details, garden-level apartment for rental income, roof deck (where LPC permits), mechanical upgrades, and rear extension within FAR limits.',
  },
];

const UWS_TOWNHOUSE_BLOCKS = [
  {
    area: 'West 70s',
    streets: '70th - 79th, Columbus to Riverside',
    character:
      'Prime brownstone blocks near the Natural History Museum. Tree-lined streets with high foot traffic. Walking distance to Central Park and Riverside Park.',
    appeal: 'Families, end-users, high walkability',
  },
  {
    area: 'West 80s',
    streets: '80th - 89th, Columbus to Riverside',
    character:
      'Heart of the UWS townhouse market. The Riverside-West End Historic District preserves exceptional row house architecture. Quieter blocks, excellent schools.',
    appeal: 'Families, long-term residents, preservation buyers',
  },
  {
    area: 'West 90s',
    streets: '90th - 99th, Columbus to Riverside',
    character:
      'Excellent value relative to blocks further south. Still within prime school districts. Proximity to Riverside Park, Joan of Arc Park, and the 96th Street Express stop.',
    appeal: 'Value buyers, investors, young families',
  },
  {
    area: 'West 100s-110s',
    streets: '100th - 110th, Columbus to Riverside',
    character:
      'Manhattan Valley and Morningside Heights. More affordable entry point with significant upside. Near Columbia University and Cathedral of St. John the Divine.',
    appeal: 'Investors, developers, Columbia affiliates',
  },
];

const HISTORIC_DISTRICTS = [
  {
    name: 'Riverside-West End Historic District',
    streets: 'West 80th to West 86th, Riverside Drive to West End Avenue',
    designated: '1989 (extensions I & II: 2013, 2014)',
    style: 'Renaissance Revival, Romanesque Revival, neo-Georgian brownstones and row houses',
  },
  {
    name: 'Upper West Side/Central Park West Historic District',
    streets: 'West 62nd to West 96th, Central Park West to Amsterdam',
    designated: '1990',
    style: 'Eclectic mix including Romanesque Revival, Queen Anne, and neo-Renaissance',
  },
  {
    name: 'West End-Collegiate Historic District',
    streets: 'West 74th to West 78th, West End Avenue to Riverside Drive',
    designated: '1984 (extension: 2009)',
    style: 'Flemish Renaissance, Romanesque Revival, neo-Georgian',
  },
  {
    name: 'Expanded Carnegie Hill / UWS Extension',
    streets: 'Select blocks in the 90s near Central Park West',
    designated: 'Various',
    style: 'Limestone and brownstone row houses',
  },
];

export default function UWSTownhousePage() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(uwsFaqSchema) }}
      />

      <main>
        {/* ═══════════════════════════════════════════════
            1. HERO
            ═══════════════════════════════════════════════ */}
        <section className="relative h-screen min-h-[600px] max-h-[900px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1539233487784-1a29074b0f57?w=1600&q=80&auto=format&fit=crop"
              alt="Tree-lined Upper West Side brownstone street with classic stoops"
              fill
              className="object-cover"
              style={{ objectPosition: 'center 40%' }}
              priority
              sizes="100vw"
              quality={90}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/75" />
          </div>
          <div className="relative z-10 text-center text-white px-6 pt-20 max-w-4xl">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-6">
              Upper West Side Townhouse Specialist
            </p>
            <h1
              className="font-display font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1.02] mb-6"
              style={{ textShadow: '0 4px 40px rgba(0,0,0,0.2)' }}
            >
              Sell Your UWS<br />Townhouse with<br />Someone Who Has
            </h1>
            <p className="text-white/80 text-base md:text-lg font-light max-w-xl mx-auto mb-12 leading-relaxed">
              We&apos;ve personally closed townhouse deals on the Upper West Side.
              We know every block, every landmark district, and exactly what
              UWS townhouse buyers are looking for.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#valuation"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold hover:bg-brand-gold-deep text-white font-medium rounded-full text-sm tracking-wide"
              >
                Get Your Free UWS Townhouse CMA
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
            2. WHY THE UWS IS SPECIAL FOR TOWNHOUSES
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="max-w-[1440px] mx-auto">
            <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-start">
              <div>
                <p className="text-brand-gold-deep text-[11px] font-medium tracking-[0.2em] uppercase mb-4">
                  The UWS Townhouse Market
                </p>
                <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-brand-dark leading-tight mb-6">
                  One of Manhattan&apos;s Last Great<br />Townhouse Neighborhoods
                </h2>
                <p className="text-brand-dark/60 text-[15px] font-light leading-[1.9] mb-6">
                  The Upper West Side is home to some of the finest brownstone blocks
                  in New York City. Stretching from Columbus Circle to Cathedral Parkway,
                  with Central Park on one side and Riverside Park on the other, UWS
                  townhouses offer something almost no other property type can &mdash;
                  a private house between two world-class parks.
                </p>
                <p className="text-brand-dark/60 text-[15px] font-light leading-[1.9] mb-6">
                  Buyers here are drawn by the tree-lined blocks, proximity to
                  top schools like Trinity and Collegiate, the cultural institutions
                  of Lincoln Center and the American Museum of Natural History, and
                  the intellectual, community-oriented atmosphere that has defined
                  the UWS for generations.
                </p>
                <p className="text-brand-dark/60 text-[15px] font-light leading-[1.9]">
                  Your townhouse isn&apos;t just a home. It&apos;s a piece of Manhattan
                  that someone will pay a premium to call their own. The right broker
                  knows how to communicate that value.
                </p>
              </div>
              <div className="space-y-4">
                {/* UWS quick stats */}
                <div className="rounded-2xl bg-[#F8F7F4] border border-black/[0.03] p-6">
                  <p className="text-[11px] font-semibold text-brand-dark/40 uppercase tracking-wider mb-4">
                    UWS Market Snapshot
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-2xl font-display font-bold text-brand-dark">$1,350</p>
                      <p className="text-[12px] text-brand-dark/50">Avg Price/SF</p>
                    </div>
                    <div>
                      <p className="text-2xl font-display font-bold text-brand-dark">72</p>
                      <p className="text-[12px] text-brand-dark/50">Avg Days on Market</p>
                    </div>
                    <div>
                      <p className="text-2xl font-display font-bold text-brand-dark">97</p>
                      <p className="text-[12px] text-brand-dark/50">Walk Score</p>
                    </div>
                    <div>
                      <p className="text-2xl font-display font-bold text-brand-dark">92</p>
                      <p className="text-[12px] text-brand-dark/50">Transit Score</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#F8F7F4] border border-black/[0.03] p-6">
                  <p className="text-[11px] font-semibold text-brand-dark/40 uppercase tracking-wider mb-3">
                    Subway Access
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['1', '2', '3', 'B', 'C'].map((line) => {
                      const colors: Record<string, string> = {
                        '1': 'bg-red-600',
                        '2': 'bg-red-600',
                        '3': 'bg-red-600',
                        B: 'bg-orange-500',
                        C: 'bg-blue-600',
                      };
                      return (
                        <span
                          key={line}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${colors[line]}`}
                        >
                          {line}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[12px] text-brand-dark/50 mt-2">
                    Express to Midtown in 10 min from 72nd St
                  </p>
                </div>
                <div className="rounded-2xl bg-[#F8F7F4] border border-black/[0.03] p-6">
                  <p className="text-[11px] font-semibold text-brand-dark/40 uppercase tracking-wider mb-3">
                    Why Buyers Choose UWS Townhouses
                  </p>
                  <ul className="space-y-2.5">
                    {[
                      'Dual park access — Central Park & Riverside Park',
                      'Top schools — Trinity, Collegiate, PS 87, PS 199',
                      'Cultural corridor — Lincoln Center, AMNH, NYHS',
                      'No board approval — close faster than co-ops',
                      'Rental income potential — garden-level apartments',
                      'Landmark character — irreplaceable architecture',
                    ].map((point) => (
                      <li key={point} className="flex items-start gap-2 text-[13px] text-brand-dark/70">
                        <svg
                          className="w-4 h-4 text-brand-gold shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            3. BLOCK-BY-BLOCK GUIDE
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Block-by-Block
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                UWS Townhouse Micro-Markets
              </h2>
              <p className="mt-4 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto">
                Not all UWS blocks are equal. Each micro-market has its own character,
                buyer profile, and pricing dynamics.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {UWS_TOWNHOUSE_BLOCKS.map((block) => (
                <div
                  key={block.area}
                  className="rounded-2xl bg-white p-6 md:p-8 border border-black/[0.04] hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
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
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-lg text-brand-dark">
                        {block.area}
                      </h3>
                      <p className="text-[12px] text-brand-dark/40">{block.streets}</p>
                    </div>
                  </div>
                  <p className="text-brand-dark/60 text-[13px] font-light leading-relaxed mb-3">
                    {block.character}
                  </p>
                  <p className="text-[12px]">
                    <span className="text-brand-dark/40">Primary appeal:</span>{' '}
                    <span className="text-brand-gold-deep font-medium">{block.appeal}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            4. LANDMARK DISTRICTS
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Landmark Districts
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-brand-dark">
                UWS Historic Districts That Protect Your Value
              </h2>
              <p className="mt-4 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto">
                Landmark designation preserves the architectural character that makes
                UWS townhouses so desirable. We include a full LPC analysis in every CMA.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
              {HISTORIC_DISTRICTS.map((dist) => (
                <div
                  key={dist.name}
                  className="rounded-2xl p-6 border border-black/[0.04]"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(184,134,11,0.02), rgba(255,255,255,0.9))',
                  }}
                >
                  <h3 className="font-display font-semibold text-[15px] text-brand-dark mb-2">
                    {dist.name}
                  </h3>
                  <p className="text-[12px] text-brand-dark/40 mb-2">{dist.streets}</p>
                  <p className="text-[12px] text-brand-dark/50 mb-2">
                    Designated: {dist.designated}
                  </p>
                  <p className="text-[13px] text-brand-dark/60 font-light">{dist.style}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            5. SYNDICATION — WHERE YOUR LISTING GOES
            ═══════════════════════════════════════════════ */}
        <section className="relative overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80&auto=format&fit=crop"
            alt="Elegant townhouse interior"
            fill
            className="object-cover"
            sizes="100vw"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />

          <div className="relative z-10 max-w-[1440px] mx-auto px-6 md:px-12 lg:px-20 py-20 md:py-28">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-brand-gold text-[11px] font-medium tracking-[0.2em] uppercase mb-4">
                  Maximum Exposure
                </p>
                <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-white leading-tight mb-6">
                  Your UWS Townhouse<br />Seen Everywhere
                </h2>
                <p className="text-white/60 text-[15px] font-light leading-relaxed mb-6">
                  The moment your listing goes live, it appears across every major
                  platform. UWS townhouse buyers search nationally and
                  internationally &mdash; we make sure they find you.
                </p>
                <a
                  href="#valuation"
                  className="inline-block px-8 py-3.5 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep transition-colors text-sm"
                >
                  Get Started
                </a>
              </div>
              <div
                className="rounded-2xl p-6"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
              >
                <p className="text-[11px] text-white/40 uppercase tracking-wider font-semibold mb-4">
                  Your Listing Reaches
                </p>
                <div className="space-y-3">
                  {[
                    { name: 'REBNY RLS', detail: '30,000+ NYC agents instantly' },
                    { name: 'StreetEasy', detail: "NYC's #1 property search" },
                    { name: 'Zillow + Trulia', detail: 'Most-visited nationally' },
                    { name: 'Realtor.com', detail: 'Official NAR portal' },
                    { name: 'Redfin', detail: 'Tech-forward buyers' },
                    { name: 'Homes.com', detail: 'CoStar flagship' },
                    { name: 'mallan.nyc', detail: 'Featured with professional photos' },
                    { name: 'International Portals', detail: '100+ countries via ListHub' },
                  ].map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center justify-between py-1.5 border-b border-white/[0.05] last:border-0"
                    >
                      <span className="text-[13px] font-medium text-white/80">{p.name}</span>
                      <span className="text-[11px] text-white/40">{p.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            6. VALUATION FORM
            ═══════════════════════════════════════════════ */}
        <section id="valuation" className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-10">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Free Analysis
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark mb-4">
                What&apos;s Your UWS Townhouse Worth?
              </h2>
              <p className="text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto leading-relaxed">
                Get a Comparative Market Analysis built specifically for Upper West
                Side townhouses &mdash; including comparable brownstone sales, FAR analysis,
                landmark review, and rental income projection.
              </p>
            </div>
            <HomeValueWidget />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            7. YOUR UWS CMA INCLUDES
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-16 md:py-24">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-dark">
                Your UWS Townhouse CMA Includes
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                {
                  title: 'UWS Townhouse Comparables',
                  description:
                    'Recent sales of similar townhouses on the Upper West Side — matched by width, lot size, stories, condition, and block.',
                },
                {
                  title: 'FAR & Air Rights Analysis',
                  description:
                    'Your current built FAR vs. allowable FAR under R8B/R7-2 zoning. Unused air rights add premium value for expansion-minded buyers.',
                },
                {
                  title: 'Landmark District Impact',
                  description:
                    'Full LPC analysis: which district you are in, what restrictions apply, and how landmark status affects buyer perception and value.',
                },
                {
                  title: 'Rental Income Projection',
                  description:
                    'If multi-unit, we project rental income and cap rate. UWS garden apartments are among the most in-demand rentals in Manhattan.',
                },
                {
                  title: 'Block-Level Pricing',
                  description:
                    'Not just neighborhood averages — we analyze your specific block&apos;s sales history, recent renovations, and comparable pricing.',
                },
                {
                  title: 'Net Proceeds & Strategy',
                  description:
                    'Detailed closing cost breakdown, optimal listing price, recommended timing, and marketing strategy tailored to UWS buyers.',
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
            8. FAQ
            ═══════════════════════════════════════════════ */}
        <section
          className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]"
          aria-label="Upper West Side townhouse seller FAQ"
        >
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Common Questions
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                UWS Townhouse Seller FAQ
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
            9. CROSS-LINKS
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-12 md:py-16">
          <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sell/townhouses"
              className="text-[13px] font-medium text-brand-dark/60 hover:text-brand-gold-deep transition-colors"
            >
              &larr; All NYC Townhouses
            </Link>
            <span className="hidden sm:inline text-brand-dark/20">&middot;</span>
            <Link
              href="/manhattan/upper-west-side"
              className="text-[13px] font-medium text-brand-dark/60 hover:text-brand-gold-deep transition-colors"
            >
              Explore UWS Neighborhood &rarr;
            </Link>
            <span className="hidden sm:inline text-brand-dark/20">&middot;</span>
            <Link
              href="/results"
              className="text-[13px] font-medium text-brand-dark/60 hover:text-brand-gold-deep transition-colors"
            >
              View Our Track Record &rarr;
            </Link>
            <span className="hidden sm:inline text-brand-dark/20">&middot;</span>
            <Link
              href="/buy?neighborhood=upper-west-side"
              className="text-[13px] font-medium text-brand-dark/60 hover:text-brand-gold-deep transition-colors"
            >
              UWS Listings for Sale &rarr;
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
              alt="Beautiful brownstone exterior"
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
              Ready to Sell Your<br />UWS Townhouse?
            </h2>
            <p className="text-white/70 text-[15px] font-light max-w-lg mx-auto mb-10 leading-relaxed">
              Get a free market analysis from a broker who has personally closed
              townhouse deals on the Upper West Side. No obligation, no pressure &mdash;
              just expert insight into what your property is worth today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#valuation"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep text-sm tracking-wide"
              >
                Get Your Free UWS CMA
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
