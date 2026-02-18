import Link from 'next/link';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import SocialShareBar from '@/app/components/SocialShareBar';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import NeighborhoodBreadcrumb from './NeighborhoodBreadcrumb';
import NeighborhoodHubGrid from './NeighborhoodHubGrid';
import type { Neighborhood, Borough, BoroughSlug } from '@/lib/types/neighborhood';

interface HubFAQ {
  name: string;
  acceptedAnswer: { text: string };
}

interface BoroughHubPageProps {
  borough: Borough;
  boroughSlug: BoroughSlug;
  neighborhoods: Neighborhood[];
  heroImage: string;
  intro: string;
  faqs: HubFAQ[];
  faqSchema: object;
  breadcrumbSchema: object;
}

export default function BoroughHubPage({
  borough,
  boroughSlug,
  neighborhoods,
  heroImage,
  intro,
  faqs,
  faqSchema,
  breadcrumbSchema,
}: BoroughHubPageProps) {
  return (
    <>
      <Header dark />

      {/* Hero */}
      <section className="relative h-[340px] sm:h-[400px] md:h-[440px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="relative h-full flex flex-col justify-between max-w-7xl mx-auto px-4">
          {/* Breadcrumb at top */}
          <div className="pt-20 sm:pt-24">
            <NeighborhoodBreadcrumb isHub borough={borough} boroughSlug={boroughSlug} />
          </div>

          {/* Title at bottom */}
          <div className="pb-8 sm:pb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-sans font-semibold text-white tracking-tight">
              {borough} Real Estate Guide
            </h1>
            <p className="mt-2 text-lg text-white/80 font-light max-w-2xl">
              Explore {neighborhoods.length} neighborhoods with market data, featured buildings, and
              broker insights to find your ideal {borough} address.
            </p>
          </div>
        </div>
      </section>

      <main>
        {/* Intro */}
        <section className="py-10 sm:py-14">
          <div className="max-w-3xl mx-auto px-4">
            <p className="text-gray-600 text-base sm:text-lg leading-relaxed">
              {intro}
            </p>
          </div>
        </section>

        {/* Neighborhood Grid */}
        <NeighborhoodHubGrid neighborhoods={neighborhoods} boroughSlug={boroughSlug} />

        {/* Hub FAQ */}
        <section className="py-10 sm:py-14 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-2xl sm:text-3xl font-sans font-semibold text-gray-900 mb-6">
              {borough} Real Estate FAQ
            </h2>
            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <details
                  key={i}
                  className="group bg-white rounded-lg border border-gray-200"
                >
                  <summary className="flex items-center justify-between gap-4 cursor-pointer px-5 py-4 text-sm sm:text-base font-medium text-gray-900 select-none">
                    {faq.name}
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-gray-400 group-open:rotate-45 transition-transform text-lg"
                    >
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-4 text-sm sm:text-base text-gray-600 leading-relaxed">
                    {faq.acceptedAnswer.text}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-10 sm:py-14">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-2xl sm:text-3xl font-sans font-semibold text-gray-900 mb-3">
              Find Your {borough} Home
            </h2>
            <p className="text-gray-500 mb-8 max-w-xl mx-auto">
              Search all active {borough} listings or speak with our team for
              personalized guidance.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={`/buy?borough=${borough}`}
                className="inline-block px-8 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-sm sm:text-base"
              >
                Search {borough} Listings
              </Link>
              <Link
                href="/contact"
                className="inline-block px-8 py-3 border border-gray-900 text-gray-900 font-medium rounded-lg hover:bg-gray-900 hover:text-white transition-colors text-sm sm:text-base"
              >
                Get a Free Consultation
              </Link>
            </div>
          </div>
        </section>
      </main>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <IDXDisclaimer variant="compact" />
      </div>

      <SocialShareBar title={`${borough} Neighborhoods | Mallan Real Estate`} />
      <Footer />

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}
