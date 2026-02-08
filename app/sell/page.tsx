import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Image from 'next/image';
import Link from 'next/link';

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
        text: 'While not required, professional staging can significantly impact sale price and time on market. Staged properties in NYC typically sell 5-15% faster and often achieve higher prices. At minimum, decluttering and professional photography are recommended for all listings.',
      },
    },
  ],
};

export default function SellPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sellHowToSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sellFaqSchema) }}
      />
      <Header dark />
      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center justify-center">
          <div className="absolute inset-0">
            <Image
              src="/images/hero.jpg"
              alt="Sell your property"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-black/50" />
          </div>
          <div className="relative z-10 text-center text-white px-4 max-w-3xl">
            <div className="mb-6">
              <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/90 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Home
              </Link>
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold mb-4">
              Sell Your Property
            </h1>
            <p className="text-lg md:text-xl text-gray-200">
              Get the maximum value for your NYC property with our expert guidance
              and proven marketing strategies.
            </p>
          </div>
        </section>

        {/* Why Sell With Us */}
        <section className="py-16 bg-white">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="text-3xl font-semibold text-center mb-12">
              Why Sell With Mallan Real Estate
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-brand-gold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Competitive Pricing</h3>
                <p className="text-gray-600">
                  Data-driven pricing strategies to maximize your return while ensuring
                  a timely sale.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-brand-gold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Professional Marketing</h3>
                <p className="text-gray-600">
                  High-quality photography, virtual tours, and targeted advertising
                  to showcase your property.
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-brand-gold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-brand-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold mb-2">Expert Negotiation</h3>
                <p className="text-gray-600">
                  Skilled negotiators who advocate for your interests and secure
                  the best possible terms.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Process */}
        <section className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-3xl font-semibold text-center mb-12">
              Our Selling Process
            </h2>
            <div className="space-y-8">
              {[
                {
                  step: '01',
                  title: 'Consultation',
                  description: 'We meet to discuss your goals, timeline, and assess your property. You\'ll receive a comprehensive market analysis.',
                },
                {
                  step: '02',
                  title: 'Preparation',
                  description: 'We recommend staging, repairs, and improvements to maximize your property\'s appeal. Professional photography and materials are prepared.',
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
              ].map((item, index) => (
                <div key={index} className="flex gap-6">
                  <div className="flex-shrink-0">
                    <span className="block w-12 h-12 rounded-full bg-brand-gold text-white flex items-center justify-center font-semibold">
                      {item.step}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                    <p className="text-gray-600">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-brand-dark text-white">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-semibold mb-4">
              Ready to Sell?
            </h2>
            <p className="text-gray-300 mb-8">
              Get a free, no-obligation market analysis and learn what your property
              could sell for in today&apos;s market.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/agents"
                className="inline-block px-8 py-3 bg-white text-brand-dark font-medium rounded hover:bg-gray-100 transition-colors"
              >
                Contact an Agent
              </Link>
              <a
                href="tel:+16462584460"
                className="inline-block px-8 py-3 border border-white text-white font-medium rounded hover:bg-white/10 transition-colors"
              >
                Call (646) 258-4460
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
