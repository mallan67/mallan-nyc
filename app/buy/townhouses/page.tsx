import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Buy a NYC Townhouse | Brownstone & Townhouse Search | Mallan Real Estate',
  description:
    'Search NYC townhouses and brownstones for sale. Expert guidance on FAR, landmark rules, inspections, and financing for townhouse buyers in Manhattan and Brooklyn.',
  alternates: { canonical: 'https://mallan.nyc/buy/townhouses' },
  keywords: [
    'buy townhouse NYC',
    'buy brownstone NYC',
    'NYC townhouse for sale',
    'brownstone for sale Manhattan',
    'brownstone for sale Brooklyn',
    'townhouse buyer guide NYC',
    'Upper West Side townhouse',
    'Park Slope brownstone',
    'Harlem townhouse',
    'NYC multi-family townhouse',
  ],
  openGraph: {
    title: 'Buy a NYC Townhouse | Mallan Real Estate',
    description:
      'Expert townhouse buyer representation. Search brownstones and townhouses across NYC with guidance on FAR, inspections, and financing.',
    url: 'https://mallan.nyc/buy/townhouses',
  },
};

const townhouseBuyerFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much does a townhouse cost in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NYC townhouse prices range widely: $1.5M-$4M in emerging neighborhoods like Bed-Stuy and Harlem, $4M-$12M on the Upper West Side and Park Slope, and $10M-$30M+ in the West Village and Upper East Side. Price depends on width (16-25ft typical), lot size, condition, number of units, and location.',
      },
    },
    {
      '@type': 'Question',
      name: 'What should I look for when buying a NYC townhouse?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Key factors include: structural condition (foundation, roof, facade), mechanical systems (HVAC, electrical, plumbing age), FAR (unused air rights for expansion), landmark status (LPC restrictions on exterior changes), certificate of occupancy (legal number of units), and rental income potential. A pre-purchase inspection by a townhouse specialist is essential.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is financing a townhouse different from a condo?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Townhouse mortgages typically require 20-30% down payment (vs. 10-20% for condos). Lenders treat townhouses as unique properties requiring individual appraisals. Multi-family townhouses (2-4 units) can qualify for FHA or investment property loans where rental income offsets carrying costs. Jumbo loans are common given NYC prices.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need a townhouse inspection?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Absolutely. Unlike condos where the building handles structural issues, townhouse buyers are responsible for everything — roof, facade, foundation, mechanicals, and any code violations. A specialized townhouse inspector (not a general home inspector) should examine: structural integrity, roof condition, facade compliance (Local Law 11), electrical capacity, plumbing, HVAC, and any open DOB violations.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is a certificate of occupancy and why does it matter?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Certificate of Occupancy (C of O) from the NYC Department of Buildings defines the legal use of the property — how many units, residential vs. commercial, and occupancy type. If a townhouse is being used differently than its C of O allows (e.g., 3 units but C of O says 2-family), the buyer inherits that liability. Always verify the C of O before purchasing.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I convert a multi-family townhouse to single-family?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, but it requires filing with the NYC Department of Buildings for an amended Certificate of Occupancy. If tenants are present, NYC tenant protection laws apply — you cannot simply evict rent-stabilized tenants. The conversion may also require LPC approval if in a historic district. Budget $100K-$500K+ for a full single-family conversion depending on scope.',
      },
    },
  ],
};

const FAQS = [
  {
    question: 'How much does a townhouse cost in NYC?',
    answer:
      'Prices range widely: $1.5M-$4M in Bed-Stuy and Harlem, $4M-$12M on the Upper West Side and Park Slope, $10M-$30M+ in the West Village and Upper East Side. Price depends on width, lot size, condition, units, and location.',
  },
  {
    question: 'What should I look for when buying?',
    answer:
      'Key factors: structural condition (foundation, roof, facade), mechanical systems (HVAC, electrical, plumbing), FAR/air rights, landmark status, certificate of occupancy (legal units), and rental income potential. A townhouse-specialist inspection is essential.',
  },
  {
    question: 'How is financing different from a condo?',
    answer:
      'Townhouse mortgages typically need 20-30% down. Lenders require individual appraisals. Multi-family (2-4 units) can qualify for FHA or investment loans where rental income offsets costs. Jumbo loans are common at NYC price points.',
  },
  {
    question: 'Do I need a specialized inspection?',
    answer:
      'Yes. You are buying the entire building — roof, facade, foundation, mechanicals, and any code violations. Use a townhouse specialist who checks: structural integrity, roof, facade (Local Law 11), electrical, plumbing, HVAC, and open DOB violations.',
  },
  {
    question: 'What is a Certificate of Occupancy?',
    answer:
      'The C of O defines legal use — how many units and what type. If the townhouse is used differently than its C of O allows, you inherit that liability. Always verify before purchasing.',
  },
  {
    question: 'Can I convert multi-family to single-family?',
    answer:
      'Yes, but it requires a DOB filing for an amended C of O. Rent-stabilized tenants cannot be evicted. LPC approval may be needed in historic districts. Budget $100K-$500K+ depending on scope.',
  },
];

const BUYER_CHECKLIST = [
  {
    title: 'Structure & Foundation',
    items: [
      'Foundation walls — cracks, bowing, water intrusion',
      'Floor joists and beams — sagging, rot, termite damage',
      'Party walls — shared wall condition with neighbors',
      'Facade — brownstone spalling, pointing, Local Law 11 compliance',
    ],
  },
  {
    title: 'Roof & Exterior',
    items: [
      'Roof age and condition (flat roofs last 15-25 years)',
      'Parapet walls and coping stones',
      'Skylights — leaks, condensation',
      'Rear yard extension condition and permits',
    ],
  },
  {
    title: 'Mechanicals',
    items: [
      'Electrical panel capacity (100A minimum, 200A+ preferred)',
      'Plumbing — galvanized vs. copper, sewer line condition',
      'HVAC system age (boiler, radiators, or forced air)',
      'Water heater capacity for multi-floor use',
    ],
  },
  {
    title: 'Legal & Zoning',
    items: [
      'Certificate of Occupancy — legal units match actual use',
      'Open DOB violations or complaints',
      'Landmark district restrictions (LPC)',
      'FAR analysis — unused air rights, expansion potential',
    ],
  },
];

const TOWNHOUSE_NEIGHBORHOODS = [
  {
    name: 'Upper West Side',
    borough: 'Manhattan',
    priceRange: '$4M - $15M',
    character: 'Classic brownstones between Central Park and Riverside Park. Top schools, cultural institutions.',
    href: '/sell/townhouses/upper-west-side',
  },
  {
    name: 'Upper East Side',
    borough: 'Manhattan',
    priceRange: '$5M - $30M+',
    character: 'Limestone and brownstone on museum mile. The most prestigious townhouse addresses in NYC.',
    href: '/manhattan',
  },
  {
    name: 'West Village',
    borough: 'Manhattan',
    priceRange: '$6M - $25M+',
    character: 'Federal and Greek Revival on charming, irregular streets. The most coveted village blocks.',
    href: '/manhattan',
  },
  {
    name: 'Harlem',
    borough: 'Manhattan',
    priceRange: '$1.5M - $5M',
    character: 'Renaissance Revival brownstones. Strong value with significant upside as the neighborhood evolves.',
    href: '/manhattan',
  },
  {
    name: 'Park Slope',
    borough: 'Brooklyn',
    priceRange: '$3M - $8M',
    character: 'Victorian brownstones near Prospect Park. Family-friendly with excellent schools.',
    href: '/brooklyn',
  },
  {
    name: 'Brooklyn Heights',
    borough: 'Brooklyn',
    priceRange: '$4M - $12M',
    character: "NYC's first landmarked neighborhood. Stunning row houses with Manhattan views.",
    href: '/brooklyn',
  },
  {
    name: 'Bed-Stuy',
    borough: 'Brooklyn',
    priceRange: '$1.2M - $4M',
    character: 'Renaissance Revival row houses. Best value for grand-scale brownstones in NYC.',
    href: '/brooklyn',
  },
  {
    name: 'Carroll Gardens',
    borough: 'Brooklyn',
    priceRange: '$2.5M - $6M',
    character: 'Wide-stoop brownstones with deep gardens. Italian-American heritage, excellent dining.',
    href: '/brooklyn',
  },
];

export default function BuyTownhousesPage() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(townhouseBuyerFaqSchema) }}
      />

      <main>
        {/* ═══════════════════════════════════════════════
            1. HERO
            ═══════════════════════════════════════════════ */}
        <section className="relative h-screen min-h-[600px] max-h-[900px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80&auto=format&fit=crop"
              alt="NYC brownstone townhouse with classic stoop and garden"
              fill
              className="object-cover"
              style={{ objectPosition: 'center 35%' }}
              priority
              sizes="100vw"
              quality={90}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/75" />
          </div>
          <div className="relative z-10 text-center text-white px-6 pt-20 max-w-4xl">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-6">
              NYC Townhouse Specialists
            </p>
            <h1
              className="font-display font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1.02] mb-6"
              style={{ textShadow: '0 4px 40px rgba(0,0,0,0.2)' }}
            >
              Find Your<br />NYC Townhouse
            </h1>
            <p className="text-white/80 text-base md:text-lg font-light max-w-xl mx-auto mb-12 leading-relaxed">
              Buying a townhouse is the most complex real estate transaction in New York.
              You need a broker who understands structures, zoning, landmarks,
              and the hidden value most agents miss.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/buy?propertyType=Townhouse"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold hover:bg-brand-gold-deep text-white font-medium rounded-full text-sm tracking-wide"
              >
                Search Townhouses for Sale
              </Link>
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
            2. WHY BUYING A TOWNHOUSE IS DIFFERENT
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-14 md:mb-20">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Before You Buy
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark leading-tight">
                Buying a Townhouse Is Not<br className="hidden md:block" />
                Like Buying an Apartment
              </h2>
              <p className="mt-6 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto leading-relaxed">
                When you buy a townhouse, you&apos;re buying the building, the land,
                and the air rights above it. There&apos;s no co-op board, no condo association,
                and no one else responsible for the roof, the facade, or the boiler.
                That&apos;s the freedom &mdash; and the responsibility.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  title: 'You Own the Land',
                  description: 'Fee simple ownership of the lot and everything on it. No shares, no unit deeds — real property.',
                  icon: 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15',
                },
                {
                  title: 'No Board Approval',
                  description: 'No interviews, no financial packages, no waiting for a board vote. You close on your timeline.',
                  icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                },
                {
                  title: 'Expansion Potential',
                  description: 'Unused FAR means you can build up, out, or down. Air rights can add thousands of square feet.',
                  icon: 'M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12',
                },
                {
                  title: 'Rental Income',
                  description: 'Multi-unit townhouses generate income that offsets your mortgage. Garden apartments are NYC gold.',
                  icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl p-6 border border-black/[0.04] hover:shadow-md transition-shadow"
                  style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.03), rgba(255,255,255,0.8))' }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                    style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.15), rgba(184,134,11,0.05))' }}
                  >
                    <svg className="w-5 h-5 text-brand-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                    </svg>
                  </div>
                  <h3 className="font-display font-semibold text-[15px] text-brand-dark mb-2">{item.title}</h3>
                  <p className="text-brand-dark/60 text-[13px] font-light leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            3. BUYER'S INSPECTION CHECKLIST
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Due Diligence
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                Townhouse Buyer&apos;s Checklist
              </h2>
              <p className="mt-4 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto">
                Every townhouse we represent for buyers gets this level of scrutiny.
                We walk through every item before you make an offer.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {BUYER_CHECKLIST.map((section) => (
                <div
                  key={section.title}
                  className="rounded-2xl bg-white p-6 md:p-8 border border-black/[0.04]"
                >
                  <h3 className="font-display font-bold text-lg text-brand-dark mb-4">
                    {section.title}
                  </h3>
                  <ul className="space-y-3">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[13px] text-brand-dark/70">
                        <svg className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="font-light leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            4. NEIGHBORHOOD GUIDE
            ═══════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Where to Buy
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                NYC&apos;s Best Townhouse Neighborhoods
              </h2>
              <p className="mt-4 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto">
                From historic brownstone blocks to emerging neighborhoods with strong upside.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {TOWNHOUSE_NEIGHBORHOODS.map((n) => (
                <Link
                  key={n.name}
                  href={n.href}
                  className="group rounded-2xl p-5 border border-black/[0.04] hover:border-brand-gold/20 hover:shadow-md transition-all"
                >
                  <p className="font-display font-semibold text-brand-dark group-hover:text-brand-gold-deep transition-colors">
                    {n.name}
                  </p>
                  <p className="text-[12px] text-brand-dark/40 mt-0.5">{n.borough}</p>
                  <p className="text-[14px] font-display font-bold text-brand-gold-deep mt-3">
                    {n.priceRange}
                  </p>
                  <p className="text-[12px] text-brand-dark/60 mt-2 font-light leading-relaxed">
                    {n.character}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            5. FINANCING GUIDE
            ═══════════════════════════════════════════════ */}
        <section className="relative overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=80&auto=format&fit=crop"
            alt="Townhouse interior with original architectural details"
            fill
            className="object-cover"
            sizes="100vw"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30" />

          <div className="relative z-10 max-w-[1440px] mx-auto px-6 md:px-12 lg:px-20 py-20 md:py-28">
            <div className="max-w-2xl">
              <p className="text-brand-gold text-[11px] font-medium tracking-[0.2em] uppercase mb-4">
                Financing
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-white leading-tight mb-8">
                How Townhouse<br />Financing Works
              </h2>
              <div className="space-y-5">
                {[
                  {
                    title: 'Down Payment',
                    detail: '20-30% typical. Some lenders require 25%+ for multi-family. All-cash offers are common and competitive.',
                  },
                  {
                    title: 'Mortgage Types',
                    detail: 'Jumbo loans (most common at NYC prices), FHA 203(k) for renovation, portfolio loans for non-traditional income.',
                  },
                  {
                    title: 'Multi-Family Advantage',
                    detail: '2-4 unit townhouses let you use projected rental income to qualify for a larger loan. Lenders count 75% of market rent.',
                  },
                  {
                    title: 'Appraisal Considerations',
                    detail: 'Townhouses are appraised individually (no comparable unit sales in the building). Finding good comps is critical — we help your appraiser.',
                  },
                  {
                    title: 'Renovation Financing',
                    detail: 'FHA 203(k), Fannie Mae HomeStyle, or construction-to-permanent loans let you finance purchase + renovation in one mortgage.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl p-5"
                    style={{
                      background: 'rgba(30,30,30,0.55)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <h3 className="font-display font-semibold text-[14px] text-brand-gold mb-1.5">
                      {item.title}
                    </h3>
                    <p className="text-white/70 text-[13px] font-light leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════
            6. FAQ
            ═══════════════════════════════════════════════ */}
        <section
          className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]"
          aria-label="Townhouse buyer FAQ"
        >
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Common Questions
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                Townhouse Buyer FAQ
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
            7. SEARCH CTA
            ═══════════════════════════════════════════════ */}
        <section className="relative py-24 md:py-36 overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80&auto=format&fit=crop"
              alt="Beautiful NYC brownstone"
              fill
              className="object-cover"
              sizes="100vw"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/70" />
          </div>
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-4">
              Start Your Search
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-white mb-6">
              Ready to Find Your Townhouse?
            </h2>
            <p className="text-white/70 text-[15px] font-light max-w-lg mx-auto mb-10 leading-relaxed">
              Search available townhouses across NYC, or speak with a specialist
              who can identify exclusive opportunities and guide you through
              every step of the process.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/buy?propertyType=Townhouse"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep text-sm tracking-wide"
              >
                Search Townhouses
              </Link>
              <a
                href="tel:+16462584460"
                className="btn-liquid inline-block px-10 py-4 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 text-sm tracking-wide"
              >
                Call (646) 258-4460
              </a>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
              <Link
                href="/sell/townhouses"
                className="text-[13px] text-white/50 hover:text-brand-gold transition-colors"
              >
                Looking to sell a townhouse? &rarr;
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
