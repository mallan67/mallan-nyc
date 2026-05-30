import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Sell NYC Property from Abroad | International Owners | Mallan Real Estate',
  description:
    'Private advisory for international owners of New York City property. Sell, hold, or rent guidance. FIRPTA-aware net-proceeds modeling. Estate, relocation, and investment-trust scenarios. NYC real estate attorney and accountant referrals.',
  alternates: { canonical: 'https://mallan.nyc/sell/international' },
  keywords: [
    'sell NYC property from abroad',
    'foreign owner NYC apartment',
    'FIRPTA seller withholding',
    'NYC pied-a-terre sale',
    'NYC investment property sale international',
    'private NYC seller',
    'NYC estate property sale',
  ],
  openGraph: {
    title: 'Sell NYC Property from Abroad | Mallan Real Estate',
    description:
      'Independent NYC brokerage for international owners. Discreet sale, hold, or rent advisory with referrals to qualified attorneys and accountants.',
    url: 'https://mallan.nyc/sell/international',
    type: 'website',
  },
};

const intlSellerFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'I live abroad and own a NYC apartment. Do I have to fly to New York to sell it?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Most non-resident sellers complete the entire process remotely. You sign listing agreements electronically, the apartment is photographed and shown by the broker, offers are negotiated via email and phone, and your real estate attorney handles the closing. A limited power of attorney is the standard mechanism for executing closing documents without traveling.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is FIRPTA and how much will be withheld at closing?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'FIRPTA — the Foreign Investment in Real Property Tax Act — requires the buyer to withhold 15% of the GROSS sale price (not the gain) at closing as a prepayment of US capital-gains tax on the foreign sellers profit. The 15% applies regardless of whether there is an actual gain. After the tax year closes, the seller files a US tax return and either gets a refund or owes additional tax. There are reduction certificates available when the actual tax owed is less than 15% — your tax accountant files for these. Mallan Real Estate does not provide tax advice.',
      },
    },
    {
      '@type': 'Question',
      name: 'Should I sell, hold, or rent?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'It depends on your goals, your tax position, market conditions, and the carrying cost vs achievable rental yield. We model net proceeds in three scenarios — sell now, hold for 24 months, hold and rent — with the inputs your accountant gives us. The output is a side-by-side comparison so you and your advisors make the decision with the same numbers.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can the sale be private?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, to a meaningful degree. We can run an off-market or whisper-listed process for a defined window before a public listing. Public listings are required to be filed with REBNY RLS, but the breadth of distribution is controllable. Address suppression is available for sensitive cases. Your attorney handles deed and entity-level privacy.',
      },
    },
    {
      '@type': 'Question',
      name: 'What if the property is held by a trust or LLC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Common. Trust-owned and LLC-owned property require the trustee or LLC manager to sign the listing agreement and closing documents. If a US person is the trustee, FIRPTA treatment differs. Your attorney and accountant coordinate the entity-level documentation; Mallan facilitates the sale process.',
      },
    },
    {
      '@type': 'Question',
      name: 'I inherited a NYC apartment. What now?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Inherited property typically receives a step-up in cost basis to the date-of-death value, which can substantially reduce the capital-gains tax on sale. Your accountant confirms the basis. An estate attorney handles the title transfer (probate or trust succession). We work with the executor or trustee to schedule the sale once title is clear.',
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
};

const FAQS = [
  {
    question: 'Do I have to fly to NYC?',
    answer:
      'No. Most non-resident sellers complete the entire process remotely. A limited power of attorney lets your attorney execute closing documents on your behalf.',
  },
  {
    question: 'What does FIRPTA cost me?',
    answer:
      '15% of the GROSS sale price is withheld at closing as a prepayment of US capital-gains tax — regardless of whether there is an actual gain. Reduction certificates may bring this down. Talk to your tax accountant.',
  },
  {
    question: 'Sell, hold, or rent?',
    answer:
      'We model net proceeds in all three scenarios with inputs from your accountant. The output is a side-by-side comparison so you and your advisors decide on the same numbers.',
  },
  {
    question: 'Can the sale be private?',
    answer:
      'Off-market or whisper-listed windows are available. Public listings are filed with REBNY RLS but breadth of distribution and address suppression are controllable.',
  },
  {
    question: 'Trust or LLC ownership?',
    answer:
      'The trustee or LLC manager signs documents. FIRPTA treatment may differ if a US person is the trustee. Your attorney and accountant handle entity-level paperwork.',
  },
  {
    question: 'Inherited property?',
    answer:
      'Inherited property typically receives a step-up in basis to the date-of-death value. Your accountant confirms basis; an estate attorney handles title; we run the sale once title is clear.',
  },
];

const SCENARIOS = [
  {
    title: 'Sell Now',
    summary: 'List, market, accept best offer, close.',
    pros: 'Capital freed up. FIRPTA settled (and refundable in many cases). No more carrying cost.',
    cons: 'Subject to current market conditions. Closing-cost and brokerage fees due at close.',
  },
  {
    title: 'Hold + Rent',
    summary: 'Convert to a rental for a defined hold period.',
    pros: 'Income offsets carrying cost. Step-up event preserved for heirs. Market-time optionality.',
    cons: 'Property-management overhead. NY State + city tax filings on rental income. Tenant law applies.',
  },
  {
    title: 'Hold Vacant',
    summary: 'Keep as pied-à-terre or hold for relatives.',
    pros: 'Personal use preserved. No tenant-law obligations. Easy to list if plans change.',
    cons: 'Full carrying cost without offsetting income. Higher property-tax exposure in some assessments.',
  },
];

const PROCESS_STEPS = [
  {
    n: '1',
    title: 'Private Review',
    body: 'Initial confidential conversation — your goal, timeline, ownership structure, tax position (in broad strokes), and price expectations.',
  },
  {
    n: '2',
    title: 'Net-Proceeds Model',
    body: 'We assemble a side-by-side model: sell now / hold + rent / hold vacant. Inputs come from your accountant. Output is a single decision document.',
  },
  {
    n: '3',
    title: 'Engage Counsel',
    body: 'If you do not already have one, we refer to a NYC real estate attorney and a tax accountant familiar with non-resident issues. You retain them directly.',
  },
  {
    n: '4',
    title: 'List or Hold',
    body: 'If selling — listing agreement, marketing plan, distribution scope (full vs whisper). If holding — lease terms, property-management referral, ongoing reporting cadence.',
  },
  {
    n: '5',
    title: 'Close + Wire',
    body: 'Power-of-attorney execution. FIRPTA escrow. Closing wire to your designated US or foreign account, as instructed by your attorney.',
  },
];

const COMPLIANCE_FOOTER = [
  'Mallan Real Estate Inc. is licensed by the New York State Department of State (Brokerage License #10991205323).',
  'Maya Allan, Principal Broker — NY Salesperson/Broker License #10311201806.',
  'We do not provide legal, tax, accounting, immigration, or financial-planning advice. All such advice should come from licensed professionals in the relevant jurisdiction.',
  'All listing data and any market analyses we provide are derived from REBNY RLS and public records under our IDX Plus license. Listings are subject to REBNY UCBA 2026 rules, the NY Department of State advertising regulations (19 NYCRR §175.25), Fair Housing Act, NY State Human Rights Law, and the NYC Human Rights Law.',
  'Equal Housing Opportunity. We comply with the Federal Fair Housing Act, NY State Human Rights Law, and the NYC Human Rights Law (Title 8).',
];

export default function SellInternationalPage() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(intlSellerFaqSchema) }}
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
              src="https://images.unsplash.com/photo-1518391846015-55a9cc003b25?w=1600&q=80&auto=format&fit=crop"
              alt="Manhattan residential building exterior with stone facade"
              fill
              className="object-cover"
              style={{ objectPosition: 'center 40%' }}
              priority
              sizes="100vw"
              quality={90}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/75" />
          </div>
          <div className="relative z-10 text-center text-white px-6 pt-20 max-w-4xl">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-6">
              For Owners Outside the United States
            </p>
            <h1
              className="font-display font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight leading-[1.02] mb-6"
              style={{ textShadow: '0 4px 40px rgba(0,0,0,0.2)' }}
            >
              Sell NYC Property<br />from Abroad
            </h1>
            <p className="text-white/85 text-base md:text-lg font-light max-w-2xl mx-auto mb-12 leading-relaxed">
              A private advisory for international owners of New York City property.
              Sell, hold, or rent — modeled side-by-side with FIRPTA, carrying-cost, and net-proceeds inputs from your accountant.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/contact?intent=international-seller"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold hover:bg-brand-gold-deep text-white font-medium rounded-full text-sm tracking-wide"
              >
                Request a Private Review
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
                Selling From Abroad Is Not<br className="hidden md:block" />Like Selling From Down the Block
              </h2>
              <p className="mt-6 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto leading-relaxed">
                FIRPTA, time-zone friction, power-of-attorney mechanics, entity-ownership documentation,
                and discretion requirements all shape how the sale runs.
                Mallan coordinates the whole process so your attorney and accountant only handle their part.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  title: 'Independent',
                  description: 'Owner-operated brokerage. We work for the seller, not a franchise sales target.',
                },
                {
                  title: 'Discreet',
                  description: 'Off-market and whisper-listed processes available. Address suppression in sensitive cases.',
                },
                {
                  title: 'Numbers First',
                  description: 'Every recommendation is anchored in a net-proceeds model your accountant can audit.',
                },
                {
                  title: 'Remote-Native',
                  description: 'WhatsApp, encrypted email, scheduled video calls. Time-zone-aware response cadence.',
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

        {/* SCENARIO COMPARISON */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-28 bg-[#F8F7F4]">
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                The Decision Frame
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                Sell, Hold + Rent, or Hold Vacant
              </h2>
              <p className="mt-4 text-brand-dark/60 text-[15px] font-light max-w-2xl mx-auto">
                Same property, three scenarios. We model net proceeds for each so you and your advisors compare apples to apples.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {SCENARIOS.map((s) => (
                <div
                  key={s.title}
                  className="rounded-2xl bg-white p-6 md:p-8 border border-black/[0.04]"
                >
                  <h3 className="font-display font-bold text-lg text-brand-dark mb-1">{s.title}</h3>
                  <p className="text-[13px] text-brand-dark/50 font-light italic mb-4">{s.summary}</p>
                  <p className="text-[13px] text-brand-dark/70 font-light leading-relaxed mb-3">
                    <span className="font-medium text-brand-dark/80">Upside:</span> {s.pros}
                  </p>
                  <p className="text-[13px] text-brand-dark/70 font-light leading-relaxed">
                    <span className="font-medium text-brand-dark/80">Tradeoff:</span> {s.cons}
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
                From Private Review to Closing Wire
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

        {/* FIRPTA STRIP */}
        <section className="relative overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=80&auto=format&fit=crop"
            alt="Manhattan apartment building at twilight"
            fill
            className="object-cover"
            sizes="100vw"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30" />
          <div className="relative z-10 max-w-[1440px] mx-auto px-6 md:px-12 lg:px-20 py-20 md:py-28">
            <div className="max-w-2xl">
              <p className="text-brand-gold text-[11px] font-medium tracking-[0.2em] uppercase mb-4">
                FIRPTA + Tax
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-white leading-tight mb-8">
                Plan the Withholding<br />Before You List
              </h2>
              <div className="space-y-5">
                {[
                  {
                    title: '15% of Gross — Not Gain',
                    detail: 'FIRPTA withholds 15% of the gross sale price at closing as a prepayment of US capital-gains tax. The withholding is independent of whether there was an actual gain.',
                  },
                  {
                    title: 'Reduction Certificates',
                    detail: 'When your actual tax owed is less than 15%, your accountant can file IRS Form 8288-B for a reduced withholding certificate. This must be filed BEFORE closing.',
                  },
                  {
                    title: 'Refund Mechanic',
                    detail: 'After the tax year closes, you file a US tax return (Form 1040-NR). Excess withholding is refunded; any shortfall is paid in.',
                  },
                  {
                    title: 'Inherited Property',
                    detail: 'Inherited property usually receives a step-up in basis to date-of-death value, materially reducing the gain calculation. Confirm basis with your accountant.',
                  },
                  {
                    title: 'Not Tax Advice',
                    detail: 'Mallan Real Estate does not provide legal or tax advice. Every seller we work with retains a NYC real estate attorney and a tax accountant familiar with non-resident issues.',
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
          aria-label="International seller FAQ"
        >
          <div className="max-w-[1440px] mx-auto">
            <div className="text-center mb-12 md:mb-16">
              <p className="text-brand-gold-deep text-[13px] font-medium tracking-[0.2em] uppercase mb-3">
                Common Questions
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-dark">
                International Seller FAQ
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
              src="https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1600&q=80&auto=format&fit=crop"
              alt="Manhattan skyline view"
              fill
              className="object-cover"
              sizes="100vw"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/70" />
          </div>
          <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
            <p className="text-brand-gold text-[13px] font-medium tracking-[0.2em] uppercase mb-4">
              Start with a Private Review
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight text-white mb-6">
              Own NYC Property and Live Abroad?
            </h2>
            <p className="text-white/70 text-[15px] font-light max-w-lg mx-auto mb-10 leading-relaxed">
              Send a private inquiry — country of residence, address (or building) of the NYC property,
              ownership structure, and whether you are exploring sale, rental, or just market-checking.
              Maya responds personally within one business day NYC time.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/contact?intent=international-seller"
                className="btn-liquid inline-block px-10 py-4 bg-brand-gold text-white font-medium rounded-full hover:bg-brand-gold-deep text-sm tracking-wide"
              >
                Request a Private Review
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
