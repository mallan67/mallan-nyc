import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'NYC Real Estate for International Buyers | Mallan Real Estate',
  description:
    'Independent NYC brokerage advising international buyers on Manhattan and Brooklyn condos, co-ops, and townhouses. Cash and foreign-national financing, FIRPTA-aware structure, legal and tax referrals. No protected-class targeting.',
  alternates: { canonical: 'https://mallan.nyc/buy/international' },
  keywords: [
    'NYC real estate international buyers',
    'Manhattan condo for foreign buyers',
    'NYC pied-a-terre',
    'foreign national mortgage NYC',
    'FIRPTA buyer NYC',
    'NYC investment property international',
    'buy NYC apartment from abroad',
  ],
  openGraph: {
    title: 'NYC Real Estate for International Buyers | Mallan Real Estate',
    description:
      'Advisory brokerage for international buyers acquiring Manhattan and Brooklyn property. Condo, co-op, and townhouse guidance with referrals to NYC real estate attorneys and tax accountants.',
    url: 'https://mallan.nyc/buy/international',
    type: 'website',
  },
};

const intlBuyerFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Can a non-US citizen buy property in New York City?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. There is no US federal or New York State restriction on non-citizens purchasing residential property. Buyers from outside the US complete most transactions in cash or with a foreign-national mortgage program, retain a NYC real estate attorney for contract review, and work with a tax accountant on FIRPTA and structuring questions before closing.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the difference between a condo, a co-op, and a townhouse in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A condo is real property — you own a deeded unit and a share of the common elements. A co-op is shares in a corporation that owns the building; the corporation grants you a proprietary lease. A townhouse is fee-simple ownership of a building and its lot. Condos and townhouses are usually the practical options for international buyers; most co-op boards require US tax returns and personal references that non-resident buyers cannot produce.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need a US bank account or US tax ID to buy in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A US bank account is highly recommended for closing wires and ongoing carrying costs. An ITIN (Individual Taxpayer Identification Number) is typically required for foreign-national mortgages and for filing US tax returns on rental income or eventual sale. Your NYC real estate attorney and accountant coordinate the documents; Mallan Real Estate does not provide legal or tax advice and refers every client to licensed professionals.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is FIRPTA and does it apply at purchase?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'FIRPTA — the Foreign Investment in Real Property Tax Act — applies at the SALE of US real property by a non-US person, not at the purchase. At purchase, buyers do not pay FIRPTA. Buyers should be aware that on eventual resale, the closing typically withholds 15% of the gross sale price as a prepayment of US capital-gains tax. Planning for this withholding before purchase is a conversation for your accountant and attorney.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does a NYC purchase take from offer to close?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A cash condo purchase typically takes 6 to 10 weeks from accepted offer to closing. With a foreign-national mortgage, plan for 10 to 14 weeks. Townhouses can move faster (no board) or slower (more diligence — survey, inspection, title). New developments depend on construction status and the sponsor.',
      },
    },
    {
      '@type': 'Question',
      name: 'Will my purchase be private?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Buyers commonly purchase through a limited liability company (LLC) or trust for privacy and asset-protection reasons. NYC deeds are public records that include the grantee name; an LLC keeps the individual buyer name out of the public record. Your attorney structures the entity and your accountant advises on the US tax implications of LLC ownership for a non-resident.',
      },
    },
  ],
};

const brokerageSchema = {
  '@context': 'https://schema.org',
  '@type': 'RealEstateAgent',
  name: 'Mallan Real Estate Inc.',
  url: 'https://mallan.nyc',
  telephone: '+1-646-258-4460',
  email: 'maya@mallan.nyc',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '400 East 90th Street, Suite 17C',
    addressLocality: 'New York',
    addressRegion: 'NY',
    postalCode: '10128',
    addressCountry: 'US',
  },
  areaServed: [
    { '@type': 'AdministrativeArea', name: 'Manhattan, New York' },
    { '@type': 'AdministrativeArea', name: 'Brooklyn, New York' },
    { '@type': 'AdministrativeArea', name: 'Queens, New York' },
  ],
  knowsLanguage: ['English', 'Hebrew'],
  // BROKERAGE credentials only.
  //
  // This array also carried an INDIVIDUAL licensee's regulated record —
  // 'NY Department of State Real Estate Salesperson/Broker license #10311201806
  // (Maya Allan)' — hard-coded into structured data as a credential of the
  // brokerage entity. Same root-authority defect as the founder Person block
  // removed from app/layout.tsx: an individual professional record published
  // from Git, independent of the governed Agent profile, and uncorrectable by
  // any change to the Agent record.
  //
  // The individual licence is still disclosed where NY DOS 19 NYCRR 175.25
  // requires it — as visible advertising copy in COMPLIANCE_FOOTER below. That
  // is a required disclosure, not a second structured-data identity, and it
  // stays.
  hasCredential: [
    'NY Department of State Real Estate Broker license #10991205323 (Mallan Real Estate Inc.)',
    'REBNY (Real Estate Board of New York) — RLS Participant',
  ],
};

const FAQS = [
  {
    question: 'Can a non-US citizen buy in NYC?',
    answer:
      'Yes. There is no federal or state restriction. Most non-resident buyers transact in cash or with a foreign-national mortgage, with a NYC real estate attorney handling contract and closing.',
  },
  {
    question: 'Condo, co-op, or townhouse?',
    answer:
      'Condos and townhouses are usually the practical options for non-resident buyers. Most co-op boards require US tax returns and references that international buyers cannot easily produce.',
  },
  {
    question: 'Do I need a US bank account or ITIN?',
    answer:
      'A US bank account is strongly recommended. An ITIN is typically required for a mortgage and for filing on rental income or eventual sale. Your attorney and accountant coordinate the paperwork.',
  },
  {
    question: 'Does FIRPTA apply at purchase?',
    answer:
      'No — FIRPTA applies on SALE, not purchase. On eventual resale, the closing typically withholds 15% of the gross sale price as a prepayment of capital-gains tax. Plan with your accountant before purchase.',
  },
  {
    question: 'How long does it take?',
    answer:
      'Cash condo: 6–10 weeks from accepted offer. Foreign-national mortgage: 10–14 weeks. Townhouses vary with the scope of inspection and title work.',
  },
  {
    question: 'Will the purchase be private?',
    answer:
      'Buyers commonly purchase through an LLC or trust to keep the individual name out of the public deed record. Your attorney handles the entity setup and your accountant covers the US tax implications.',
  },
];

const PROPERTY_TYPES = [
  {
    type: 'Condominium',
    summary: 'Real property. Deeded unit + share of common elements.',
    forIntl:
      'Most accessible structure for non-resident buyers. Boards are typically lighter-touch than co-ops, and entity ownership (LLC, trust) is generally permitted.',
    consider: 'Common-charges, special assessments, real-estate taxes, financing rules from the sponsor or board.',
  },
  {
    type: 'Cooperative',
    summary: 'Shares in a corporation. Proprietary lease grants occupancy.',
    forIntl:
      'Typically the hardest path for non-resident buyers. Most boards require US tax returns, US-based reference letters, and a personal interview.',
    consider: 'Pied-à-terre rules, subletting restrictions, maintenance, board-package requirements.',
  },
  {
    type: 'Townhouse',
    summary: 'Fee-simple ownership of the building and the lot.',
    forIntl:
      'No board. Closing is contract-driven. Often suits buyers wanting a single-family residence, multi-family income property, or a long-hold investment.',
    consider: 'Structural condition, Certificate of Occupancy, landmark/LPC status, unused FAR/air rights, mechanicals.',
  },
  {
    type: 'New Development',
    summary: 'Sponsor sale — direct from the developer.',
    forIntl:
      'Sponsor offering plans set the terms. Common features for international buyers include flexible deposit schedules, no board approval, and turnkey delivery.',
    consider: 'Construction timeline, deposit structure, sponsor financials, transfer-tax treatment.',
  },
];

const PROCESS_STEPS = [
  {
    n: '1',
    title: 'Engage Mallan',
    body: 'Initial private consultation — goals, budget range, structure (personal vs LLC/trust), language preferences, and timeline.',
  },
  {
    n: '2',
    title: 'Build the Team',
    body: 'We refer you to NYC real estate attorneys, tax accountants familiar with non-resident issues, and a US private banker if you need a foreign-national mortgage.',
  },
  {
    n: '3',
    title: 'Identify Properties',
    body: 'Curated tour list — virtual first if you are abroad, in-person when you visit. We screen for entity-ownership restrictions, board profiles, and condition before any showing.',
  },
  {
    n: '4',
    title: 'Offer + Negotiation',
    body: 'Offer terms include price, contingencies, deposit, and timeline. We negotiate on your behalf and coordinate with your attorney on the contract.',
  },
  {
    n: '5',
    title: 'Diligence + Closing',
    body: 'Inspection, title, board approval (if applicable), and closing. We coordinate with your attorney, accountant, and lender through the closing wire.',
  },
];

const COMPLIANCE_FOOTER = [
  'Mallan Real Estate Inc. is licensed by the New York State Department of State (Brokerage License #10991205323).',
  'Maya Allan, Principal Broker — NY Salesperson/Broker License #10311201806.',
  'We do not provide legal, tax, accounting, immigration, or financial-planning advice. All such advice should come from licensed professionals in the relevant jurisdiction.',
  'Equal Housing Opportunity. We comply with the Federal Fair Housing Act, NY State Human Rights Law, and the NYC Human Rights Law (Title 8). We do not consider or target buyers based on race, color, national origin, religion, sex, familial status, disability, age, marital status, military status, sexual orientation, gender identity, lawful source of income, citizenship, immigration status, partnership, caregiver status, lawful occupation, or any other protected characteristic.',
];

export default function BuyInternationalPage() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(intlBuyerFaqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(brokerageSchema) }}
      />

      <main>
        {/* HERO */}
        <section className="relative h-screen min-h-[600px] max-h-[900px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1496588152823-86ff7695e68f?w=1600&q=80&auto=format&fit=crop"
              alt="Manhattan skyline at dusk"
              fill
              className="object-cover"
              style={{ objectPosition: 'center 50%' }}
              priority
              sizes="100vw"
              quality={90}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/75" />
          </div>
          <div className="relative z-10 text-center text-white px-6 pt-20 max-w-4xl">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-6">
              For Buyers Outside the United States
            </p>
            <h1
              className="font-display font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1.02] mb-6"
              style={{ textShadow: '0 4px 40px rgba(0,0,0,0.2)' }}
            >
              NYC Real Estate<br />for International Buyers
            </h1>
            <p className="text-white/85 text-base md:text-lg font-light max-w-2xl mx-auto mb-12 leading-relaxed">
              An independent NYC brokerage advising buyers abroad on Manhattan and Brooklyn
              condos, co-ops, townhouses, and new development.
              We coordinate the legal, tax, and financing team. You make the decisions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/contact?intent=international-buyer"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold hover:bg-brand-gold-deep text-white font-medium rounded-full text-sm tracking-wide"
              >
                Request a Private Consultation
              </Link>
              <a
                href="tel:+16462584460"
                className="btn-liquid inline-block px-10 py-4 border border-white/25 text-white font-medium rounded-full hover:bg-white/10 text-sm tracking-wide"
              >
                Call +1 (646) 258-4460
              </a>
            </div>
          </div>
        </section>

        {/* WHY MALLAN */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-14 md:mb-20">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Why Engage Mallan
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark leading-tight">
                Buying from Abroad is a<br className="hidden md:block" />Coordination Problem
              </h2>
              <p className="mt-6 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto leading-relaxed">
                NYC purchases require a real estate broker, a real estate attorney, an accountant,
                a banker (for financed purchases), and often a private-banker referral.
                The work for international buyers is mostly project management across these professionals.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  title: 'Independent',
                  description: 'Owner-operated brokerage. No franchise quotas, no in-house mortgage upsell, no in-house insurance upsell.',
                },
                {
                  title: 'Discreet',
                  description: 'Private-client cadence. Off-market introductions where they exist. Entity-ownership planning supported with your attorney.',
                },
                {
                  title: 'Time-Zone Friendly',
                  description: 'Async communication standard. WhatsApp, encrypted email, and scheduled video calls accommodate any time zone.',
                },
                {
                  title: 'Referral Network',
                  description: 'Vetted NYC real estate attorneys, tax accountants familiar with non-resident issues, private bankers, and title firms.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl p-6 border border-black/[0.04] hover:shadow-md transition-shadow"
                  style={{ background: 'linear-gradient(135deg, rgba(184,134,11,0.03), rgba(255,255,255,0.8))' }}
                >
                  <h3 className="font-display font-semibold text-[15px] text-brand-dark mb-2">{item.title}</h3>
                  <p className="text-brand-dark/60 text-[13px] font-light leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PROPERTY TYPES */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                The NYC Primer
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                Condo vs. Co-op vs. Townhouse
              </h2>
              <p className="mt-4 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto">
                The most consequential decision an international buyer makes is which ownership structure to use.
                It governs how fast you can close, who has approval rights, and what entity can hold title.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {PROPERTY_TYPES.map((p) => (
                <div
                  key={p.type}
                  className="rounded-2xl bg-white p-6 md:p-8 border border-black/[0.04]"
                >
                  <h3 className="font-display font-bold text-lg text-brand-dark mb-1">{p.type}</h3>
                  <p className="text-[13px] text-brand-dark/50 font-light italic mb-4">{p.summary}</p>
                  <p className="text-[13px] text-brand-dark/70 font-light leading-relaxed mb-3">
                    <span className="font-medium text-brand-dark/80">For non-resident buyers:</span> {p.forIntl}
                  </p>
                  <p className="text-[13px] text-brand-dark/70 font-light leading-relaxed">
                    <span className="font-medium text-brand-dark/80">What to weigh:</span> {p.consider}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PROCESS */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                The Process
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                From First Call to Closing Wire
              </h2>
            </div>
            <div className="grid md:grid-cols-5 gap-4 max-w-5xl mx-auto">
              {PROCESS_STEPS.map((step) => (
                <div
                  key={step.n}
                  className="rounded-2xl p-5 border border-black/[0.04] bg-white"
                >
                  <div className="font-display text-brand-gold-deep font-bold text-3xl mb-2">{step.n}</div>
                  <h3 className="font-display font-semibold text-[14px] text-brand-dark mb-2">{step.title}</h3>
                  <p className="text-brand-dark/60 text-[12px] font-light leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FINANCING */}
        <section className="relative overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1444084316824-dc26d6657664?w=1600&q=80&auto=format&fit=crop"
            alt="Manhattan residential street at dusk"
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
                Cash, Foreign-National Mortgage, or Portfolio
              </h2>
              <div className="space-y-5">
                {[
                  {
                    title: 'All-Cash',
                    detail: 'Most common path for non-resident buyers. Closing wires originate from a US bank account. Source-of-funds documentation is required.',
                  },
                  {
                    title: 'Foreign-National Mortgage',
                    detail: 'Specialty lenders offer 30–50% down programs without US tax returns. ITIN required. Rates run modestly above US-resident jumbo rates.',
                  },
                  {
                    title: 'Private-Bank Portfolio Loan',
                    detail: 'If you maintain a private-banking relationship abroad, your bank may offer a US-dollar mortgage secured against your portfolio. Often the most flexible structure.',
                  },
                  {
                    title: 'No Cross-Currency Advice',
                    detail: 'Mallan does not advise on FX hedging or cross-currency loan structuring. Your private banker or treasury team handles this side.',
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

        {/* FAQ */}
        <section
          className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]"
          aria-label="International buyer FAQ"
        >
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Common Questions
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                International Buyer FAQ
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

        {/* CTA */}
        <section className="relative py-24 md:py-36 overflow-hidden">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1538970272646-f61fabb3a8a2?w=1600&q=80&auto=format&fit=crop"
              alt="Central Park skyline view from above"
              fill
              className="object-cover"
              sizes="100vw"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/70" />
          </div>
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-4">
              Start the Conversation
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-white mb-6">
              Buying NYC Property from Abroad?
            </h2>
            <p className="text-white/70 text-[15px] font-light max-w-lg mx-auto mb-10 leading-relaxed">
              Send a private inquiry — name, country of residence, intended use, and a rough budget range.
              Maya responds personally within one business day NYC time.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/contact?intent=international-buyer"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep text-sm tracking-wide"
              >
                Request a Private Consultation
              </Link>
              <a
                href="mailto:maya@mallan.nyc"
                className="btn-liquid inline-block px-10 py-4 border border-white/20 text-white font-medium rounded-full hover:bg-white/10 text-sm tracking-wide"
              >
                Email maya@mallan.nyc
              </a>
            </div>
          </div>
        </section>

        {/* COMPLIANCE FOOTER */}
        <section className="px-6 md:px-12 lg:px-20 py-12 bg-[#1A1A1A] text-white/70">
          <div className="max-w-[1440px] mx-auto space-y-3 text-[12px] font-light leading-relaxed">
            {COMPLIANCE_FOOTER.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
